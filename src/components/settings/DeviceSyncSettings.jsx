import { useState, useEffect, useCallback } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  RefreshCw, FolderOpen, Loader2, Smartphone, Monitor, Check,
  AlertTriangle, Trash2, Info, Link2, FileWarning, Palette,
} from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";
import { getSyncAdapter } from "@/lib/syncAdapters";
import { getDeviceName, setDeviceName, getDeviceId } from "@/lib/deviceSync";
import {
  getSyncFolder, setSyncFolder, pickSyncFolder, runSync, listSyncPeers, getLastRun,
  isAutoSyncOn, setAutoSync, getPendingDeletions, keepPendingDeletion, pairSystem,
  removeSyncFile, copyAppearanceFrom,
} from "@/lib/deviceSyncRunner";
import { isEncryptionActive } from "@/lib/localDb";

// Device sync — files only, no network. See src/lib/deviceSync.js.
//
// The flow this is built around: plug the phone into the computer, point
// the desktop at the phone's storage, hit sync. Nothing leaves the two
// devices, because nothing here can open a connection in the first place.

const fmtWhen = (iso) => {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString();
};

export default function DeviceSyncSettings() {
  const t = useTerms();
  const queryClient = useQueryClient();
  const adapter = getSyncAdapter();

  const [folder, setFolder] = useState(getSyncFolder());
  const [folderDraft, setFolderDraft] = useState("");
  const [name, setName] = useState(getDeviceName());
  const [auto, setAuto] = useState(isAutoSyncOn());
  const [busy, setBusy] = useState(false);
  const [peers, setPeers] = useState([]);
  const [report, setReport] = useState(null);
  const [lastRun, setLastRun] = useState(getLastRun());
  const [pending, setPending] = useState([]);
  // Newest first: when one device left snapshots for two systems (e.g. an
  // old system from before a reinstall), the one it's using today is on top.
  const unpaired = peers
    .filter((p) => !p.isSelf && !p.sameSystem && !p.paired)
    .sort((a, b) => (b.data?.mtimeMs || 0) - (a.data?.mtimeMs || 0));

  const refreshPeers = useCallback(async () => {
    if (!adapter.available) return;
    if (!folder && adapter.canPickFolder) { setPeers([]); return; }
    try { setPeers(await listSyncPeers()); } catch { setPeers([]); }
  }, [adapter, folder]);

  useEffect(() => { refreshPeers(); }, [refreshPeers]);
  useEffect(() => { setPending(getPendingDeletions()); }, [report]);

  const handlePick = async () => {
    try {
      const picked = await pickSyncFolder();
      if (picked) {
        setFolder(picked);
        toast.success("Sync folder set.");
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't pick a folder.");
    }
  };

  const handleSync = async (force = false) => {
    setBusy(true);
    setReport(null);
    try {
      const res = await runSync({ force });
      setReport(res);
      setLastRun(res.finishedAt || getLastRun());
      // Everything on screen is driven by react-query; without this the
      // merge is invisible until the user navigates.
      queryClient.invalidateQueries();
      await refreshPeers();
      const n = res.merged.length;
      const bad = res.unreadable?.length || 0;
      if (res.errors.length && !n) toast.error(res.errors[0].message);
      else if (n) toast.success(`Synced with ${n} device${n === 1 ? "" : "s"}.`);
      else if (bad) {
        // Don't report "nothing new" when files were skipped — that was
        // the bug: a damaged snapshot read as everything being fine.
        toast.error(`${bad} snapshot${bad === 1 ? "" : "s"} couldn't be read — see below.`);
      } else if (res.needsPairing?.length) {
        toast.message("Another device is here but isn't paired yet — pair it below.");
      } else {
        // Auto-sync runs every 30s, so a manual press often finds the
        // work already done. Say that, rather than implying nothing
        // arrived at all.
        toast.success("Already up to date — nothing new since the last sync.");
      }
    } catch (e) {
      toast.error(e?.message || "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHere = async (d) => {
    try {
      await base44.entities[d.entity].delete(d.id);
      keepPendingDeletion(d.entity, d.id);
      setPending(getPendingDeletions());
      queryClient.invalidateQueries();
      toast.success("Deleted here too — it's still in Recent changes if you want it back.");
    } catch (e) {
      toast.error(e?.message || "Couldn't delete that.");
    }
  };

  const handleCopyLook = async (peer) => {
    const ok = await confirm({
      title: "Use this device's look here?",
      body: "Its theme, fonts and layout replace this device's. Your current layout goes to Recent changes, so you can put it back.",
      confirmLabel: "Use look",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { applied, layoutFields, from } = await copyAppearanceFrom({ key: peer.key });
      const parts = [applied && `${applied} appearance setting${applied === 1 ? "" : "s"}`, layoutFields && `${layoutFields} layout setting${layoutFields === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
      toast.success(`Copied ${parts || "appearance"} from ${from}. Restart to see them.`);
    } catch (e) {
      toast.error(e?.message || "Couldn't copy appearance.");
    } finally {
      setBusy(false);
    }
  };

  const handleKeep = (d) => {
    keepPendingDeletion(d.entity, d.id);
    setPending(getPendingDeletions());
  };

  if (!adapter.available) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Sync between your devices</h3>
        <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{adapter.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Sync between your devices</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Plug your phone into your computer and point this at its storage, or use a USB stick.
          Your {t.system}&apos;s data is copied between the two devices as files — nothing is sent
          anywhere, and there is no server involved.
        </p>
      </div>

      {/* This device */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          {adapter.id === "electron" ? <Monitor className="w-4 h-4 text-primary" /> : <Smartphone className="w-4 h-4 text-primary" />}
          <span className="text-sm font-medium">This device</span>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { setDeviceName(name); setName(getDeviceName()); }}
          placeholder="Name this device"
          aria-label="Name this device"
        />
        <p className="text-[0.6875rem] text-muted-foreground font-mono">id {getDeviceId().slice(0, 8)}</p>
      </div>

      {/* Where */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <p className="text-sm font-medium">{adapter.canPickFolder ? "Sync folder" : "Sync location"}</p>
        {adapter.canPickFolder ? (
          <>
            <p className="text-xs text-muted-foreground break-all">{adapter.describeFolder?.(folder) || folder || "Not chosen yet"}</p>
            <Button type="button" variant="outline" size="sm" onClick={handlePick} className="gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" /> {folder ? "Change folder" : "Choose folder"}
            </Button>
            {/* Paste-a-path as well as the picker: a phone mounted over USB
                lands somewhere like
                /run/user/1000/gvfs/mtp:host=.../Internal storage/Documents,
                which is awkward to click through and which some file
                dialogs don't list at all. Desktop only — on Android the
                system picker is the only way to grant a folder. */}
            {adapter.canPastePath && <div className="flex gap-2 pt-1">
              <Input
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder="…or paste a folder path"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                aria-label="Paste a folder path"
                className="text-xs"
              />
              <Button
                type="button" variant="outline" size="sm"
                disabled={!folderDraft.trim()}
                onClick={() => {
                  const v = folderDraft.trim();
                  setSyncFolder(v);
                  setFolder(v);
                  setFolderDraft("");
                  toast.success("Sync folder set.");
                }}
              >
                Use
              </Button>
            </div>}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {adapter.folderLabel} — reachable from a computer over USB.
          </p>
        )}
      </div>

      {/* Act */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => handleSync(false)} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync now
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => handleSync(true)} disabled={busy}>
          Re-read everything
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">Last synced {fmtWhen(lastRun)}</span>
      </div>


      <label className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <Switch checked={auto} onCheckedChange={(v) => { setAuto(v); setAutoSync(v); }} />
        <span className="flex-1 text-sm">Sync automatically while the app is open</span>
      </label>

      {isEncryptionActive() && (
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          Your snapshots are encrypted, because this device is. The other device needs the same passphrase to read them.
        </p>
      )}

      {/* A device in this folder belongs to a different {system}. Two
          devices set up separately always differ, so this is the normal
          first-time case — but it is confirmed rather than assumed, so a
          multi-system user can't blend two systems by accident. */}
      {unpaired.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Link2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium">Another device is using a different {t.system}</p>
              <p className="text-muted-foreground">
                That&apos;s expected the first time — each device makes its own {t.system} id when
                it&apos;s set up. Pair them and their data will merge from now on. Only do this if
                it&apos;s really your own {t.system}.
              </p>
            </div>
          </div>
          {unpaired.map((p) => (
            <div key={p.key} className="flex items-center gap-2 text-xs rounded border border-border/60 bg-card p-2">
              <span className="flex-1 min-w-0 truncate">
                <span className="font-mono text-muted-foreground">{p.deviceId.slice(0, 8)} · {t.system} {String(p.systemId).slice(0, 8)}</span>
                <span className="block text-muted-foreground">
                  {p.data ? `updated ${fmtWhen(new Date(p.data.mtimeMs).toISOString())}` : "no data file"}
                </span>
              </span>
              <Button
                type="button" size="sm" className="h-6 px-2"
                onClick={async () => {
                  pairSystem(p.systemId);
                  await refreshPeers();
                  toast.success("Paired — syncing now.");
                  handleSync(true);
                }}
              >
                Pair
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Devices seen */}
      {peers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Devices in this folder</p>
          {peers.map((p) => (
            <div key={p.key} className="flex items-center gap-2 text-xs rounded-lg border border-border/60 p-2">
              <span className="font-mono text-muted-foreground">{p.deviceId.slice(0, 8)} · {String(p.systemId).slice(0, 8)}</span>
              {p.isSelf && <span className="text-muted-foreground">(this device)</span>}
              <span className="ml-auto text-muted-foreground">
                {p.data ? fmtWhen(new Date(p.data.mtimeMs).toISOString()) : "no data file"}
              </span>
              {/* Appearance never syncs on its own; this is the explicit,
                  per-device way to take another device's look + layout. */}
              {!p.isSelf && p.data && (p.sameSystem || p.paired) && (
                <Button
                  type="button" variant="outline" size="sm" className="h-6 px-2 gap-1"
                  disabled={busy}
                  aria-label={`Use the appearance of device ${p.deviceId.slice(0, 8)}`}
                  onClick={() => handleCopyLook(p)}
                >
                  <Palette className="w-3 h-3" /> Use look
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {report && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
          {report.merged.length === 0 && report.errors.length === 0 && (
            <p className="text-muted-foreground">Nothing new to bring in.</p>
          )}
          {report.merged.map((m) => (
            <p key={m.key || m.deviceId}>Merged from <span className="font-medium">{m.name}</span>.</p>
          ))}
          {(report.media.images > 0 || report.media.fonts > 0) && (
            <p className="text-muted-foreground">
              {report.media.images} image{report.media.images === 1 ? "" : "s"}
              {report.media.fonts > 0 ? `, ${report.media.fonts} font${report.media.fonts === 1 ? "" : "s"}` : ""} brought over.
            </p>
          )}
          {report.presetsAdded?.length > 0 && (
            <p className="text-muted-foreground">
              {report.presetsAdded.length} appearance preset{report.presetsAdded.length === 1 ? "" : "s"} brought over: {report.presetsAdded.join(", ")}.
            </p>
          )}
          {report.conflicts.length > 0 && (
            <p className="text-muted-foreground">
              {report.conflicts.length} item{report.conflicts.length === 1 ? "" : "s"} existed on both devices —
              the more recent edit was kept.
            </p>
          )}
          {report.errors.map((e, i) => (
            <p key={i} className="text-destructive">{e.message}</p>
          ))}
        </div>
      )}

      {/* Snapshots that couldn't be read. Almost always a leftover from a
          device that was reinstalled (a new install means a new id, so its
          old file stays in the folder forever) or one cut off mid-write.
          Nothing is wrong with YOUR data — the file just can't be used. */}
      {report?.unreadable?.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-start gap-2">
            <FileWarning className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium">Some snapshots in the folder couldn&apos;t be read</p>
              <p className="text-muted-foreground">
                Usually left behind by a device that was reinstalled, or a copy that was
                interrupted. Everything else synced normally — removing these just tidies the
                folder, and nothing on either device is touched.
              </p>
            </div>
          </div>
          {report.unreadable.map((u) => (
            <div key={u.name} className="flex items-center gap-2 text-xs rounded border border-border/60 p-2">
              <span className="flex-1 min-w-0 truncate font-mono text-muted-foreground" title={`${u.name} — ${u.reason}`}>
                {u.name.replace(/^symphony-sync-/, "").slice(0, 34)}…
              </span>
              <Button
                type="button" variant="ghost" size="sm" className="h-6 px-2"
                onClick={async () => {
                  try {
                    await removeSyncFile(u.name);
                    toast.success("Removed.");
                    setReport({ ...report, unreadable: report.unreadable.filter((x) => x.name !== u.name) });
                    await refreshPeers();
                  } catch (e) {
                    toast.error(e?.message || "Couldn't remove that file.");
                  }
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Deletions — reported, never applied. */}
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium">Deleted on another device, still here</p>
              <p className="text-muted-foreground">
                Sync never deletes anything on its own. These are still safe on this device — remove them
                only if you meant to.
              </p>
            </div>
          </div>
          <div className="space-y-1">
            {pending.slice(0, 20).map((d) => (
              <div key={`${d.entity}:${d.id}`} className="flex items-center gap-2 text-xs rounded border border-border/60 bg-card p-2">
                <span className="flex-1 min-w-0 truncate" title={`${d.entity} · ${d.label}`}>
                  <span className="text-muted-foreground">{d.entity}</span> · {d.label}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => handleKeep(d)}>
                  Keep
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-6 px-2 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteHere(d)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {pending.length > 20 && (
              <p className="text-[0.6875rem] text-muted-foreground">+{pending.length - 20} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
