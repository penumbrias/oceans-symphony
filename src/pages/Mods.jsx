// Mods: install, switch on/off, set permissions, open and remove mods that
// other people made and shared as .osmod files, plus the mod library (mods
// that come with the app, src/lib/mods/builtinMods.js). See docs/mods.md.
import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Puzzle, Upload, ShieldCheck, Trash2, Download, ExternalLink, Library, Plus, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { localEntities } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useTerms } from "@/lib/useTerms";
import { parseModFile, MOD_PERMISSIONS, applyModTerms, ModFormatError } from "@/lib/mods/modPackage";
import {
  useMods, installMod, setModEnabled, setModPermissions, uninstallMod,
  exportModPackage, exportModData, deleteModData, grantDataAccess, revokeDataAccess, MODS_QUERY_KEY,
} from "@/lib/mods/modStore";
import { READABLE_DATA, DATA_ACCESS_RISKS, isReadableEntity } from "@/lib/mods/modDataAccess";
import { formatDistanceToNow } from "date-fns";
import { modPagePath } from "@/lib/mods/registry";
import { BUILTIN_MODS, loadBuiltinMod } from "@/lib/mods/builtinMods";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { useUiLook } from "@/lib/uiLook";
import "@/styles/pixel/logs.css";
import RowMenu from "@/components/shared/RowMenu";

// Heavy permissions (data:read) are never a tick: see DataAccessPanel.
const isHeavy = (perm) => !!MOD_PERMISSIONS[perm]?.heavy;

function PermissionRow({ perm, checked, onChange, terms }) {
  const meta = MOD_PERMISSIONS[perm];
  if (!meta || meta.heavy) return null;
  return (
    <label className="flex items-start gap-2.5 py-1.5 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <span>
        <span className="text-sm font-medium block">{applyModTerms(meta.label, terms)}</span>
        <span className="text-xs text-muted-foreground block">{applyModTerms(meta.detail, terms)}</span>
      </span>
    </label>
  );
}

