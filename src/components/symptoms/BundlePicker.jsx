// Preset bundle picker — browse the tracking catalogue (trackingPresets.js)
// as expandable packs and add items to the user's symptom/habit list.
//
// Two consumers by design:
//  - ManageCheckIn's Symptoms/Habits tabs ("Browse presets") — this modal.
//  - The Phase-C onboarding "Configure your check-in" step (embedded via
//    the exported BundleList, with defaults pre-checked).
//
// Framing rule (research Part E): bundles are "things some people track" —
// offered, never asserted. The safety pack carries its own gentle note.

import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, ChevronRight, Check, Plus, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { TRACKING_BUNDLES, itemToSymptomFields } from "@/lib/trackingPresets";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useTerms } from "@/lib/useTerms";

const labelKey = (label, category) => `${String(label || "").trim().toLowerCase()}::${category}`;

// Small badge describing how an item logs.
function TypeBadge({ item }) {
  const text =
    item.kind === "behaviour" ? "did it"
    : item.kind === "context" ? "context"
    : item.kind === "event" ? "happened"
    : item.type === "rating" ? (item.scale ? "−2..+2" : "0–5") : "yes/no";
  return (
    <span className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground border border-border/50 rounded px-1 py-px flex-shrink-0">
      {text}
    </span>
  );
}

