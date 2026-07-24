// Card + modal that lets a user on the LEGACY catalogue opt into the new
// preset bundles WITHOUT losing check-in history. Rendered at the top of
// ManageCheckIn's Symptoms tab; only appears when legacy rows are
// detected AND the user hasn't dismissed it. See
// src/lib/legacyCatalogueMigration.js for the pure-logic side.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, X, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { TRACKING_BUNDLES } from "@/lib/trackingPresets";
import { detectLegacyCatalogue, planModernization, applyModernization, findCustomOverlaps, LEGACY_TO_PRESET_EQUIVALENTS } from "@/lib/legacyCatalogueMigration";
import { markBundlesChosen } from "@/utils/symptomDefaults";
import { psGetItem, psSetItem } from "@/lib/perSystemStorage";
import { useTerms } from "@/lib/useTerms";
import { getSeedTerms } from "@/utils/symptomDefaults";

const DISMISS_KEY = "symphony_legacy_catalogue_migration_dismissed_v1";

export default function LegacyCatalogueMigrationCard() {
  const t = useTerms();
  const queryClient = useQueryClient();
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const [dismissed, setDismissed] = useState(() => !!psGetItem(DISMISS_KEY));
  const [modalOpen, setModalOpen] = useState(false);

  const detection = useMemo(() => detectLegacyCatalogue(symptoms), [symptoms]);
  if (!detection.canModernize || dismissed) return null;

  const equivalentsPresent = LEGACY_TO_PRESET_EQUIVALENTS.filter((e) =>
    symptoms.some((s) => (s.label || "").trim().toLowerCase() === e.legacy.trim().toLowerCase() && s.is_default && !s.bundle_id)
  ).length;

  // Compose a short body line that mentions whichever upgrade paths apply.
  const bits = [];
  if (equivalentsPresent > 0) {
    bits.push(`${equivalentsPresent} old preset item${equivalentsPresent === 1 ? "" : "s"} will be renamed to their new equivalents`);
  }
  if (detection.customOverlapCount > 0) {
    bits.push(`${detection.customOverlapCount} of your own custom item${detection.customOverlapCount === 1 ? "" : "s"} match preset names and can be linked`);
  }
  const summaryBits = bits.length ? bits.join(" — and ") : "any exact-name overlaps will merge automatically";

  const dismiss = () => {
    psSetItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <>
      <div className="mb-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Update your check-in catalogue?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We've redesigned tracking into themed preset packs (mood, dissociation, trauma
              responses, body & sleep, and more). You can add the new packs now, {summaryBits}.
              Everything you've logged stays put — items get updated in place so their history
              still points at them.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm" onClick={() => setModalOpen(true)} className="text-xs gap-1">
                <Sparkles className="w-3 h-3" /> Update…
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="text-xs">
                Keep old list (don't ask again)
              </Button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss update prompt"
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {modalOpen && (
        <MigrationModal
          symptoms={symptoms}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            markBundlesChosen();
            psSetItem(DISMISS_KEY, "1");
            setDismissed(true);
            setModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["symptoms"] });
          }}
        />
      )}
    </>
  );
}

