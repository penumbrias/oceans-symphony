// Pick an icon for something: any Lucide icon by name (searchable grid), or
// an image from the asset library. Returns { iconName } or { iconUrl }.
// One picker for every "change the icon" spot (v0.193.0).
import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Images, X } from "lucide-react";
import { loadLucideSet, pascalToKebab } from "@/components/shared/LucideByName";
import AssetPickerModal from "@/components/shared/AssetPickerModal";

const PAGE = 120;

export default function IconPicker({ open, onClose, onPick, current = "", allowImage = true, title = "Choose an icon" }) {
  const [set, setSet] = useState(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [imgOpen, setImgOpen] = useState(false);
  useEffect(() => { if (open && !set) loadLucideSet().then(setSet); }, [open, set]);
  useEffect(() => { setLimit(PAGE); }, [q]);
  const names = useMemo(() => {
    if (!set) return [];
    // Skip the alias duplicates (XIcon, LucideX) — the set keys are the
    // canonical Pascal names.
    const all = Object.keys(set).filter((k) => !/Icon$/.test(k) && !/^Lucide/.test(k));
    const needle = q.trim().toLowerCase().replace(/\s+/g, "-");
    const list = needle ? all.filter((k) => pascalToKebab(k).includes(needle)) : all;
    return list.sort((a, b) => a.localeCompare(b));
  }, [set, q]);
  const shown = names.slice(0, limit);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden flex flex-col" style={{ maxHeight: "80vh" }}>
        <DialogHeader className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm">{title}</DialogTitle>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </DialogHeader>
        <div className="px-4 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons (e.g. heart, moon, star)…"
              className="w-full h-9 pl-8 pr-2 rounded-lg border border-input bg-background text-sm" />
          </div>
          <div className="flex items-center gap-2">
            {allowImage && (
              <button type="button" onClick={() => setImgOpen(true)}
                className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                <Images className="w-3.5 h-3.5" /> Use an image instead
              </button>
            )}
            {current && (
              <button type="button" onClick={() => { onPick({ iconName: "", iconUrl: "" }); onClose(); }}
                className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                Back to the default
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
          {!set && <p className="text-xs text-muted-foreground py-6 text-center">Loading icons…</p>}
          {set && shown.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No icons match.</p>}
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
            {shown.map((k) => {
              const Icon = set[k];
              const kebab = pascalToKebab(k);
              const on = current === kebab || current === k;
              return (
                <button key={k} type="button" title={kebab} aria-label={kebab} aria-pressed={on}
                  onClick={() => { onPick({ iconName: kebab, iconUrl: "" }); onClose(); }}
                  className={`aspect-square rounded-lg border flex items-center justify-center ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-foreground hover:bg-muted/40"}`}>
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>
          {names.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + PAGE)}
              className="mt-3 w-full text-xs py-2 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">
              Show more ({names.length - limit} left)
            </button>
          )}
        </div>
        <AssetPickerModal open={imgOpen} onClose={() => setImgOpen(false)} allowFolders
          onSelect={(url) => { setImgOpen(false); onPick({ iconName: "", iconUrl: url }); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}
