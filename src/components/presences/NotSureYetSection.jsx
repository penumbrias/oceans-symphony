import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import CreateAlterFromPresence from "@/components/presences/CreateAlterFromPresence";
import { sightingsOf } from "@/components/presences/PresencePicker";

// "Not sure yet" on the alters directory (v0.371.0): the presences that
// haven't become alters, beside the alters themselves, so parts, fragments
// and feelings live on the same page without having to be full profiles.
// Reads Presence; each row opens it on New Presences, and "Make…" is the
// existing CreateAlterFromPresence. Hidden when there are none.
export default function NotSureYetSection() {
  const t = useTerms();
  const [promote, setPromote] = useState(null);
  const { data: presences = [] } = useQuery({
    queryKey: ["presences"],
    queryFn: () => base44.entities.Presence.list("-timestamp", 500),
  });
  const open = useMemo(() => presences.filter((p) => !p.resolved_alter_id), [presences]);
  if (!open.length) return null;

  return (
    <section className="mt-6 space-y-2" data-tour="alters-not-sure-yet" aria-labelledby="not-sure-yet-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="not-sure-yet-heading" className="text-sm font-semibold">Not sure yet</h2>
        <Link to="/presences" className="text-xs text-primary hover:underline min-h-[32px] inline-flex items-center">All presences</Link>
      </div>
      <ul className="rounded-xl border border-border/60 divide-y divide-border/50 overflow-hidden">
        {open.map((p) => {
          const name = p.label || p.vibe || "No name yet";
          const seen = sightingsOf(p).length;
          return (
            <li key={p.id} className="flex items-center gap-2 pr-2">
              <Link to={`/presences?highlight=${p.id}`} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 min-h-[48px]">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 border border-border/60"
                  style={{ backgroundColor: p.color ? `${p.color}33` : undefined, borderColor: p.color || undefined }}
                  aria-hidden="true"
                >
                  {p.emoji || "🌫️"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{name}</span>
                  {p.label && p.vibe && <span className="block text-xs text-muted-foreground truncate">{p.vibe}</span>}
                  {seen > 1 && <span className="block text-xs text-muted-foreground">Noticed {seen} times</span>}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setPromote(p)}
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:bg-primary/10 rounded-lg px-2 min-h-[36px]"
                aria-label={`Make ${name} ${an(t.alter)}`}
              >
                <UserPlus className="w-3.5 h-3.5" /> Make {t.alter}
              </button>
            </li>
          );
        })}
      </ul>
      <CreateAlterFromPresence open={!!promote} presence={promote} onClose={() => setPromote(null)} />
    </section>
  );
}
