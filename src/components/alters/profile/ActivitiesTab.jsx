import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { allRelations, clampStrength, LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";

// "Activities" tab on an alter profile — the other side of the Activities
// page's "Who" links: what this alter enjoys, needs, dislikes, avoids,
// feels obligated to, tends to interrupt, or any type the user made. Read-only here; each row opens
// that activity on the Activities page, where links are added and edited.
export default function ActivitiesTab({ alter }) {
  const t = useTerms();
  const navigate = useNavigate();
  const { data: links = [] } = useQuery({
    queryKey: ["alterActivityLinks"], queryFn: () => base44.entities.AlterActivityLink.list(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const { data: linkTypes = [] } = useQuery({
    queryKey: LINK_TYPES_QUERY_KEY, queryFn: () => base44.entities.ActivityLinkType.list().catch(() => []),
  });
  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const groups = useMemo(() => {
    const mine = links.filter((l) => l.alter_id === alter.id);
    const relations = allRelations(linkTypes, { includeRemoved: true });
    const known = new Set(relations.map((r) => r.id));
    return [...relations, { id: "__other", label: "Other" }]
      .map((r) => ({ ...r, links: mine.filter((l) => (r.id === "__other" ? !known.has(l.relation) : l.relation === r.id))
        .sort((a, b) => clampStrength(b.strength) - clampStrength(a.strength)) }))
      .filter((r) => r.links.length);
  }, [links, linkTypes, alter.id]);

  if (groups.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <Zap className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No activities linked to {alter.name || `this ${t.alter}`} yet. Open an activity on the Activities page and use “Link {t.alter}”.
        </p>
        <button type="button" onClick={() => navigate("/activities")} className="text-sm text-primary hover:underline">
          Open Activities
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{g.label}</p>
          <div className="space-y-1">
            {g.links.map((l) => {
              const c = catById[l.category_id];
              return (
                <button key={l.id} type="button"
                  onClick={() => navigate(`/activities?category=${encodeURIComponent(l.category_id)}`)}
                  className="w-full flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 text-left hover:bg-muted/40">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c?.color || "#8b5cf6" }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{c?.name || "Deleted activity"}</span>
                    {l.note && <span className="block text-xs text-muted-foreground truncate">{l.note}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{clampStrength(l.strength)}/5</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