function InstallDialog({ pending, existing, onClose, onInstalled, terms }) {
  const [granted, setGranted] = useState(() => new Set(existing?.granted_permissions || []));
  const [busy, setBusy] = useState(false);
  if (!pending) return null;
  const toggle = (p, on) => setGranted((s) => { const n = new Set(s); on ? n.add(p) : n.delete(p); return n; });
  const doInstall = async () => {
    setBusy(true);
    try {
      await installMod(pending, [...granted]);
      toast.success(existing ? `${pending.name} updated` : `${pending.name} added`);
      onInstalled();
    } catch (e) {
      toast.error(e?.message || "Couldn't install the mod");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Puzzle className="w-5 h-5 text-primary" /> {existing ? "Update" : pending.source === "builtin" ? "Add" : "Install"} {pending.name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Version {pending.version}{pending.author ? ` · by ${pending.author}` : ""}
            {existing ? ` · you have ${existing.version}` : ""}
          </p>
          {pending.description && <p>{applyModTerms(pending.description, terms)}</p>}
          <div>
            <p className="font-medium">Adds {pending.pages.length === 1 ? "a page" : "pages"}:</p>
            <p className="text-muted-foreground">{pending.pages.map((p) => p.title).join(", ")}</p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="font-medium flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> What it can see</p>
            <p className="text-xs text-muted-foreground mt-1">
              It can always keep its own notes and see your words for {terms.alters}, {terms.fronting} and so on.
              {pending.permissions.length ? " It also asks for these. Tick only what you're happy to share; you can change this later." : " It doesn't ask to see anything else."}
            </p>
            {pending.permissions.map((p) => (
              <PermissionRow key={p} perm={p} terms={terms} checked={granted.has(p)} onChange={(on) => toggle(p, on)} />
            ))}
          </div>
          {pending.permissions.includes("data:read") && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 space-y-1">
              <p className="font-medium flex items-center gap-1.5"><Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" /> It also asks to read your records</p>
              <p className="text-xs text-muted-foreground">
                {(pending.dataScopes || []).length
                  ? `It wants: ${pending.dataScopes.map((k) => applyModTerms(READABLE_DATA[k].label, terms)).join(", ")}.`
                  : "It doesn't say which records, so this can't be allowed."}
                {" "}Installing doesn't allow this. Afterwards, its card shows exactly what that would mean and you decide, one kind of record at a time.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {pending.source === "builtin"
              ? "This mod comes with the app. Like every mod, it runs walled off from the rest of the app with no internet access, and can't change or delete anything outside its own data."
              : "Mods are made by other people, not by Oceans Symphony. Each one runs walled off from the rest of the app with no internet access, and can't change or delete anything outside its own data. Only install mods from people you trust."}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={doInstall} disabled={busy}>{existing ? "Update" : pending.source === "builtin" ? "Add" : "Install"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Read your records" on a mod's card: what it may read now, when it last
// did, and the way to allow, change or take it away.
function DataAccessPanel({ mod, terms, refresh }) {
  const [asking, setAsking] = useState(false);
  const fill = (t) => applyModTerms(t, terms);
  const allowed = (mod.granted_permissions || []).includes("data:read");
  const scopes = (mod.data_scopes || []).filter(isReadableEntity);
  const requested = (mod.requested_data_scopes || []).filter(isReadableEntity);
  const revoke = async () => {
    try { await revokeDataAccess(mod); toast.success(`${mod.name} can't read your records any more`); refresh(); }
    catch (e) { toast.error(e?.message || "Couldn't take that away"); }
  };
  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-1.5"><Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Read your records</p>
      {allowed ? (
        <>
          <p className="text-xs text-muted-foreground">
            Allowed to read: {scopes.map((k) => fill(READABLE_DATA[k].label)).join(", ") || "nothing"}.
            {" "}{mod.data_last_read_at ? `Last read ${formatDistanceToNow(new Date(mod.data_last_read_at), { addSuffix: true })}.` : "Hasn't read anything yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>Change</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={revoke}>Take away access</Button>
          </div>
        </>
      ) : requested.length ? (
        <>
          <p className="text-xs text-muted-foreground">Not allowed. It asks for: {requested.map((k) => fill(READABLE_DATA[k].label)).join(", ")}.</p>
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>Read what this means</Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Not allowed. It doesn't say which records it wants, so it can't be allowed. Ask its maker to list them.</p>
      )}
      {asking && <DataConsentDialog mod={mod} terms={terms} onClose={() => setAsking(false)} onDone={() => { setAsking(false); refresh(); }} />}
    </div>
  );
}

// The informed yes. Nothing is ticked for the person, every risk is shown
// in full, and Allow stays off until they've ticked what to share and said
// they understand.
function DataConsentDialog({ mod, terms, onClose, onDone }) {
  const fill = (t) => applyModTerms(t, terms);
  const requested = (mod.requested_data_scopes || []).filter(isReadableEntity);
  const [picked, setPicked] = useState(() => new Set((mod.data_scopes || []).filter((k) => requested.includes(k))));
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (k, on) => setPicked((s) => { const n = new Set(s); on ? n.add(k) : n.delete(k); return n; });
  const allow = async () => {
    setBusy(true);
    try {
      await grantDataAccess(mod, [...picked]);
      toast.success(`${mod.name} can read what you ticked`);
      onDone();
    } catch (e) { toast.error(e?.message || "Couldn't allow that"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Let {mod.name} read your records?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Made by {mod.author || "someone who didn't give a name"}, not by this app.
            {" "}Read-only: it can't change or delete anything.
          </p>
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
            <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> What this means</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              {DATA_ACCESS_RISKS.map((r) => <li key={r}>{fill(r)}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-medium">What it may read</p>
            <p className="text-xs text-muted-foreground mb-1">Nothing is ticked for you. Tick only what you're happy to share.</p>
            {requested.map((k) => (
              <label key={k} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                <Checkbox checked={picked.has(k)} onCheckedChange={(v) => toggle(k, !!v)} className="mt-0.5" />
                <span>
                  <span className="text-sm font-medium block">{fill(READABLE_DATA[k].label)}</span>
                  <span className="text-xs text-muted-foreground block">{fill(READABLE_DATA[k].detail)}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2.5 py-1.5 cursor-pointer rounded-xl border border-border/60 px-3">
            <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(!!v)} className="mt-0.5" />
            <span className="text-sm">I've read this. I trust {mod.name}'s maker with what I ticked.</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={allow} disabled={busy || !understood || !picked.size}>Allow</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A mod's actions (on/off, remove, its data), shared by the card and the
// pixel look's detail panel.
function useModActions(mod, dataCount, refresh) {
  const run = async (fn, okText) => {
    try { await fn(); if (okText) toast.success(okText); refresh(); }
    catch (e) { toast.error(e?.message || "Something went wrong"); }
  };
  const removeMod = async () => {
    const ok = await confirm({
      title: `Remove ${mod.name}?`,
      body: dataCount
        ? `Its ${dataCount} saved ${dataCount === 1 ? "item stays" : "items stay"} in the app and in your backups. Install it again to see them, or delete them below this list.`
        : "It has no saved data.",
      confirmLabel: "Remove",
    });
    if (ok) run(() => uninstallMod(mod), `${mod.name} removed`);
  };
  const deleteData = async () => {
    const ok = await confirm({
      title: `Delete ${mod.name}'s data?`,
      body: `This deletes the ${dataCount} ${dataCount === 1 ? "item" : "items"} it saved. A copy is saved to your device first; if that doesn't work, nothing is deleted.`,
      confirmLabel: "Save a copy and delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await deleteModData(mod.mod_id, mod.name);
      if (!res.saved) toast.error("The copy wasn't saved, so nothing was deleted.");
      else toast.success(`Deleted ${res.deleted} ${res.deleted === 1 ? "item" : "items"} (a copy was saved)`);
      refresh();
    } catch (e) { toast.error(e?.message || "Couldn't delete the data"); }
  };

  return { run, removeMod, deleteData };
}

function ModCard({ mod, dataCount, terms, refresh }) {
  const navigate = useNavigate();
  const { run, removeMod, deleteData } = useModActions(mod, dataCount, refresh);
  const granted = new Set(mod.granted_permissions || []);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3" data-highlight-id={mod.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{mod.name}</p>
          <p className="text-xs text-muted-foreground">
            Version {mod.version}{mod.source === "builtin" ? " · comes with the app" : mod.author ? ` · by ${mod.author}` : ""} · {dataCount} saved {dataCount === 1 ? "item" : "items"}
          </p>
        </div>
        <Switch
          checked={!!mod.enabled}
          onCheckedChange={(v) => run(() => setModEnabled(mod, v))}
          aria-label={mod.enabled ? `Turn ${mod.name} off` : `Turn ${mod.name} on`}
        />
      </div>
      {mod.description && <p className="text-sm text-muted-foreground">{applyModTerms(mod.description, terms)}</p>}
      {mod.enabled && (
        <div className="flex flex-wrap gap-2">
          {(mod.pages || []).map((p) => (
            <Button key={p.id} size="sm" variant="secondary" onClick={() => navigate(modPagePath(mod.mod_id, p.id))}>
              {p.title}
            </Button>
          ))}
        </div>
      )}
      {(mod.permissions || []).includes("data:read") && <DataAccessPanel mod={mod} terms={terms} refresh={refresh} />}
      {(mod.permissions || []).some((p) => !isHeavy(p)) && (
        <div className="rounded-xl border border-border/50 px-3 py-1.5">
          {mod.permissions.map((p) => (
            <PermissionRow
              key={p} perm={p} terms={terms} checked={granted.has(p)}
              onChange={(on) => {
                const next = new Set(granted); on ? next.add(p) : next.delete(p);
                run(() => setModPermissions(mod, [...next]));
              }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {mod.homepage && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openExternalUrl(mod.homepage)}>
            <ExternalLink className="w-3.5 h-3.5" /> About
          </Button>
        )}
        {mod.source !== "builtin" && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => run(() => exportModPackage(mod))}>
            <Download className="w-3.5 h-3.5" /> Save the mod file
          </Button>
        )}
        {dataCount > 0 && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => run(() => exportModData(mod.mod_id, mod.name))}>
            <Download className="w-3.5 h-3.5" /> Save a copy of its data
          </Button>
        )}
        {dataCount > 0 && (
          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={deleteData}>
            <Trash2 className="w-3.5 h-3.5" /> Delete its data
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={removeMod}>Remove mod</Button>
      </div>
    </div>
  );
}

// ── Pixel look: the "Mods" board ───────────────────────────────────
// Installed mods and the library as a side list; the picked mod on the
// right with what it can see, what that means and its saved data. Same
// actions as the cards (useModActions), same dialogs.
const PX_MOD_COLORS = ["#c98bb9", "#e8a65d", "#8fb8e0", "#86b88f", "#e3c16f", "#7fb3a6", "#d98f5b", "#a99be0"];
function pxModColor(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PX_MOD_COLORS[h % PX_MOD_COLORS.length];
}
function pxModLine(text, terms) {
  const plain = applyModTerms(text || "", terms).split(/[.!?]/)[0] || "";
  return plain.length > 34 ? `${plain.slice(0, 33)}…` : plain;
}

function PixelModDetail({ mod, dataCount, terms, refresh, onUpdate }) {
  const navigate = useNavigate();
  const { run, removeMod, deleteData } = useModActions(mod, dataCount, refresh);
  const granted = new Set(mod.granted_permissions || []);
  const light = (mod.permissions || []).filter((p) => !isHeavy(p) && MOD_PERMISSIONS[p]);
  const setPerm = (p, on) => {
    const next = new Set(granted); on ? next.add(p) : next.delete(p);
    run(() => setModPermissions(mod, [...next]));
  };
  const pages = mod.pages || [];
  return (
    <section className="pxg-pn pxg-moddetail" aria-label={mod.name} data-highlight-id={mod.id}>
      <div className="pxg-ttl">
        <span>{mod.name}</span>
        <span className="pxg-ttl-acts">
          <button type="button" role="switch" aria-checked={!!mod.enabled} className={`pxg-btn pxg-btn-s${mod.enabled ? "" : " on"}`}
            onClick={() => run(() => setModEnabled(mod, !mod.enabled))}>{mod.enabled ? "Turn off" : "Turn on"}</button>
          {mod.enabled && pages.length > 0 && (
            <button type="button" className="pxg-btn pxg-btn-s on" onClick={() => navigate(modPagePath(mod.mod_id, pages[0].id))}>Open</button>
          )}
          {mod.source !== "builtin" && <button type="button" className="pxg-btn pxg-btn-s" onClick={onUpdate}>Update</button>}
          <button type="button" className="pxg-btn pxg-btn-s" onClick={removeMod}>... Remove</button>
        </span>
      </div>
      <div className="pxg-modbody">
        {mod.description && <p>{applyModTerms(mod.description, terms)}</p>}
        <p className="pxg-small pxg-muted">
          Version {mod.version}{mod.source === "builtin" ? " · comes with the app" : mod.author ? ` · by ${mod.author}` : ""}
        </p>
        {mod.enabled && pages.length > 1 && (
          <div className="pxg-seg">
            {pages.map((p) => <button key={p.id} type="button" className="pxg-btn pxg-btn-s" onClick={() => navigate(modPagePath(mod.mod_id, p.id))}>{p.title}</button>)}
          </div>
        )}

        <div className="pxg-pn pxg-sub">
          <div className="pxg-ttl"><span>What it can see</span></div>
          {light.map((p) => {
            const on = granted.has(p);
            const meta = MOD_PERMISSIONS[p];
            return (
              <div key={p} className="pxg-permrow">
                <button type="button" role="checkbox" aria-checked={on} className="pxg-tickrow pxg-grow" onClick={() => setPerm(p, !on)}
                  title={applyModTerms(meta.detail, terms)}>
                  <span className={`pxg-tick${on ? " y" : ""}`} aria-hidden="true">{on ? "x" : ""}</span>
                  <span>{applyModTerms(meta.label, terms)}</span>
                </button>
                <span className="pxg-small pxg-muted">{on ? "allowed" : "not allowed"}</span>
                <button type="button" className="pxg-btn pxg-btn-s" onClick={() => setPerm(p, !on)}>{on ? "Take away" : "Allow"}</button>
              </div>
            );
          })}
          <div className="pxg-permrow">
            <span className="pxg-tickrow pxg-grow"><span className="pxg-tick y" aria-hidden="true">x</span><span>Its own storage</span></span>
            <span className="pxg-small pxg-muted">always</span>
          </div>
          {(mod.permissions || []).includes("data:read") && (
            <div className="pxg-modread"><DataAccessPanel mod={mod} terms={terms} refresh={refresh} /></div>
          )}
        </div>

        <div className="pxg-means">
          <div className="pxg-means-h">What this means</div>
          <p>Mods run walled off from the rest of the app with no internet access. One that asks to read your records can see them only after you allow it, and you can take that away here at any time. It can never change or delete anything outside its own data.</p>
        </div>

        <div className="pxg-pn pxg-sub">
          <div className="pxg-ttl"><span>Its saved data</span><span className="pxg-ttl-sub">{dataCount} {dataCount === 1 ? "item" : "items"}</span></div>
          <div className="pxg-permrow pxg-datarow">
            <span className="pxg-grow">{dataCount ? `${dataCount} saved ${dataCount === 1 ? "item" : "items"}, kept in your backups` : "Nothing saved yet."}</span>
            {mod.homepage && <button type="button" className="pxg-btn pxg-btn-s" onClick={() => openExternalUrl(mod.homepage)}>About</button>}
            {mod.source !== "builtin" && <button type="button" className="pxg-btn pxg-btn-s" onClick={() => run(() => exportModPackage(mod))}>Save the mod file</button>}
            {dataCount > 0 && <button type="button" className="pxg-btn pxg-btn-s" onClick={() => run(() => exportModData(mod.mod_id, mod.name))}>Save a copy</button>}
            {dataCount > 0 && <button type="button" className="pxg-btn pxg-btn-s" onClick={deleteData}>Save a copy and delete</button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function PixelLibraryDetail({ item, terms, onAdd }) {
  return (
    <section className="pxg-pn pxg-moddetail" aria-label={item.name}>
      <div className="pxg-ttl"><span>{item.name}</span><span className="pxg-ttl-acts"><button type="button" className="pxg-btn pxg-btn-s on" onClick={onAdd}>Install</button></span></div>
      <div className="pxg-modbody">
        {item.description && <p>{applyModTerms(item.description, terms)}</p>}
        <p className="pxg-small pxg-muted">Comes with the app and updates along with it.</p>
        {item.permissions.length > 0 && (
          <div className="pxg-pn pxg-sub">
            <div className="pxg-ttl"><span>What it asks to see</span></div>
            {item.permissions.map((p) => (
              <div key={p} className="pxg-permrow"><span className="pxg-grow">{applyModTerms(MOD_PERMISSIONS[p]?.label || p, terms)}</span><span className="pxg-small pxg-muted">you choose when you install</span></div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Save or delete the data a removed mod left behind (pixel list row).
function RowMenuLite({ id, n, refresh }) {
  return (
    <RowMenu label="Removed mod's data" items={[
      { label: "Save a copy", icon: Download, onSelect: () => exportModData(id, id).catch(() => {}) },
      { label: "Save a copy and delete", icon: Trash2, destructive: true, onSelect: async () => {
        const ok = await confirm({ title: "Delete this data?", body: `A copy of the ${n} ${n === 1 ? "item" : "items"} is saved to your device first; if that doesn't work, nothing is deleted.`, confirmLabel: "Save a copy and delete", destructive: true });
        if (!ok) return;
        const res = await deleteModData(id, id);
        if (!res.saved) toast.error("The copy wasn't saved, so nothing was deleted.");
        refresh();
      } },
    ]} />
  );
}

export default function Mods() {
  const terms = useTerms();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const { mods } = useMods();
  const [pending, setPending] = useState(null);
  const pixel = useUiLook() === "pixel";
  const [pickedMod, setPickedMod] = useState(null);

  const { data: modData = [] } = useQuery({ queryKey: ["modDataCounts"], queryFn: () => localEntities.ModData.list() });
  const counts = useMemo(() => {
    const m = {};
    for (const r of modData) if (r?.mod_id) m[r.mod_id] = (m[r.mod_id] || 0) + 1;
    return m;
  }, [modData]);
  const installedIds = useMemo(() => new Set(mods.map((m) => m.mod_id)), [mods]);
  const leftovers = Object.entries(counts).filter(([id]) => !installedIds.has(id));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: MODS_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["modDataCounts"] });
  };

  const pickFile = async (file) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      setPending(parseModFile(await file.text()));
    } catch (e) {
      toast.error(e instanceof ModFormatError ? e.message : "Couldn't read that file.");
    }
  };

  const existing = pending ? mods.find((m) => m.mod_id === pending.mod_id) : null;
  const library = BUILTIN_MODS.filter((m) => !installedIds.has(m.mod_id));
  const addFromLibrary = async (modId) => {
    try { setPending(await loadBuiltinMod(modId)); }
    catch (e) { toast.error(e?.message || "Couldn't open that mod."); }
  };

  const installDialog = pending && (
    <InstallDialog
      key={pending.mod_id + pending.version}
      pending={pending}
      existing={existing}
      terms={terms}
      onClose={() => setPending(null)}
      onInstalled={() => { setPending(null); refresh(); }}
    />
  );

  if (pixel) {
    const pickedInstalled = mods.find((m) => m.mod_id === pickedMod) || (!pickedMod || !library.some((l) => l.mod_id === pickedMod) ? mods[0] : null);
    const pickedLibrary = !pickedInstalled ? library.find((l) => l.mod_id === pickedMod) || library[0] : null;
    const openFile = () => fileRef.current?.click();
    return (
      <div className="pxg-mods" data-tour="mods-page">
        <input ref={fileRef} type="file" accept=".osmod,.json,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <section className="pxg-pn pxg-modlist" aria-label="Mods">
          <div className="pxg-ttl"><span>Mods</span><span className="pxg-ttl-acts"><button type="button" className="pxg-btn pxg-btn-s" onClick={openFile}>Install .osmod</button></span></div>
          <div className="pxg-modscroll">
            <div className="pxg-modhead">Installed</div>
            {mods.length === 0 && <p className="pxg-empty pxg-small">No mods yet. Add one from the library below, or install a shared .osmod file.</p>}
            {mods.map((m) => (
              <button key={m.id} type="button" aria-pressed={pickedInstalled?.id === m.id}
                className={`pxg-modrow${pickedInstalled?.id === m.id ? " sel" : ""}`} onClick={() => setPickedMod(m.mod_id)}>
                <span className="pxg-modsq" style={{ background: pxModColor(m.mod_id) }} aria-hidden="true" />
                <span className="pxg-modname"><span>{m.name}{m.enabled ? "" : " (off)"}</span><span className="pxg-modsub">{pxModLine(m.description, terms)}</span></span>
              </button>
            ))}
            {library.length > 0 && <div className="pxg-modhead">Mod library</div>}
            {library.map((m) => (
              <div key={m.mod_id} className={`pxg-modrow${pickedLibrary?.mod_id === m.mod_id ? " sel" : ""}`}>
                <button type="button" className="pxg-modpick" onClick={() => setPickedMod(m.mod_id)} aria-pressed={pickedLibrary?.mod_id === m.mod_id}>
                  <span className="pxg-modsq" style={{ background: pxModColor(m.mod_id) }} aria-hidden="true" />
                  <span className="pxg-modname"><span>{m.name}</span><span className="pxg-modsub">{pxModLine(m.description, terms)}</span></span>
                </button>
                <button type="button" className="pxg-btn" onClick={() => addFromLibrary(m.mod_id)}>Install</button>
              </div>
            ))}
            {leftovers.length > 0 && <div className="pxg-modhead">Data from removed mods</div>}
            {leftovers.map(([id, n]) => (
              <div key={id} className="pxg-modrow">
                <span className="pxg-modname pxg-grow"><span>{id}</span><span className="pxg-modsub">{n} {n === 1 ? "item" : "items"}, kept in case you install it again</span></span>
                <RowMenuLite id={id} n={n} refresh={refresh} />
              </div>
            ))}
          </div>
          <p className="pxg-foot">Want to make a mod? The modder guide is docs/mods.md in the app's source.</p>
        </section>
        {pickedInstalled ? (
          <PixelModDetail mod={pickedInstalled} dataCount={counts[pickedInstalled.mod_id] || 0} terms={terms} refresh={refresh} onUpdate={openFile} />
        ) : pickedLibrary ? (
          <PixelLibraryDetail item={pickedLibrary} terms={terms} onAdd={() => addFromLibrary(pickedLibrary.mod_id)} />
        ) : (
          <section className="pxg-pn pxg-moddetail"><p className="pxg-empty">Install a mod to see it here.</p></section>
        )}
        {installDialog}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 os-page-shell" data-tour="mods-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-primary" /> Mods
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Add features other people made and shared. A mod adds its own pages, which you can open here or pin to your bars.
          </p>
        </div>
        <Button onClick={() => fileRef.current?.click()} className="gap-1.5 flex-shrink-0">
          <Upload className="w-4 h-4" /> Install
        </Button>
        <input ref={fileRef} type="file" accept=".osmod,.json,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground flex gap-2">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Mods run walled off from the rest of the app with no internet access. A mod only sees your {terms.alters} or who's {terms.fronting} if you tick that for it, and it can never change or delete anything outside its own data. Its data is in your backups, and removing a mod keeps it.
        </span>
      </div>

      {mods.length === 0 ? (
        <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-border/60">
          <Puzzle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            No mods yet. Add one from the library below, or when someone shares a mod file (it ends in <strong>.osmod</strong>), save it to your device and tap <strong>Install</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mods.map((m) => <ModCard key={m.id} mod={m} dataCount={counts[m.mod_id] || 0} terms={terms} refresh={refresh} />)}
        </div>
      )}

      {library.length > 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold flex items-center gap-1.5"><Library className="w-4 h-4 text-primary" /> Mod library</h2>
            <p className="text-xs text-muted-foreground">Mods that come with the app. Add the ones you want; they update along with the app.</p>
          </div>
          {library.map((m) => (
            <div key={m.mod_id} className="rounded-2xl border border-border/60 bg-card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{m.name}</p>
                {m.description && <p className="text-sm text-muted-foreground mt-0.5">{applyModTerms(m.description, terms)}</p>}
                {m.permissions.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Asks: {m.permissions.map((p) => applyModTerms(MOD_PERMISSIONS[p]?.label || p, terms)).join(" · ")}
                  </p>
                )}
              </div>
              <Button size="sm" className="gap-1 flex-shrink-0" onClick={() => addFromLibrary(m.mod_id)}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {leftovers.length > 0 && (
        <div className="rounded-2xl border border-border/60 p-4 space-y-2">
          <p className="font-medium text-sm">Data from removed mods</p>
          <p className="text-xs text-muted-foreground">Kept safe in case you install them again.</p>
          {leftovers.map(([id, n]) => (
            <div key={id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{id} · {n} {n === 1 ? "item" : "items"}</span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => exportModData(id, id).catch(() => {})}><Download className="w-3.5 h-3.5" /></Button>
                <Button
                  size="sm" variant="ghost" className="text-destructive"
                  onClick={async () => {
                    const ok = await confirm({ title: "Delete this data?", body: `A copy of the ${n} ${n === 1 ? "item" : "items"} is saved to your device first; if that doesn't work, nothing is deleted.`, confirmLabel: "Save a copy and delete", destructive: true });
                    if (!ok) return;
                    const res = await deleteModData(id, id);
                    if (!res.saved) toast.error("The copy wasn't saved, so nothing was deleted.");
                    refresh();
                  }}
                ><Trash2 className="w-3.5 h-3.5" /></Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Want to make a mod? The modder guide is in the app's source, in docs/mods.md, and every mod in the library is there to copy from.
      </p>

      {installDialog}
    </motion.div>
  );
}
