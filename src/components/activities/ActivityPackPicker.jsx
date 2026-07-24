// Preset activity pack picker (v0.85.3). Same visual pattern as
// symptoms' BundleList: expandable packs, checkboxes for the parent
// and each sub-activity, Select all shortcut. Rendered inside the
// Setup checklist's Activity item alongside the "Add custom" button.

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Loader2, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ACTIVITY_PACKS, importActivityPacks } from "@/lib/activityPresets";

// selection keys:
//   `${packId}`             → the whole pack (parent + every sub)
//   `${packId}:${subIndex}` → an individual sub-activity
const parentKey = (pack) => pack.id;
const subKey = (pack, i) => `${pack.id}:${i}`;

export default function ActivityPackPicker({ onImported }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [openPacks, setOpenPacks] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const { data: existingCats = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const existingRoots = useMemo(() => {
    const s = new Set();
    for (const c of existingCats) {
      if (!c.parent_category_id) s.add(String(c.name || "").trim().toLowerCase());
    }
    return s;
  }, [existingCats]);

  const existingSubsByParent = useMemo(() => {
    const byParentId = new Map(); // parent id → Set of sub-name-lower
    const rootIdByName = new Map();
    for (const c of existingCats) {
      if (!c.parent_category_id) rootIdByName.set(String(c.name || "").trim().toLowerCase(), c.id);
    }
    for (const c of existingCats) {
      if (!c.parent_category_id) continue;
      const set = byParentId.get(c.parent_category_id) || new Set();
      set.add(String(c.name || "").trim().toLowerCase());
      byParentId.set(c.parent_category_id, set);
    }
    return { rootIdByName, byParentId };
  }, [existingCats]);

  const toggleOpen = (id) => setOpenPacks((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleItem = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const setPackAll = (pack, select) => setSelected((prev) => {
    const next = new Set(prev);
    if (select) {
      pack.subs.forEach((_, i) => next.add(subKey(pack, i)));
      next.add(parentKey(pack));
    } else {
      pack.subs.forEach((_, i) => next.delete(subKey(pack, i)));
      next.delete(parentKey(pack));
    }
    return next;
  });

  const isSubAlreadyThere = (pack, subIndex) => {
    const parentId = existingSubsByParent.rootIdByName.get(pack.label.trim().toLowerCase());
    if (!parentId) return false;
    const subs = existingSubsByParent.byParentId.get(parentId);
    return !!subs && subs.has(pack.subs[subIndex].trim().toLowerCase());
  };

  const handleImport = async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      const { createdParents, createdSubs } = await importActivityPacks(base44, selected);
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      const parts = [];
      if (createdParents) parts.push(`${createdParents} categor${createdParents === 1 ? "y" : "ies"}`);
      if (createdSubs) parts.push(`${createdSubs} sub-activit${createdSubs === 1 ? "y" : "ies"}`);
      toast.success(parts.length ? `Added ${parts.join(", ")}` : "Nothing new to add");
      setSelected(new Set());
      onImported?.({ createdParents, createdSubs });
    } catch (e) {
      toast.error(e?.message || "Couldn't import activity packs");
    } finally {
      setSaving(false);
    }
  };

  const anySelected = selected.size > 0;

  return (
    <div className="space-y-2">
      {ACTIVITY_PACKS.map((pack) => {
        const isOpen = openPacks.has(pack.id);
        const parentExists = existingRoots.has(pack.label.trim().toLowerCase());
        const packSelectedCount = pack.subs.reduce(
          (n, _, i) => n + (selected.has(subKey(pack, i)) ? 1 : 0),
          0
        );
        const allSelected = packSelectedCount === pack.subs.length;
        return (
          <div key={pack.id} className="border border-border/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleOpen(pack.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="text-base flex-shrink-0" aria-hidden>{pack.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{pack.label}</span>
                <span className="text-xs text-muted-foreground block">{pack.description}</span>
              </span>
              {packSelectedCount > 0 && (
                <span className="text-xs text-primary font-medium flex-shrink-0">{packSelectedCount}</span>
              )}
              {parentExists && (
                <span className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground flex-shrink-0" title="Category already exists — new subs will be added under it">
                  in list
                </span>
              )}
              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            </button>
            {isOpen && (
              <div className="border-t border-border/50 px-3 py-2 space-y-1 bg-muted/20">
                <button
                  type="button"
                  onClick={() => setPackAll(pack, !allSelected)}
                  className="text-xs text-primary hover:underline"
                >
                  {allSelected ? "Uncheck all" : `Check all (${pack.subs.length})`}
                </button>
                {pack.subs.map((sub, i) => {
                  const key = subKey(pack, i);
                  const already = isSubAlreadyThere(pack, i);
                  return (
                    <label key={key} className="flex items-center gap-2 py-1 px-1 rounded-lg cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-primary)] w-3.5 h-3.5 flex-shrink-0"
                        checked={selected.has(key)}
                        onChange={() => toggleItem(key)}
                        aria-label={sub}
                      />
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pack.color }} aria-hidden />
                      <span className="flex-1 text-sm min-w-0">{sub}</span>
                      {already && (
                        <span className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground flex-shrink-0" title="Already in your list — ticking is a no-op">
                          added
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleImport} disabled={!anySelected || saving} className="text-xs gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add {anySelected ? selected.size : ""} to my activities
        </Button>
      </div>
    </div>
  );
}
