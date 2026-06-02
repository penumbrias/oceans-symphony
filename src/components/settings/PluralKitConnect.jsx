import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Link2, Unlink, ArrowDownLeft, ArrowUpRight, AlertTriangle, ShieldAlert } from "lucide-react";
import { base44, localEntities } from "@/api/base44Client";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import {
  getOwnSystem,
  getMembers,
  getGroups,
  getSwitches,
  mapPkMemberToAlter,
  exportAltersToPluralKit,
} from "@/lib/pluralKit";

// Download a remote image and return a data URL. Returns null on any
// failure (CORS, 404, network, expired Discord signed URL, etc). We
// deliberately don't pass credentials and we use mode:cors so the
// browser fetches with the canonical CORS dance — pluralkit.me serves
// the right Access-Control-Allow-Origin headers, Discord's CDN does not
// (so we'll just keep the URL as a fallback for those).
async function fetchImageAsDataUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("http")) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function isDiscordCdnUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith("discordapp.com") || u.hostname.endsWith("discord.com") || u.hostname.endsWith("discordapp.net");
  } catch {
    return false;
  }
}

// PluralKit integration — connect, import members + switches, export
// local alters back to PK.
//
// Security posture (also explained inline in the UI):
// - The token is stored on the SystemSettings entity in IndexedDB. If
//   the user has Storage Mode encryption enabled, the entire DB is
//   AES-GCM-encrypted at rest and so is the token.
// - The token is sent only to api.pluralkit.me, in the Authorization
//   header. Never logged, never persisted in any other form.
// - Export shows a confirm step with a count before any writes fire.
// - If encryption is OFF we surface a one-time inline notice.
export default function PluralKitConnect({ settings, onSettingsChange }) {
  const qc = useQueryClient();
  const isConnected = !!(settings?.pk_token);
  const encryptionOn = isEncryptionEnabled();

  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");

  // Switch-history range. Default last 30 days. PK switches only go back
  // as far as PK itself has records.
  const [switchDays, setSwitchDays] = useState(30);

  // How the member import reconciles with what's already here (mirrors the
  // Simply Plural connector):
  //   standard    — update matched alters in place + add new ones (default)
  //   new_only     — only add members that aren't here yet; never touch existing
  //   replace_all  — delete all local alters first, then recreate from PK
  const [importMode, setImportMode] = useState("standard");

  const handleConnect = async () => {
    const t = token.trim();
    if (!t) return;
    setConnecting(true);
    try {
      const sys = await getOwnSystem(t);
      if (!sys?.id) throw new Error("Token didn't resolve to a system.");
      const data = {
        pk_token: t,
        pk_system_id: sys.id,
        pk_system_name: sys.name || "",
        pk_last_sync: null,
        // PluralKit systems carry a system-level `avatar_url`. Mirror it
        // into our system avatar so the bulletin / poll "System" author
        // gets the user's PK system picture on connect. Only overwrite
        // when PK has one — leave the local choice alone otherwise.
        ...(sys.avatar_url ? { system_avatar_url: sys.avatar_url } : {}),
        // Same for the system name: only fill it in when PK has a name
        // AND the user hasn't already set one locally, so we don't stomp
        // on a system name they typed by hand earlier.
        ...(sys.name && !settings?.system_name ? { system_name: sys.name } : {}),
      };
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, data);
      } else {
        await base44.entities.SystemSettings.create(data);
      }
      onSettingsChange?.();
      setToken("");
      toast.success(`Connected to ${sys.name || "PluralKit"}`);
    } catch (e) {
      toast.error(e.message || "Couldn't connect — is your token correct?");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, {
          pk_token: "",
          pk_system_id: "",
          pk_system_name: "",
        });
      }
      onSettingsChange?.();
      toast.success("Disconnected from PluralKit");
    } catch (e) {
      toast.error(e.message || "Disconnect failed.");
    }
  };

  // ── Import members ──────────────────────────────────────────────────────
  const handleImportMembers = async () => {
    if (!settings?.pk_token) return;
    if (importMode === "replace_all" &&
      !window.confirm("Replace all: this DELETES your current local alters and recreates them from PluralKit. Local-only alters, per-alter notes and relationships tied to deleted alters will be lost. Continue?")) {
      return;
    }
    setWorking(true);
    setProgress("Fetching members…");
    try {
      const [members, groups] = await Promise.all([
        getMembers(settings.pk_token),
        getGroups(settings.pk_token),
      ]);
      // Build memberId → [{id, name, color}] map from the groups payload.
      const groupsByMemberId = {};
      for (const g of groups || []) {
        for (const mid of g.members || []) {
          if (!groupsByMemberId[mid]) groupsByMemberId[mid] = [];
          groupsByMemberId[mid].push({ id: g.id, name: g.name, color: g.color ? `#${g.color}` : "" });
        }
      }

      setProgress(`Upserting ${members.length} ${members.length === 1 ? "member" : "members"}…`);
      const existing = await localEntities.Alter.list();
      const byPkId = Object.fromEntries(
        existing.filter((a) => a.pk_id).map((a) => [a.pk_id, a])
      );
      const byPkUuid = Object.fromEntries(
        existing.filter((a) => a.pk_uuid).map((a) => [a.pk_uuid, a])
      );
      // Name fallback (lowercased/trimmed, first match wins). This is what
      // heals the "doubling" bug: alters imported from Simply Plural carry
      // only an sp_id (no pk_id), so a PK import keyed solely on pk_id never
      // matched them and re-created every member. Matching by name lets the
      // PK import recognise those rows and UPDATE them (backfilling pk_id /
      // pk_uuid so all future imports from either source update in place).
      const byName = {};
      for (const a of existing) {
        const key = (a.name || "").trim().toLowerCase();
        if (key && !(key in byName)) byName[key] = a;
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let matchedByName = 0;
      let avatarsCached = 0;
      let avatarsSkippedDiscord = 0;
      let avatarsFailed = 0;

      // Replace-all: clear local alters first, then recreate everything from
      // PK (so matching is moot — every member becomes a fresh create).
      if (importMode === "replace_all") {
        setProgress(`Removing ${existing.length} existing ${existing.length === 1 ? "alter" : "alters"}…`);
        for (const a of existing) {
          try { await localEntities.Alter.delete(a.id); } catch { /* keep going */ }
        }
      }

      for (let i = 0; i < members.length; i += 1) {
        const m = members[i];
        setProgress(`Upserting ${i + 1} of ${members.length}: ${m.name || "(unnamed)"}…`);
        const mapped = mapPkMemberToAlter(m, groupsByMemberId);

        // Avatar handling: download the image into local image storage so
        // it survives Discord CDN signed-URL expiration and works offline.
        // - pluralkit.me URLs are CORS-friendly and download fine.
        // - cdn.discordapp.com URLs are NOT CORS-friendly and also expire
        //   under Discord's signed-URL policy — fetching them just fails.
        //   Skip those explicitly and surface the count to the user so
        //   they know to re-upload in PluralKit (which migrates them to
        //   pluralkit.me CDN, which DOES work).
        if (mapped.avatar_url && mapped.avatar_url.startsWith("http")) {
          if (isDiscordCdnUrl(mapped.avatar_url)) {
            // Don't even try — Discord blocks cross-origin fetch and the
            // URL likely 403s anyway. Leave the remote URL in place as a
            // breadcrumb but flag the count.
            avatarsSkippedDiscord += 1;
          } else {
            const dataUrl = await fetchImageAsDataUrl(mapped.avatar_url);
            if (dataUrl) {
              const imageId = `pk-avatar-${m.id}`;
              try {
                await saveLocalImage(imageId, dataUrl);
                mapped.avatar_url = createLocalImageUrl(imageId);
                avatarsCached += 1;
              } catch {
                avatarsFailed += 1;
              }
            } else {
              avatarsFailed += 1;
            }
          }
        }

        // Match priority: permanent uuid → short pk_id → name fallback.
        // (Skipped entirely in replace_all — we deleted everything above.)
        const nameKey = (m.name || "").trim().toLowerCase();
        const byUuid = (importMode !== "replace_all" && m.uuid) ? byPkUuid[m.uuid] : null;
        const byId = importMode !== "replace_all" ? byPkId[m.id] : null;
        const byNm = (importMode !== "replace_all" && !byUuid && !byId && nameKey) ? byName[nameKey] : null;
        const match = byUuid || byId || byNm;
        // "Only add new" — a matched member is left untouched.
        if (match && importMode === "new_only") {
          if (byNm) delete byName[nameKey];
          skipped += 1;
          continue;
        }
        if (match) {
          if (byNm) {
            matchedByName += 1;
            // Consume this existing row so a second PK member with the same
            // name creates a new alter rather than clobbering the same one.
            delete byName[nameKey];
          }
          // Merge custom_fields: preserve local-only `_*` keys (profile-
          // style settings like _bg_color, _hide_header, …) while letting
          // PK authoritatively set `_header_image` from the banner.
          const localOnly = Object.fromEntries(
            Object.entries(match.custom_fields || {}).filter(([k]) => k.startsWith("_"))
          );
          mapped.custom_fields = { ...localOnly, ...(mapped.custom_fields || {}) };
          // Never un-archive on re-import — preserve the local archive flag
          // (the mapper hardcodes is_archived:false for the create path only).
          const { is_archived, ...updatePayload } = mapped;
          await localEntities.Alter.update(match.id, updatePayload);
          updated += 1;
        } else {
          await localEntities.Alter.create(mapped);
          created += 1;
        }
      }
      await base44.entities.SystemSettings.update(settings.id, { pk_last_sync: new Date().toISOString() });
      onSettingsChange?.();
      qc.invalidateQueries({ queryKey: ["alters"] });
      const summary = [
        `${created} created`,
        `${updated} updated`,
        skipped > 0 ? `${skipped} left as-is` : null,
        matchedByName > 0 ? `${matchedByName} matched by name` : null,
        avatarsCached > 0 ? `${avatarsCached} avatars cached locally` : null,
      ].filter(Boolean).join(" · ");
      toast.success(`Import complete · ${summary}`);
      if (matchedByName > 0) {
        toast.info(
          `${matchedByName} existing ${matchedByName === 1 ? "alter was" : "alters were"} linked to PluralKit by name (e.g. imported from Simply Plural). Future imports will update them in place instead of duplicating.`,
          { duration: 11000 }
        );
      }
      if (avatarsSkippedDiscord > 0) {
        toast.warning(
          `${avatarsSkippedDiscord} ${avatarsSkippedDiscord === 1 ? "avatar is" : "avatars are"} still on Discord's CDN and won't display. Re-upload them in PluralKit (which migrates them to pluralkit.me) and run import again.`,
          { duration: 12000 }
        );
      } else if (avatarsFailed > 0) {
        toast.warning(
          `${avatarsFailed} ${avatarsFailed === 1 ? "avatar" : "avatars"} couldn't be downloaded — kept the remote URL as a fallback.`,
          { duration: 8000 }
        );
      }
    } catch (e) {
      toast.error(e.message || "Import failed.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  };

  // ── Import switches ─────────────────────────────────────────────────────
  const handleImportSwitches = async () => {
    if (!settings?.pk_token) return;
    setWorking(true);
    setProgress("Fetching switch history…");
    try {
      const earliest = Date.now() - switchDays * 24 * 60 * 60 * 1000;
      const switches = await getSwitches(settings.pk_token, "@me", { earliest, max: 1000 });

      // Match PK member IDs → local alter ids via pk_id anchor.
      const alters = await localEntities.Alter.list();
      const alterByPkId = Object.fromEntries(
        alters.filter((a) => a.pk_id).map((a) => [a.pk_id, a])
      );

      // PK switches are point-in-time (timestamp + members[]). Build
      // FrontingSession ranges by pairing each switch with the next.
      // Each row is one alter per session (matches the new individual
      // FrontingSession model).
      const sorted = [...switches].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const existingSessions = await base44.entities.FrontingSession.list("-start_time", 1000);
      const existingKeys = new Set(
        existingSessions.map((s) => `${s.alter_id}|${s.start_time}`)
      );

      let created = 0;
      let skipped = 0;
      let unmatched = 0;
      for (let i = 0; i < sorted.length; i += 1) {
        const sw = sorted[i];
        const start = new Date(sw.timestamp).toISOString();
        const end = i + 1 < sorted.length ? new Date(sorted[i + 1].timestamp).toISOString() : null;
        const memberIds = sw.members || [];
        for (let j = 0; j < memberIds.length; j += 1) {
          const localAlter = alterByPkId[memberIds[j]];
          if (!localAlter) { unmatched += 1; continue; }
          const key = `${localAlter.id}|${start}`;
          if (existingKeys.has(key)) { skipped += 1; continue; }
          await base44.entities.FrontingSession.create({
            alter_id: localAlter.id,
            start_time: start,
            end_time: end,
            is_active: end === null,
            // PluralKit has no documented "primary" concept — members in a
            // switch are an unordered set, not a primary + co-fronters.
            // Import everyone as a co-fronter; the user can promote one to
            // primary manually if they want. Matches simplyPlural.js.
            is_primary: false,
            source: "pluralkit",
          });
          existingKeys.add(key);
          created += 1;
        }
      }
      qc.invalidateQueries({ queryKey: ["frontHistory"] });
      qc.invalidateQueries({ queryKey: ["alters"] });
      const parts = [`${created} sessions`];
      if (skipped) parts.push(`${skipped} already existed`);
      if (unmatched) parts.push(`${unmatched} skipped (no matching local alter — import members first)`);
      toast.success(`Switch import complete · ${parts.join(" · ")}`);
    } catch (e) {
      toast.error(e.message || "Switch import failed.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  };

  // ── Export to PluralKit ────────────────────────────────────────────────
  const [exportConfirm, setExportConfirm] = useState(false);
  const handleExport = async () => {
    if (!settings?.pk_token) return;
    if (!exportConfirm) {
      setExportConfirm(true);
      setTimeout(() => setExportConfirm(false), 5000);
      return;
    }
    setExportConfirm(false);
    setWorking(true);
    setProgress("Preparing export…");
    try {
      const alters = (await localEntities.Alter.list()).filter((a) => !a.is_archived);
      const { created, updated, failed } = await exportAltersToPluralKit(
        settings.pk_token,
        alters,
        setProgress
      );
      // Write the new pk_ids back to the local records so subsequent
      // exports PATCH instead of creating a duplicate.
      for (const { alterId, pkId } of created) {
        await localEntities.Alter.update(alterId, { pk_id: pkId });
      }
      qc.invalidateQueries({ queryKey: ["alters"] });
      const parts = [`${created.length} created`, `${updated.length} updated`];
      if (failed.length) parts.push(`${failed.length} failed`);
      toast.success(`Export complete · ${parts.join(" · ")}`);
      if (failed.length) {
        // Surface the first failure's reason so the user isn't left guessing
        // (pkFetch already redacts any token-shaped string from errors).
        const first = failed[0];
        toast.warning(
          `${failed.length} ${failed.length === 1 ? "alter" : "alters"} couldn't be sent${first?.name ? ` (e.g. "${first.name}")` : ""}.${first?.error ? ` PluralKit said: ${first.error}` : ""}`,
          { duration: 11000 }
        );
        // eslint-disable-next-line no-console
        console.warn("PluralKit export — failed entries:", failed);
      } else if (created.length === 0 && updated.length === 0) {
        toast.info("Nothing to export — no active (non-archived) alters found.");
      }
    } catch (e) {
      toast.error(e.message || "Export failed.");
    } finally {
      setWorking(false);
      setProgress("");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">PluralKit</CardTitle>
            <CardDescription>
              Import members &amp; switch history from PluralKit, and export local alters back.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-foreground/90 leading-relaxed">
                Your PluralKit token gives <strong>full read &amp; write</strong> access to your system — PK has no read-only token. If you ever paste it somewhere unsafe, run <code className="font-mono bg-muted px-1 rounded">pk;token refresh</code> on Discord to invalidate it. The token will only be stored on this device and sent only to api.pluralkit.me.
              </p>
            </div>
            {!encryptionOn && (
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p>
                  Storage encryption is currently <strong>off</strong>. The token will be stored unencrypted alongside the rest of your data on this device. Consider turning on encryption in <em>Storage Mode</em> before connecting.
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="pk-token" className="text-xs">PluralKit token</Label>
              <Input
                id="pk-token"
                type="password"
                placeholder="Paste your pk;token output here"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="text-sm mt-1"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                In Discord, send <code className="font-mono bg-muted px-1 rounded">pk;token</code> in a DM to PluralKit and paste the response above.
              </p>
            </div>
            <Button onClick={handleConnect} disabled={!token.trim() || connecting} className="w-full">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect"}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Status */}
            <div>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-foreground font-medium">Connected</span>
                {settings.pk_system_name && (
                  <span className="text-muted-foreground">· {settings.pk_system_name}</span>
                )}
                {settings.pk_system_id && (
                  <span className="text-muted-foreground/60 text-xs font-mono">{settings.pk_system_id.slice(0, 8)}…</span>
                )}
              </div>
              {settings.pk_last_sync && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last synced: {new Date(settings.pk_last_sync).toLocaleString()}
                </p>
              )}
              <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-1">
                🔒 Token stored on this device only{encryptionOn ? ", encrypted at rest" : " (storage encryption is OFF)"}.
              </p>
            </div>

            {/* Import members */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                <h4 className="font-medium text-sm">Import members &amp; groups</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Members on PK are matched to your local alters by their PluralKit id (or name), then handled per the mode below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {[
                  { id: "standard", label: "Update + add new", desc: "Update matched alters, add any new ones." },
                  { id: "new_only", label: "Only add new", desc: "Leave existing alters untouched; only bring in ones you don't have." },
                  { id: "replace_all", label: "Replace all", desc: "Delete local alters and recreate from PluralKit." },
                ].map((opt) => {
                  const active = importMode === opt.id;
                  const danger = opt.id === "replace_all";
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setImportMode(opt.id)}
                      className={`rounded-lg border p-2 text-left transition-all ${
                        active
                          ? (danger ? "border-destructive/60 bg-destructive/10" : "border-primary/60 bg-primary/10")
                          : "border-border/50 bg-card hover:bg-muted/30"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${active ? (danger ? "text-destructive" : "text-primary") : "text-foreground"}`}>{opt.label}</p>
                      <p className="text-[0.6875rem] text-muted-foreground leading-snug mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
              <Button onClick={handleImportMembers} disabled={working} size="sm" variant="outline">
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import members from PluralKit"}
              </Button>
            </div>

            {/* Import switches */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                <h4 className="font-medium text-sm">Import switch history</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Only switches involving members already imported into Oceans Symphony are kept. Import members first.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="pk-switch-days" className="text-xs">Range:</Label>
                <select
                  id="pk-switch-days"
                  value={switchDays}
                  onChange={(e) => setSwitchDays(parseInt(e.target.value, 10))}
                  className="text-xs border rounded-md px-2 py-1 bg-card"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 3 months</option>
                  <option value={365}>Last year</option>
                  <option value={3650}>All time (slow)</option>
                </select>
                <Button onClick={handleImportSwitches} disabled={working} size="sm" variant="outline">
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import switches"}
                </Button>
              </div>
            </div>

            {/* Export */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                <h4 className="font-medium text-sm">Export to PluralKit</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Sends your local alters to PluralKit. Alters previously imported from PK get their PK profile <strong>updated</strong>; new local alters get <strong>created</strong> on PK. Archived alters and switches are NOT exported. Avatars/banners only transfer if they're public web URLs — locally-uploaded images can't be reached by PluralKit, so they're skipped (everything else still sends). Two-tap confirm to prevent accidents.
              </p>
              <Button
                onClick={handleExport}
                disabled={working}
                size="sm"
                variant={exportConfirm ? "destructive" : "default"}
                className="w-full sm:w-auto"
              >
                {working ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : exportConfirm ? (
                  "Tap again to export →"
                ) : (
                  "Export to PluralKit"
                )}
              </Button>
            </div>

            {progress && (
              <p className="text-xs text-muted-foreground italic">{progress}</p>
            )}

            {/* Disconnect */}
            <div className="border-t pt-4">
              <Button onClick={handleDisconnect} variant="ghost" size="sm" className="text-muted-foreground">
                <Unlink className="w-3.5 h-3.5 mr-1" /> Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
