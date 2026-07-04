import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Check, ArrowLeftRight, Pencil, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import {
  listSystems, getActiveSystemId, createSystem, setActiveSystem, refreshSystemNames,
  renameSystem, writeSystemDisplayName, deleteSystem, getSystemRawBlob, reorderSystems,
} from "@/lib/systems";

// Save a JSON string to the device: native → public Downloads (MediaStore),
// web/TWA → anchor download. Returns true on success. Used by the per-system
// "backup before delete" safety save.
async function saveBackupFile(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  if (isNative()) {
    try {
      const { saveBlobToPublicDownloads } = await import("@/lib/nativeMediaStoreSave");
      const res = await saveBlobToPublicDownloads({ blob, filename, mimeType: "application/json" });
      return res?.result === "filesystem";
    } catch { return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

// Small avatar for a system row: the system's own picture (resolved from the
// shared image store) with a coloured initial fallback.
function SystemAvatar({ url, name }) {
  const resolved = useResolvedAvatarUrl(url || null);
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-muted border border-border/60">
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : <span className="text-sm font-semibold text-muted-foreground">{initial}</span>}
    </div>
  );
}

// Multiple-systems switcher + manager (Phase 1 + 2). Lists the systems in the
// P0 registry, lets you create / switch / rename / delete them.
//
// Switching and creating end in window.location.reload(): on the next boot
// initSystemsRegistry() re-points localDb at the chosen system's blob, so the
// whole app comes up inside that system. A brand-new system has no blob → it
// boots into first-run setup.
//
// DELETE saves a backup file of that system's raw data FIRST (data-loss
// invariant) and only ever targets an INACTIVE system. RENAME writes to the
// system's SystemSettings.system_name (the canonical name) — the active system
// via its loaded record, inactive ones straight into their blob.
export default function SystemSwitcherPanel() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [systems, setSystems] = useState(() => listSystems());
  const activeId = getActiveSystemId();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  // Pull each system's REAL name from its own data blob (not just the registry
  // default), so an inactive system named in its Profile shows that name here.
  useEffect(() => {
    let cancelled = false;
    refreshSystemNames()
      .then((list) => { if (!cancelled && Array.isArray(list)) setSystems(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const activeSettings = pickPrimarySystemSettings(settingsList);
  const activeRealName = (activeSettings && activeSettings.system_name) || null;
  const displayName = (s) => (s.id === activeId && activeRealName) ? activeRealName : s.name;

  const refresh = async () => {
    try { const list = await refreshSystemNames(); if (Array.isArray(list)) setSystems(list); } catch { /* keep current */ }
  };

  const switchTo = async (id) => {
    if (id === activeId || busy) return;
    if (!window.confirm(`Switch ${terms.system}? The app will reload into that ${terms.system}'s data. Your current ${terms.system} stays exactly as it is.`)) return;
    setBusy(true);
    try {
      await setActiveSystem(id);
      window.location.reload();
    } catch {
      setBusy(false);
      toast.error("Couldn't switch — try again.");
    }
  };

  const addSystem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sys = await createSystem({ name: newName.trim() });
      await setActiveSystem(sys.id);
      window.location.reload();
    } catch {
      setBusy(false);
      toast.error(`Couldn't create the ${terms.system}.`);
    }
  };

  const startRename = (s) => { setRenamingId(s.id); setRenameValue(displayName(s) || ""); };
  const cancelRename = () => { setRenamingId(null); setRenameValue(""); };

  const saveRename = async (s) => {
    const trimmed = renameValue.trim();
    if (!trimmed || busy) { cancelRename(); return; }
    setBusy(true);
    try {
      if (s.id === activeId) {
        // Active: edit the loaded SystemSettings so Profile + everywhere updates now.
        const ss = activeSettings;
        if (ss) await base44.entities.SystemSettings.update(ss.id, { system_name: trimmed });
        else await base44.entities.SystemSettings.create({ system_name: trimmed });
        await renameSystem(s.id, trimmed);
        queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      } else {
        await writeSystemDisplayName(s, trimmed);
      }
      await refresh();
      cancelRename();
    } catch {
      toast.error("Couldn't rename — try again.");
    } finally { setBusy(false); }
  };

  const handleDelete = async (s) => {
    if (s.id === activeId || busy) return;
    const name = displayName(s) || terms.system;
    if (!window.confirm(`Delete "${name}"? This permanently removes that ${terms.system}'s data from this device. A backup file is saved first.`)) return;
    setBusy(true);
    try {
      // Forced backup BEFORE destroying (data-loss invariant). A system that was
      // created but never set up has no blob — nothing to back up.
      const raw = await getSystemRawBlob(s);
      if (raw) {
        const safe = String(name).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "system";
        const saved = await saveBackupFile(raw, `oceans-symphony-${safe}-backup.json`);
        if (!saved) {
          toast.error("Couldn't save the backup — delete cancelled to protect your data.");
          setBusy(false);
          return;
        }
      }
      await deleteSystem(s.id);
      await refresh();
      toast.success(`${name} deleted${raw ? " (backup saved)" : ""}`);
    } catch {
      toast.error("Couldn't delete — try again.");
    } finally { setBusy(false); }
  };

  const move = async (idx, dir) => {
    if (busy) return;
    const ids = systems.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    setBusy(true);
    try { await reorderSystems(ids); await refresh(); } catch { /* keep order */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Keep separate {terms.systems} in one app, each with its own data. Switching reloads into the chosen {terms.system}.
      </p>

      <div className="space-y-2">
        {systems.map((s, idx) => {
          const isActive = s.id === activeId;
          const editing = renamingId === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(s); if (e.key === "Escape") cancelRename(); }}
                    autoFocus
                    className="h-8 flex-1"
                    placeholder={`${terms.System} name`}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => saveRename(s)} disabled={busy} title="Save">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-500" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={cancelRename} disabled={busy} title="Cancel">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                // flex-wrap + a single grouped controls cluster: on a narrow
                // phone the WHOLE cluster drops to its own right-aligned line
                // instead of the buttons bleeding past the dialog edge.
                <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap min-h-[2.5rem]">
                  <div className="flex items-center gap-2 flex-1 min-w-0 basis-32">
                    <SystemAvatar url={s.avatar} name={displayName(s)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{displayName(s)}</p>
                      {isActive && (
                        <p className="text-[0.625rem] font-semibold text-emerald-500 flex items-center gap-0.5 leading-tight">
                          <Check className="w-3 h-3" /> Active
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                    {systems.length > 2 && (
                      <div className="flex flex-col">
                        <button type="button" onClick={() => move(idx, -1)} disabled={busy || idx === 0} title="Move up"
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => move(idx, 1)} disabled={busy || idx === systems.length - 1} title="Move down"
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => startRename(s)} disabled={busy} title={`Rename ${terms.system}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isActive && (
                      <>
                        <button type="button" onClick={() => handleDelete(s)} disabled={busy} title={`Delete ${terms.system}`}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <Button size="sm" variant="outline" onClick={() => switchTo(s.id)} disabled={busy} className="gap-1.5 h-8">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />} Switch
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="space-y-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`New ${terms.system} name (optional)`}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            A blank new {terms.system} is created and opened — you'll set it up fresh. Your current {terms.system} is untouched.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setNewName(""); }} disabled={busy} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={addSystem} disabled={busy} className="flex-1 gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create &amp; open
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} disabled={busy} className="w-full gap-2">
          <Plus className="w-4 h-4" /> Add a {terms.system}
        </Button>
      )}
    </div>
  );
}
