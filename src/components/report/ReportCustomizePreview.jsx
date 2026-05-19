import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, FileText, Loader2 } from "lucide-react";

// Granular final-edit pass on a built therapy report. Sits between
// "Generate" and "Save PDF" so a user can prune individual journal /
// bulletin / status-note / support-journal / system-check-in entries
// out of the report — useful for censoring anything private before
// handing the PDF to a therapist.
//
// Aggregate-only sections (the fronting summary, emotion top-N,
// symptom averages, etc.) are surfaced as "X — included" pills and
// can be excluded wholesale via the per-section checkbox already
// available in the builder. This modal does NOT re-litigate the
// section toggles; it adds row-level exclusions ON TOP of them.
//
// Props:
//   isOpen         — visibility
//   onClose        — fired when user dismisses without generating
//   sections       — built section data (same shape passed to PDF gen)
//   enabledSections — Set of section keys the user enabled in the builder
//   config         — the inner config object (system name, etc.)
//   onGenerate(filteredSections) — fired with sections after the user's
//                                  per-item exclusions are applied
//   loading        — disables Generate while PDF is being built
const PER_ITEM_SECTIONS = [
  {
    key: "journals",
    label: "Journal entries",
    getItems: (sections) => sections.journals || [],
    renderItem: (j) => ({
      id: j.id,
      title: j.title || "Untitled",
      subtitle: j.date || "",
      preview: j.content || j.excerpt || "",
    }),
  },
  {
    key: "bulletins",
    label: "Bulletin board",
    getItems: (sections) => sections.bulletins || [],
    renderItem: (b) => ({
      id: b.id,
      title: b.title || "Bulletin",
      subtitle: `${b.date || ""}${b.author ? ` · ${b.author}` : ""}${b.isPinned ? " · pinned" : ""}`,
      preview: b.content || "",
    }),
  },
  {
    key: "statusNotes",
    label: "Status notes",
    getItems: (sections) => sections.statusNotes || [],
    renderItem: (sn) => ({
      id: sn.id,
      title: sn.date || "Status note",
      subtitle: "",
      preview: sn.note || "",
    }),
  },
  {
    key: "supportJournals",
    label: "Support reflections",
    getItems: (sections) => sections.supportJournals || [],
    renderItem: (e) => ({
      id: e.id,
      title: e.title || "Reflection",
      subtitle: e.date || "",
      preview: Array.isArray(e.responses) ? e.responses.join(" · ") : "",
    }),
  },
  {
    key: "systemCheckIns",
    label: "System meetings",
    getItems: (sections) => sections.systemCheckIns || [],
    renderItem: (c) => ({
      id: c.id,
      title: c.title || "Check-in",
      subtitle: c.date || "",
      preview: c.summary || "",
    }),
  },
];

// Aggregate sections — surfaced as "included" markers so the user
// can see what else is in the PDF. Row-level exclusion doesn't apply
// to these (they're already summaries).
const AGGREGATE_SECTIONS = [
  { key: "overview",   label: "Overview at a glance" },
  { key: "fronting",   label: "Fronting summary" },
  { key: "emotions",   label: "Emotion check-ins summary" },
  { key: "symptoms",   label: "Symptom averages & noteworthy" },
  { key: "activities", label: "Activities summary" },
  { key: "plans",      label: "Plan completion" },
  { key: "diary",      label: "Diary cards summary" },
  { key: "locations",  label: "Locations" },
  { key: "sleep",      label: "Sleep" },
  { key: "tasks",      label: "Tasks summary" },
  { key: "patterns",   label: "Patterns summary" },
  { key: "alterAppendix", label: "Alter appendix" },
];

function truncate(s, n = 220) {
  if (!s) return "";
  const stripped = String(s).replace(/<[^>]+>/g, "").trim();
  return stripped.length > n ? stripped.slice(0, n - 1) + "…" : stripped;
}