function MigrationModal({ symptoms, onClose, onDone }) {
  const [selected, setSelected] = useState(() => {
    // Pre-tick the three default-on bundles + any bundle that contains at
    // least one equivalence-mapped item the user actually has (nudge users
    // toward the packs that adopt their existing rows so history migrates).
    const initial = new Set(["mood", "dissociation", "daily_care"]);
    for (const e of LEGACY_TO_PRESET_EQUIVALENTS) {
      const hasIt = symptoms.some((s) => (s.label || "").trim().toLowerCase() === e.legacy.trim().toLowerCase() && s.is_default && !s.bundle_id);
      if (hasIt) initial.add(e.bundleId);
    }
    return initial;
  });
  const [customOverlaps, setCustomOverlaps] = useState([]);
  // Set of custom row ids the user has opted in to sync. Defaults to
  // "all opted in" once overlaps are found (they can uncheck any they
  // deliberately want to keep as free-form customs).
  const [customToSync, setCustomToSync] = useState(new Set());
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleCustom = (id) => {
    setCustomToSync((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Discover custom overlaps once on mount — the set is stable for the
  // life of the modal (symptoms is a snapshot passed in from the card).
  useEffect(() => {
    let cancelled = false;
    findCustomOverlaps(symptoms).then((rows) => {
      if (cancelled) return;
      setCustomOverlaps(rows);
      // Auto-select every custom overlap so the safe default is "yes,
      // link them all" — user can uncheck deliberately-different ones.
      // Also auto-add the target bundle to the selected set so the
      // sync actually executes (a sync only fires for a bundle whose
      // items pass through planModernization's loop).
      setCustomToSync(new Set(rows.map((r) => r.customId)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.add(r.bundleId);
        return next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symptoms]);

  // Recompute the plan whenever selection changes.
  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    planModernization(symptoms, [...selected], customToSync)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch(() => { if (!cancelled) setPlan({ toAdopt: [], toReconcile: [], toSyncCustom: [], toCreate: [], alreadyPresent: [] }); })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [selected, symptoms, customToSync]);

  const apply = async () => {
    if (!plan || applying) return;
    setApplying(true);
    try {
      const { adopted, reconciled, syncedCustom, created } = await applyModernization(plan);
      const parts = [];
      if (adopted) parts.push(`${adopted} renamed`);
      if (reconciled) parts.push(`${reconciled} merged`);
      if (syncedCustom) parts.push(`${syncedCustom} custom linked`);
      if (created) parts.push(`${created} added`);
      toast.success(parts.length ? `Updated: ${parts.join(", ")}` : "Nothing to change");
      onDone();
    } catch (e) {
      toast.error(e?.message || "Couldn't update");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Add new preset packs
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            Tick the packs you'd like. Anything you already have with the same name
            (or a mapped older name) will merge automatically — no duplicate rows,
            and your check-in history keeps pointing at the same items.
          </p>
          <div className="space-y-1.5">
            {TRACKING_BUNDLES.map((b) => (
              <label
                key={b.id}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggle(b.id)}
                  className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium block">
                    {b.emoji} {b.label}
                  </span>
                  <span className="text-xs text-muted-foreground block leading-snug">
                    {b.description}
                  </span>
                </span>
                <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0">
                  {b.items.length} items
                </span>
              </label>
            ))}
          </div>

          {customOverlaps.length > 0 && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                Link your custom items to presets
              </p>
              <p className="text-[0.6875rem] text-muted-foreground leading-snug">
                These items you created match preset names. Ticking one links it
                — the row stays yours (label, colour, hides all preserved) but
                gains preset features (bundle grouping, direction-aware charts,
                the right kind & scale). Untick anything you deliberately want to
                keep as a free-form custom.
              </p>
              <div className="space-y-1">
                {customOverlaps.map((r) => (
                  <label
                    key={r.customId}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-emerald-500/10 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={customToSync.has(r.customId)}
                      onChange={() => toggleCustom(r.customId)}
                      className="mt-0.5 w-3.5 h-3.5 accent-emerald-500 flex-shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-[0.6875rem] leading-snug">
                      <span className="font-medium">{r.customLabel}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{r.presetLabel}</span>
                      <span className="text-muted-foreground"> ({r.bundleLabel})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-1">
              {planLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-emerald-500" />}
              Preview
            </p>
            {plan ? (
              <>
                <p>• <span className="font-medium text-emerald-500">{plan.toAdopt.length}</span> old preset item{plan.toAdopt.length === 1 ? "" : "s"} renamed & converted (history preserved).</p>
                <p>• <span className="font-medium text-emerald-500">{plan.toReconcile.length}</span> duplicate{plan.toReconcile.length === 1 ? "" : "s"} merged (history re-pointed, old row archived).</p>
                <p>• <span className="font-medium text-emerald-500">{(plan.toSyncCustom||[]).length}</span> custom item{(plan.toSyncCustom||[]).length === 1 ? "" : "s"} linked to their preset equivalent.</p>
                <p>• <span className="font-medium text-primary">{plan.toCreate.length}</span> new item{plan.toCreate.length === 1 ? "" : "s"} added.</p>
                <p>• <span className="font-medium text-muted-foreground">{plan.alreadyPresent.length}</span> already present, skipped.</p>
                {(plan.toAdopt.length > 0 || plan.toReconcile.length > 0) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show renames &amp; merges ({plan.toAdopt.length + plan.toReconcile.length})</summary>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {plan.toAdopt.map((a) => (
                        <li key={a.id} className="text-muted-foreground">
                          <span className="line-through">{a.legacyLabel}</span> → <span className="text-foreground">{a.presetLabel}</span> <span className="text-emerald-500">(renamed)</span>
                        </li>
                      ))}
                      {plan.toReconcile.map((r) => (
                        <li key={r.legacyId} className="text-muted-foreground">
                          <span className="line-through">{r.legacyLabel}</span> → <span className="text-foreground">{r.presetLabel}</span> <span className="text-emerald-500">(merged into existing preset)</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Computing preview…</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={onClose} disabled={applying} className="flex-1">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={apply}
            disabled={applying || planLoading || !plan || (plan.toAdopt.length === 0 && plan.toReconcile.length === 0 && (plan.toSyncCustom||[]).length === 0 && plan.toCreate.length === 0)}
            className="flex-1 gap-1"
          >
            {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
