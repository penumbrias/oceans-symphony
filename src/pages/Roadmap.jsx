import React from "react";
import { useTerms } from "@/lib/useTerms";
import { Card, CardContent } from "@/components/ui/card";
import { ROADMAP, ROADMAP_STATUSES } from "@/lib/roadmap";

// READ-ONLY static roadmap. Items live in src/lib/roadmap.js (a curated
// extension of the changelog) — there is NO entity, no add/edit/delete,
// no seeding. This page just groups ROADMAP by status and renders it.
// Only the page chrome (intro copy) is terms-aware; the item text is
// literal, like the changelog.

// Per-status chip styling. Falls back to the "planned" look for any
// status not in the map (shouldn't happen — ids come from ROADMAP_STATUSES).
const STATUS_CHIP = {
  "in-progress": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "planned":     "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  "backburner":  "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  "considering": "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  "done":        "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
};
const chipFor = (id) => STATUS_CHIP[id] || STATUS_CHIP.planned;

export default function Roadmap() {
  const terms = useTerms();

  // Group items by status in ROADMAP_STATUSES order; drop empty groups.
  const groups = ROADMAP_STATUSES
    .map((status) => ({
      status,
      items: ROADMAP.filter((it) => it.status === status.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 data-tour="roadmap-header" className="font-display text-3xl font-semibold text-foreground">
          Roadmap
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Planned features and long-term direction for the app.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          This is a curated, read-only roadmap — it's maintained by the developers and can't be edited from here.
        </p>
      </div>

      <div className="space-y-6">
        {groups.map(({ status, items }) => (
          <div key={status.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${chipFor(status.id)}`}>
                {status.label}
              </span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <Card key={`${status.id}-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{item.title}</p>
                      {item.category && (
                        <span className="text-[0.625rem] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                        {item.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/60 mt-8 text-center">
        Where your {terms.system}'s app is headed next. This list is informational and may change at any time.
      </p>
    </div>
  );
}