export default function ReportCustomizePreview({
  isOpen,
  onClose,
  sections,
  enabledSections,
  onGenerate,
  loading,
}) {
  // Set of "section|id" keys that the user has excluded.
  const [excluded, setExcluded] = useState(() => new Set());

  const visiblePerItemSections = useMemo(() => {
    if (!sections || !enabledSections) return [];
    return PER_ITEM_SECTIONS
      .filter((s) => enabledSections.has(s.key))
      .map((s) => {
        const rawItems = s.getItems(sections);
        if (!rawItems || rawItems.length === 0) return null;
        const items = rawItems
          .map((raw, idx) => {
            const r = s.renderItem(raw) || {};
            const id = r.id ?? `${s.key}-${idx}`;
            return { ...r, id, _raw: raw };
          });
        return { ...s, items };
      })
      .filter(Boolean);
  }, [sections, enabledSections]);

  const visibleAggregates = useMemo(() => {
    if (!enabledSections) return [];
    return AGGREGATE_SECTIONS.filter((a) => enabledSections.has(a.key));
  }, [enabledSections]);

  const toggleItem = (sectionKey, itemId) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      const k = `${sectionKey}|${itemId}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const excludedCount = excluded.size;

  const handleGenerate = () => {
    // Apply per-item exclusions by filtering each per-item array.
    // Aggregate sections are left intact — they're already summaries.
    const filtered = { ...sections };
    for (const s of PER_ITEM_SECTIONS) {
      const rawItems = s.getItems(sections);
      if (!rawItems || rawItems.length === 0) continue;
      const kept = rawItems.filter((raw, idx) => {
        const r = s.renderItem(raw) || {};
        const id = r.id ?? `${s.key}-${idx}`;
        return !excluded.has(`${s.key}|${id}`);
      });
      filtered[s.key] = kept;
    }
    onGenerate(filtered);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Preview & Customize
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Final edit pass — tap the X on any entry to keep it out of the PDF.
            Section-level toggles (in the builder) still apply.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
          {visibleAggregates.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Summaries & aggregates (included as-is)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleAggregates.map((a) => (
                  <span
                    key={a.key}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/40"
                  >
                    ✓ {a.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {visiblePerItemSections.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No discrete entries to censor in this report. The summaries
              above will be included as-is.
            </p>
          )}

          {visiblePerItemSections.map((sec) => {
            const keptCount = sec.items.filter(
              (it) => !excluded.has(`${sec.key}|${it.id}`)
            ).length;
            return (
              <section key={sec.key} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {sec.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {keptCount} of {sec.items.length} included
                  </p>
                </div>
                <div className="space-y-1.5">
                  {sec.items.map((it) => {
                    const isExcluded = excluded.has(`${sec.key}|${it.id}`);
                    return (
                      <div
                        key={it.id}
                        className={`relative rounded-xl border p-3 transition-all ${
                          isExcluded
                            ? "border-dashed border-border/40 bg-muted/20 opacity-50"
                            : "border-border/50 bg-card"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleItem(sec.key, it.id)}
                          className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={isExcluded ? "Include in report" : "Exclude from report"}
                          title={isExcluded ? "Include in report" : "Exclude from report"}
                        >
                          {isExcluded ? (
                            <span className="text-xs font-bold">+</span>
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                        <div className="pr-8">
                          {it.title && (
                            <p className={`text-sm font-medium ${isExcluded ? "line-through" : ""}`}>
                              {it.title}
                            </p>
                          )}
                          {it.subtitle && (
                            <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
                              {it.subtitle}
                            </p>
                          )}
                          {it.preview && (
                            <p className={`text-xs text-muted-foreground mt-1.5 leading-relaxed ${isExcluded ? "line-through" : ""}`}>
                              {truncate(it.preview)}
                            </p>
                          )}
                          {isExcluded && (
                            <p className="text-[0.6875rem] font-medium text-amber-600 dark:text-amber-400 mt-1.5">
                              Excluded from PDF
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex-shrink-0 border-t border-border/50 px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {excludedCount === 0
              ? "No items excluded yet"
              : `${excludedCount} item${excludedCount === 1 ? "" : "s"} excluded`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate PDF"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
