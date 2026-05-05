import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, Link2, Unlink, ArrowDownLeft, Clock, Vote, FileText } from "lucide-react";
import { base44, localEntities } from "@/api/base44Client";
import {
  getSystemId,
  getSystemUser,
  getMembers,
  getGroups,
  getCustomFields,
  getFrontHistory,
  getPolls,
  getMemberNotes,
  spFieldType,
  mapMemberToAlter,
  mapGroupToLocalGroup,
  mapFrontHistoryEntry,
  mapSPPoll,
  mapSPMemberNote,
} from "@/lib/simplyPlural";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { isLocalMode } from "@/lib/storageMode";

// ── Date preset helpers ──────────────────────────────────────────────────────
const PRESETS = [
  { label: "30d",   ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "3mo",   ms: 90 * 24 * 60 * 60 * 1000 },
  { label: "1yr",   ms: 365 * 24 * 60 * 60 * 1000 },
  { label: "All",   ms: null },
];

function toDateInputValue(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function fromDateInputValue(str) {
  return new Date(str).getTime();
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SimplyPluralConnect({ settings, onSettingsChange }) {
  const localMode = isLocalMode();
  const queryClient = useQueryClient();

  // Connection
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Members/groups/polls/notes import
  const [importMode, setImportMode] = useState("standard");
  const [includePolls, setIncludePolls] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importProgress, setImportProgress] = useState("");

  // Front history import
  const [historyFrom, setHistoryFrom] = useState(() => toDateInputValue(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const [historyTo, setHistoryTo] = useState(() => toDateInputValue(Date.now()));
  const [importingHistory, setImportingHistory] = useState(false);
  const [historyProgress, setHistoryProgress] = useState("");

  const effectiveSettings = settings;
  const isConnected = !!effectiveSettings?.sp_token;

  // ── Connect ────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const systemId = await getSystemId(token.trim());
      const systemUser = await getSystemUser(token.trim(), systemId);
      const systemName = systemUser?.username || systemUser?.name || "";
      const systemDescription = systemUser?.desc || systemUser?.description || "";

      const spData = { sp_token: token.trim(), sp_system_id: systemId, system_name: systemName, system_description: systemDescription };
      if (effectiveSettings?.id) {
        await base44.entities.SystemSettings.update(effectiveSettings.id, spData);
      } else {
        await base44.entities.SystemSettings.create(spData);
      }
      setToken("");
      onSettingsChange();
      toast.success("Connected to Simply Plural");
    } catch (e) {
      toast.error(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  // ── Members / Groups / Polls / Notes import ────────────────────────────────
  const handleImport = async () => {
    if (!effectiveSettings?.sp_token || !effectiveSettings?.sp_system_id) return;
    setSyncing(true);
    setImportProgress("");
    try {
      if (localMode) {
        const { sp_token: tok, sp_system_id: sysId } = effectiveSettings;

        // ── Step 1: Fetch ──
        setImportProgress("Fetching members…");
        const members = await getMembers(tok, sysId);

        setImportProgress("Fetching groups…");
        const groups = await getGroups(tok, sysId);

        setImportProgress("Fetching custom fields…");
        const spFields = await getCustomFields(tok, sysId);

        const groupsById = {};
        for (const g of groups) {
          const gid = g.id || g._id || "";
          if (gid) groupsById[gid] = g;
        }

        // ── Step 2: Custom fields ──
        setImportProgress("Importing custom fields…");
        const existingFields = await localEntities.CustomField.list();
        const existingFieldsBySpId = {};
        for (const f of existingFields) {
          if (f.sp_id) existingFieldsBySpId[f.sp_id] = f;
        }
        const fieldIdMap = {};
        let fieldsCreated = 0;
        if (importMode === "replace_all") {
          for (const f of existingFields) await localEntities.CustomField.delete(f.id);
        }
        for (const spField of spFields) {
          const spFieldId = spField.id || spField._id || "";
          const fc = spField.content || spField;
          if (!spFieldId) continue;
          const fieldData = { sp_id: spFieldId, name: fc.name || "Unnamed Field", field_type: spFieldType(fc.valueType || fc.type), order: fieldsCreated };
          if (importMode === "replace_all") {
            const created = await localEntities.CustomField.create(fieldData);
            fieldIdMap[spFieldId] = created.id;
            fieldsCreated++;
          } else {
            const existing = existingFieldsBySpId[spFieldId];
            if (existing) {
              fieldIdMap[spFieldId] = existing.id;
              if (importMode !== "new_only") await localEntities.CustomField.update(existing.id, fieldData);
            } else {
              const created = await localEntities.CustomField.create(fieldData);
              fieldIdMap[spFieldId] = created.id;
              fieldsCreated++;
            }
          }
        }

        const mappedAlters = members.map((m) => mapMemberToAlter(m, groupsById, fieldIdMap));

        // ── Step 3: Alters ──
        setImportProgress("Importing alters…");
        const existingAlters = await localEntities.Alter.list();
        let altersCreated = 0, altersUpdated = 0;
        const alterIdBySpId = {};
        if (importMode === "replace_all") {
          for (const a of existingAlters) await localEntities.Alter.delete(a.id);
          for (const a of mappedAlters) {
            const created = await localEntities.Alter.create(a);
            alterIdBySpId[a.sp_id] = created.id;
            altersCreated++;
          }
        } else {
          const existingBySpId = {};
          for (const a of existingAlters) {
            if (a.sp_id) existingBySpId[a.sp_id] = a;
            if (a.sp_id) alterIdBySpId[a.sp_id] = a.id;
          }
          for (const incoming of mappedAlters) {
            const existing = existingBySpId[incoming.sp_id];
            if (existing) {
              if (importMode !== "new_only") {
                await localEntities.Alter.update(existing.id, incoming);
                altersUpdated++;
              }
              alterIdBySpId[incoming.sp_id] = existing.id;
            } else {
              const created = await localEntities.Alter.create(incoming);
              alterIdBySpId[incoming.sp_id] = created.id;
              altersCreated++;
            }
          }
        }

        // ── Step 4: Groups (pass 1) ──
        setImportProgress("Importing groups…");
        const existingGroups = await localEntities.Group.list();
        let groupsCreated = 0, groupsUpdated = 0;
        if (importMode === "replace_all") {
          for (const g of existingGroups) await localEntities.Group.delete(g.id);
        }
        const existingGroupsBySpId = {};
        if (importMode !== "replace_all") {
          for (const g of existingGroups) { if (g.sp_id) existingGroupsBySpId[g.sp_id] = g; }
        }
        const groupIdBySpId = {};
        for (const spGroup of groups) {
          const mapped = mapGroupToLocalGroup(spGroup);
          mapped.parent = "";
          const existing = existingGroupsBySpId[mapped.sp_id];
          if (importMode === "replace_all" || !existing) {
            const created = await localEntities.Group.create(mapped);
            groupIdBySpId[mapped.sp_id] = created.id;
            groupsCreated++;
          } else if (importMode !== "new_only") {
            await localEntities.Group.update(existing.id, { ...mapped, parent: existing.parent });
            groupIdBySpId[mapped.sp_id] = existing.id;
            groupsUpdated++;
          } else {
            groupIdBySpId[mapped.sp_id] = existing.id;
          }
        }

        // ── Step 5: Groups parent resolution (pass 2) ──
        setImportProgress("Resolving group nesting…");
        for (const spGroup of groups) {
          const spId = spGroup.id || spGroup._id || "";
          const c = spGroup.content || spGroup;
          const spParentId = c.parent || "";
          const localGroupId = groupIdBySpId[spId];
          if (!localGroupId) continue;
          const localParentId = spParentId ? groupIdBySpId[spParentId] || "" : "";
          if (localParentId !== undefined) {
            await localEntities.Group.update(localGroupId, { parent: localParentId });
          }
        }

        // ── Step 6: Polls (optional) ──
        let pollsCreated = 0, pollsUpdated = 0;
        if (includePolls) {
          setImportProgress("Importing polls…");
          const spPolls = await getPolls(tok, sysId);
          const existingPolls = await localEntities.Poll.list();
          const pollsBySpId = {};
          for (const p of existingPolls) { if (p.sp_id) pollsBySpId[p.sp_id] = p; }
          for (const spPoll of spPolls) {
            const mapped = mapSPPoll(spPoll, alterIdBySpId);
            if (!mapped.question || mapped.options.length < 2) continue;
            const existing = pollsBySpId[mapped.sp_id];
            if (importMode === "replace_all" || !existing) {
              await localEntities.Poll.create(mapped);
              pollsCreated++;
            } else if (importMode !== "new_only") {
              await localEntities.Poll.update(existing.id, mapped);
              pollsUpdated++;
            }
          }
        }

        // ── Step 7: Member notes (optional) ──
        let notesCreated = 0;
        if (includeNotes) {
          const existingNotes = await localEntities.AlterNote.list();
          const notesBySpId = {};
          for (const n of existingNotes) { if (n.sp_id) notesBySpId[n.sp_id] = n; }
          let processed = 0;
          for (const member of members) {
            const spMemberId = member.id || member._id || "";
            const localAlterId = alterIdBySpId[spMemberId];
            if (!localAlterId) continue;
            processed++;
            setImportProgress(`Importing notes… (${processed}/${members.length})`);
            const spNotes = await getMemberNotes(tok, sysId, spMemberId);
            for (const spNote of spNotes) {
              const mapped = mapSPMemberNote(spNote, localAlterId);
              if (!mapped.content) continue;
              const existing = notesBySpId[mapped.sp_id];
              if (!existing) {
                await localEntities.AlterNote.create(mapped);
                notesCreated++;
              } else if (importMode !== "new_only") {
                await localEntities.AlterNote.update(existing.id, mapped);
              }
            }
          }
        }

        // ── Finish ──
        if (effectiveSettings?.id) {
          await localEntities.SystemSettings.update(effectiveSettings.id, { last_sync: new Date().toISOString() });
        }
        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        queryClient.invalidateQueries({ queryKey: ["customFields"] });
        queryClient.invalidateQueries({ queryKey: ["polls"] });
        setImportProgress("");

        const parts = [
          `Alters: ${altersCreated} new, ${altersUpdated} updated`,
          `Groups: ${groupsCreated} new, ${groupsUpdated} updated`,
          fieldsCreated > 0 && `Fields: ${fieldsCreated} new`,
          includePolls && `Polls: ${pollsCreated} new, ${pollsUpdated} updated`,
          includeNotes && notesCreated > 0 && `Notes: ${notesCreated} imported`,
        ].filter(Boolean).join(" · ");
        toast.success(`Import complete! ${parts}`);
      } else {
        // Cloud mode
        const res = await base44.functions.invoke("importFromSimplyPlural", {
          sp_token: effectiveSettings.sp_token,
          sp_system_id: effectiveSettings.sp_system_id,
          mode: importMode,
        });
        await base44.entities.SystemSettings.update(effectiveSettings.id, { last_sync: new Date().toISOString() });
        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast.success(`Imported: ${res.alters.created} new, ${res.alters.updated} updated alters`);
      }
    } catch (e) {
      setImportProgress("");
      toast.error(e.message || "Import failed");
    } finally {
      setSyncing(false);
    }
  };

  // ── Front history import ───────────────────────────────────────────────────
  const handleImportHistory = async () => {
    if (!effectiveSettings?.sp_token || !effectiveSettings?.sp_system_id) return;
    setImportingHistory(true);
    setHistoryProgress("");
    try {
      const { sp_token: tok, sp_system_id: sysId } = effectiveSettings;
      const startMs = fromDateInputValue(historyFrom);
      const endMs = fromDateInputValue(historyTo) + 86400000; // inclusive of end day

      setHistoryProgress("Fetching front history from Simply Plural…");
      const entries = await getFrontHistory(tok, sysId, startMs, endMs);

      setHistoryProgress("Loading local alters…");
      const existingAlters = await localEntities.Alter.list();
      const alterIdBySpId = {};
      const alterIdByName = {};
      for (const a of existingAlters) {
        if (a.sp_id) alterIdBySpId[a.sp_id] = a.id;
        if (a.name) alterIdByName[a.name.toLowerCase().trim()] = a.id;
      }

      // Fetch SP member list to fill in missing sp_id→localId mappings by name fallback.
      // This handles alters that exist locally but were created manually (no sp_id).
      setHistoryProgress("Matching SP members to local alters…");
      const spMembers = await getMembers(tok, sysId);
      const spMemberNames = {}; // spId → name (for the toast summary)
      for (const m of spMembers) {
        const spId = m.id || m._id || "";
        const c = m.content || m;
        const name = (c.name || "").toLowerCase().trim();
        if (!spId) continue;
        spMemberNames[spId] = c.name || "";
        if (alterIdBySpId[spId]) continue; // already mapped via sp_id
        const localId = alterIdByName[name];
        if (localId) {
          alterIdBySpId[spId] = localId;
          // Backfill sp_id on the local alter so future imports are faster
          await localEntities.Alter.update(localId, { sp_id: spId });
        }
      }

      setHistoryProgress("Checking existing sessions…");
      const existingSessions = await localEntities.FrontingSession.list();
      const existingSpFrontIds = new Set(
        existingSessions.filter(s => s.sp_front_id).map(s => s.sp_front_id)
      );

      let skipped = 0, noAlter = 0;
      const toCreate = [];

      const unmatchedSpIds = new Set();
      setHistoryProgress(`Processing ${entries.length} entries…`);
      for (const entry of entries) {
        const spFrontId = entry.id || entry._id || "";
        if (spFrontId && existingSpFrontIds.has(spFrontId)) { skipped++; continue; }
        const c = entry.content || entry;
        if (!c.custom && c.member && !alterIdBySpId[c.member]) unmatchedSpIds.add(c.member);
        const session = mapFrontHistoryEntry(entry, alterIdBySpId);
        if (!session) { noAlter++; continue; }
        toCreate.push(session);
      }

      if (toCreate.length > 0) {
        setHistoryProgress(`Creating ${toCreate.length} sessions…`);
        await localEntities.FrontingSession.bulkCreate(toCreate);
      }
      const created = toCreate.length;

      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      setHistoryProgress("");

      const unmatchedNames = [...unmatchedSpIds].map(id => spMemberNames[id] || id).join(", ");
      if (created === 0 && noAlter > 0) {
        toast.error(
          `No sessions created — ${noAlter} entries had no matching local alter. Unmatched SP members: ${unmatchedNames || "unknown"}. Try importing alters first.`
        );
      } else {
        toast.success(
          `Front history import complete! ${created} sessions created · ${skipped} already existed${noAlter > 0 ? ` · ${noAlter} skipped (no matching alter)` : ""}`
        );
      }
    } catch (e) {
      setHistoryProgress("");
      toast.error(e.message || "Front history import failed");
    } finally {
      setImportingHistory(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (effectiveSettings?.id) {
        await base44.entities.SystemSettings.update(effectiveSettings.id, { sp_token: "", sp_system_id: "" });
      }
      onSettingsChange();
      toast.success("Disconnected from Simply Plural");
    } catch (e) {
      toast.error(e.message || "Disconnect failed");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Simply Plural</CardTitle>
            <CardDescription>
              Import alters, front history, polls, and notes from Simply Plural
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-6">
            {/* Status */}
            <div>
              <div className="flex items-center gap-2 text-sm flex-wrap mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-foreground font-medium">Connected</span>
                {effectiveSettings.system_name && (
                  <span className="text-muted-foreground">· {effectiveSettings.system_name}</span>
                )}
                <span className="text-muted-foreground/60 text-xs font-mono">
                  {effectiveSettings.sp_system_id?.slice(0, 8)}…
                </span>
              </div>
              {effectiveSettings.last_sync && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(effectiveSettings.last_sync).toLocaleString()}
                </p>
              )}
              {localMode && (
                <p className="text-xs text-amber-500 mt-1">🔒 Token stored locally on this device only</p>
              )}
            </div>

            {/* ── Section: Alters, Groups, Polls, Notes ── */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                <h4 className="font-medium text-sm">Import Members & Data</h4>
              </div>

              <div>
                <Label htmlFor="import-mode" className="text-xs">Import Mode</Label>
                <select
                  id="import-mode"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-2 bg-card mt-1"
                >
                  <option value="standard">Standard (Update & Add New)</option>
                  <option value="new_only">New Only (skip existing)</option>
                  <option value="replace_all">Replace All (⚠️ Destructive)</option>
                </select>
              </div>

              {/* What to include */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Include:</p>
                <label className="flex items-center gap-2 text-sm cursor-default opacity-60 select-none">
                  <input type="checkbox" checked disabled readOnly className="rounded" />
                  Alters, Groups & Custom Fields
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includePolls}
                    onChange={(e) => setIncludePolls(e.target.checked)}
                    className="rounded"
                  />
                  <Vote className="w-3.5 h-3.5 text-muted-foreground" />
                  Polls
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="rounded"
                  />
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Member Notes (one API call per alter — may be slow)
                </label>
              </div>

              {importProgress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {importProgress}
                </div>
              )}
              <Button
                onClick={handleImport}
                disabled={syncing}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 w-full"
              >
                {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDownLeft className="w-4 h-4 mr-2" />}
                {syncing ? "Importing…" : "Import Now"}
              </Button>
            </div>

            {/* ── Section: Front History ── */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-violet-500" />
                <h4 className="font-medium text-sm">Import Front History</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Imports fronting sessions from Simply Plural into your timeline. Already-imported entries are skipped automatically.
              </p>

              {/* Date presets */}
              <div className="flex gap-1.5 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      const to = Date.now();
                      const from = p.ms ? to - p.ms : 0;
                      setHistoryTo(toDateInputValue(to));
                      setHistoryFrom(p.ms ? toDateInputValue(from) : "2020-01-01");
                    }}
                    className="text-xs px-2 py-1 rounded-md border border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date inputs */}
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                    className="mt-1 text-sm h-8"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                    className="mt-1 text-sm h-8"
                  />
                </div>
              </div>

              {historyProgress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {historyProgress}
                </div>
              )}
              <Button
                onClick={handleImportHistory}
                disabled={importingHistory || !localMode}
                size="sm"
                variant="outline"
                className="w-full border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
              >
                {importingHistory ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
                {importingHistory ? "Importing History…" : "Import Front History"}
              </Button>
              {!localMode && (
                <p className="text-xs text-muted-foreground">Front history import is only available in local mode.</p>
              )}
            </div>

            {/* ── Disconnect ── */}
            <div className="border-t pt-4">
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive w-full"
              >
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="sp-token" className="text-sm font-medium">API Token</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Find your token in Simply Plural → Settings → Tokens
              </p>
              {localMode && (
                <p className="text-xs text-amber-500 mb-2">🔒 In local mode, your token is stored only on this device</p>
              )}
              <Input
                id="sp-token"
                type="password"
                placeholder="Paste your Simply Plural token…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={connecting || !token.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