// The bundle list itself — reusable outside the modal (onboarding embeds
// this directly). `selected` is a Set of `${bundleId}:${index}` keys and
// represents the DESIRED final state: items already in the catalogue are
// pre-populated in `selected` by the caller (see BundlePicker below), so
// unticking one queues it for archive at save. This replaces the earlier
// "already-added items lock" behaviour that trapped users after they'd
// ticked something ("I selected everything, and then went back and it
// wouldn't let me deselect" — v0.84 tester report).
export function BundleList({ existingKeys, selected, onToggleItem, onToggleBundle, terms }) {
  const [openBundles, setOpenBundles] = useState(() => new Set());

  const toggleOpen = (id) =>
    setOpenBundles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      {TRACKING_BUNDLES.map((bundle) => {
        const open = openBundles.has(bundle.id);
        const itemStates = bundle.items.map((item, i) => {
          const resolved = applyTerms(item.label, terms);
          const category = item.kind === "behaviour" ? "habit" : "symptom";
          const key = `${bundle.id}:${i}`;
          return {
            item, i, resolved, key,
            already: existingKeys.has(labelKey(resolved, category)),
            checked: selected.has(key),
          };
        });
        const allKeys = itemStates.map((s) => s.key);
        const selectedCount = itemStates.filter((s) => s.checked).length;
        const allSelected = itemStates.length > 0 && itemStates.every((s) => s.checked);

        return (
          <div key={bundle.id} className="border border-border/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleOpen(bundle.id)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="text-base flex-shrink-0" aria-hidden>{bundle.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{bundle.label}</span>
                <span className="text-xs text-muted-foreground block truncate">{bundle.description}</span>
              </span>
              {selectedCount > 0 && (
                <span className="text-xs text-primary font-medium flex-shrink-0">{selectedCount}</span>
              )}
              {open ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {open && (
              <div className="border-t border-border/50 px-3 py-2 space-y-1 bg-muted/20">
                {bundle.safetySensitive && (
                  <p className="text-xs text-muted-foreground pb-1">
                    These are optional and gentle — logging one of the harder items offers the quick support prompt. No streaks, no scores against you.
                  </p>
                )}
                {itemStates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onToggleBundle(bundle.id, allKeys, !allSelected)}
                    className="text-xs text-primary hover:underline"
                  >
                    {allSelected ? "Uncheck all" : `Check all (${itemStates.length})`}
                  </button>
                )}
                {itemStates.map(({ item, resolved, key, already, checked }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 py-1 px-1 rounded-lg cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--color-primary)] w-3.5 h-3.5 flex-shrink-0"
                      checked={checked}
                      onChange={() => onToggleItem(key)}
                      aria-label={resolved}
                    />
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} aria-hidden />
                    <span className="flex-1 text-sm min-w-0 truncate">{resolved}</span>
                    {already && (
                      <span className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground flex-shrink-0" title="Already in your list — unticking removes it">
                        in your list
                      </span>
                    )}
                    <TypeBadge item={item} />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Map a Symptom row to its bundle key (if any) so we can pair archived rows
// with their preset key on save. Match by resolved label + category — bundle_id
// is stamped on new rows but not on legacy migrations.
function bundleKeyForSymptom(sym, terms) {
  for (const bundle of TRACKING_BUNDLES) {
    for (let i = 0; i < bundle.items.length; i++) {
      const item = bundle.items[i];
      const resolvedLabel = applyTerms(item.label, terms);
      const category = item.kind === "behaviour" ? "habit" : "symptom";
      if (labelKey(resolvedLabel, category) === labelKey(sym.label, sym.category || "symptom")) {
        return `${bundle.id}:${i}`;
      }
    }
  }
  return null;
}

export default function BundlePicker({ open, onClose, onAdded }) {
  const t = useTerms();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: !!open,
  });

  const existingKeys = useMemo(
    () => new Set(symptoms.map((s) => labelKey(s.label, s.category || "symptom"))),
    [symptoms]
  );

  // Map bundle-key → existing (non-archived) Symptom row, so unticking one
  // knows which row to archive on save.
  const symptomByBundleKey = useMemo(() => {
    const map = new Map();
    for (const s of symptoms) {
      if (s.is_archived) continue;
      const k = bundleKeyForSymptom(s, t);
      if (k) map.set(k, s);
    }
    return map;
  }, [symptoms, t]);

  // Pre-populate `selected` with everything already in the catalogue when
  // the picker opens (new semantic: selected = desired final state).
  useEffect(() => {
    if (open && !initialized) {
      setSelected(new Set(symptomByBundleKey.keys()));
      setInitialized(true);
    } else if (!open && initialized) {
      setInitialized(false);
      setSelected(new Set());
    }
  }, [open, initialized, symptomByBundleKey]);

  const toggleItem = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleBundle = (_bundleId, keys, select) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (select ? next.add(k) : next.delete(k)));
      return next;
    });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let created = 0;
      let removed = 0;
      // Create anything ticked that isn't already in the catalogue.
      for (const key of selected) {
        if (symptomByBundleKey.has(key)) continue;
        const [bundleId, idxStr] = key.split(":");
        const bundle = TRACKING_BUNDLES.find((b) => b.id === bundleId);
        const item = bundle?.items[Number(idxStr)];
        if (!item) continue;
        const fields = itemToSymptomFields(item, bundleId, Number(idxStr));
        fields.label = applyTerms(fields.label, t);
        if (existingKeys.has(labelKey(fields.label, fields.category))) continue;
        await base44.entities.Symptom.create(fields);
        created++;
      }
      // Archive anything that was in the catalogue but got unticked. Archive
      // (not hard delete) — history stays intact, matching the User Data
      // Preservation invariant.
      for (const [key, row] of symptomByBundleKey.entries()) {
        if (selected.has(key)) continue;
        await base44.entities.Symptom.update(row.id, { is_archived: true });
        removed++;
      }
      queryClient.invalidateQueries({ queryKey: ["symptoms"] });
      const parts = [];
      if (created) parts.push(`added ${created}`);
      if (removed) parts.push(`removed ${removed}`);
      toast.success(parts.length ? `Presets updated (${parts.join(", ")})` : "No changes");
      onAdded?.(created);
      onClose?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save presets");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Browse tracking presets">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Tracking presets</h2>
            <p className="text-xs text-muted-foreground">
              Things some people track — pick what fits. Everything stays editable later.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close presets" className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3">
          <BundleList
            existingKeys={existingKeys}
            selected={selected}
            onToggleItem={toggleItem}
            onToggleBundle={toggleBundle}
            terms={t}
          />
        </div>

        <div className="px-4 py-3 border-t border-border/60 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
