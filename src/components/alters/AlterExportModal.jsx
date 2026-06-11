import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Download, Copy, Share2, Check, Search, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { shareFile } from "@/lib/shareFile";
import { buildAlterListExportHtml, buildAlterListExportText } from "@/lib/alterExport";

// Resolve any image URL (local-image://, blob:, http:) to a portable data URL
// so it survives in a saved/shared HTML file.
async function resolveToDataUrl(imageUrl) {
  try {
    const resolved = await resolveImageUrl(imageUrl);
    if (!resolved) return "";
    if (resolved.startsWith("data:")) return resolved;
    const res = await fetch(resolved);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => resolve("");
      r.readAsDataURL(blob);
    });
  } catch { return ""; }
}

export default function AlterExportModal({ isOpen, onClose, alters = [], presetAlterId = null }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const systemIdentity = useSystemIdentity();
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name || "Group"])), [groups]);

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState("full");
  const [anonymize, setAnonymize] = useState(false);
  const [includeAvatars, setIncludeAvatars] = useState(false);
  const [busy, setBusy] = useState(false);

  // Initialise selection when opened: preset alter only, else everyone.
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(presetAlterId ? [presetAlterId] : liveAlters.map((a) => a.id)));
    setSearch("");
  }, [isOpen, presetAlterId, liveAlters.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return liveAlters.filter((a) => !q || a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q));
  }, [liveAlters, search]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(liveAlters.map((a) => a.id)));
  const selectNone = () => setSelected(new Set());

  const buildPayload = async () => {
    const chosen = liveAlters.filter((a) => selected.has(a.id));
    let resolvedAvatars = {};
    if (includeAvatars) {
      const pairs = await Promise.all(chosen.map(async (a) => [a.id, a.image_url ? await resolveToDataUrl(a.image_url) : ""]));
      resolvedAvatars = Object.fromEntries(pairs.filter(([, url]) => url));
    }
    const options = { detail, anonymize, includeAvatars, resolvedAvatars, systemName: systemIdentity.name || "" };
    const html = buildAlterListExportHtml({ alters: chosen, groupsById, options });
    const text = buildAlterListExportText({ alters: chosen, groupsById, options });
    return { chosen, html, text };
  };

  const filename = () => {
    const base = (systemIdentity.name || "members").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "members";
    return `${base}-members.html`;
  };

  const doDownload = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const { html } = await buildPayload();
      const blob = new Blob([html], { type: "text/html" });
      const r = await shareFile({ blob, filename: filename(), title: `${terms.System} members`, prefer: "download" });
      if (r.result === "downloaded" || r.result === "shared") toast.success("Export saved");
      else if (r.result === "cancelled") { /* silent */ }
      else toast.error("Couldn't save the export");
    } finally { setBusy(false); }
  };

  const doShare = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const { html } = await buildPayload();
      const blob = new Blob([html], { type: "text/html" });
      const r = await shareFile({ blob, filename: filename(), title: `${terms.System} members`, prefer: "share" });
      if (r.result === "failed") toast.error("Couldn't share the export");
    } finally { setBusy(false); }
  };

  const doCopy = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const { text } = await buildPayload();
      await navigator.clipboard.writeText(text);
      toast.success("Copied as text");
    } catch { toast.error("Couldn't copy"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> Export {terms.alters}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Make a shareable document of {presetAlterId ? `this ${terms.alter}` : `your ${terms.alters}`} you can send to a friend. It's a one-time file — once sent, it's out of your hands (it doesn't stay in sync).
        </p>

        {/* Options */}
        <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
          <div>
            <p className="text-sm font-semibold mb-1.5">Detail</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[["basic", "Basics"], ["full", "Full profiles"]].map(([v, label]) => (
                <button key={v} type="button" aria-pressed={detail === v} onClick={() => setDetail(v)}
                  className={`h-9 rounded-lg border text-xs font-medium transition-colors ${detail === v ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[0.625rem] text-muted-foreground mt-1">Basics = name, pronouns, role, age, colour. Full also adds bio, custom fields, and groups.</p>
          </div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Anonymize names <span className="text-xs text-muted-foreground">(shows “Member 1, 2…”)</span></span>
            <Switch checked={anonymize} onCheckedChange={setAnonymize} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Include avatars <span className="text-xs text-muted-foreground">(larger file)</span></span>
            <Switch checked={includeAvatars} onCheckedChange={setIncludeAvatars} />
          </label>
        </div>

        {/* Selection */}
        {!presetAlterId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Who to include <span className="text-xs text-muted-foreground">({selected.size})</span></p>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectAll} className="text-primary hover:underline">All</button>
                <button type="button" onClick={selectNone} className="text-muted-foreground hover:underline">None</button>
              </div>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="max-h-48 overflow-y-auto overscroll-contain space-y-0.5 rounded-lg border border-border/40 p-1">
              {filtered.map((a) => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} type="button" aria-pressed={on} onClick={() => toggle(a.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs min-h-[36px] transition-colors ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: a.color || "#6366f1" }}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="flex-1 truncate">{formatAlter(a)}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-2 py-3 text-center">No matches.</p>}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={doShare} disabled={busy || !selected.size} className="flex-1 gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share
          </Button>
          <Button variant="outline" onClick={doDownload} disabled={busy || !selected.size} className="gap-1.5">
            <Download className="w-4 h-4" /> Download
          </Button>
          <Button variant="outline" onClick={doCopy} disabled={busy || !selected.size} className="gap-1.5">
            <Copy className="w-4 h-4" /> Copy text
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
