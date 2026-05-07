import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { format } from "date-fns";
import { GitMerge, Split, MoonStar, Sunrise, Plus, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import RecordSystemChangeModal from "@/components/alters/RecordSystemChangeModal";

const TYPE_META = {
  fusion:   { label: "Fusion",    icon: GitMerge, color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/20" },
  split:    { label: "Split",     icon: Split,    color: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/20" },
  dormancy: { label: "Dormancy",  icon: MoonStar, color: "text-indigo-500", bg: "bg-indigo-500/10 border-indigo-500/20" },
  return:   { label: "Return",    icon: Sunrise,  color: "text-amber-500",  bg: "bg-amber-500/10 border-amber-500/20" },
};

function AlterPill({ alter }) {
  if (!alter) return null;
  const color = alter.color || "#9333ea";
  return (
    <Link
      to={`/alter/${alter.id}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80 transition-opacity text-foreground"
      style={{ borderColor: color, backgroundColor: `${color}22` }}
    >
      <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-background" style={{ backgroundColor: color }} />
      {alter.name}
    </Link>
  );
}

function EventCard({ event, altersById, onDelete }) {
  const meta = TYPE_META[event.type] || TYPE_META.fusion;
  const Icon = meta.icon;

  const sourceAlters = (event.source_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const resultAlters = (event.result_alter_ids || []).map(id => altersById[id]).filter(Boolean);

  // For dormancy/return, source and result are the same — only show once
  const showResult = event.type !== "dormancy" && event.type !== "return";

  const fusionLabel = event.fusion_type === "absorption" ? "Absorption"
    : event.fusion_type === "new_formation" ? "New Formation"
    : null;

  return (
    <div className={cn("rounded-xl border p-3 space-y-2.5", meta.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4 flex-shrink-0", meta.color)} />
          <div>
            <span className={cn("text-sm font-semibold", meta.color)}>{meta.label}</span>
            {fusionLabel && <span className="ml-1.5 text-xs text-muted-foreground">· {fusionLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{event.year_only ? format(new Date(event.date), "yyyy") : format(new Date(event.date), "MMM d, yyyy")}</span>
          <button
            type="button"
            onClick={() => onDelete(event.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {sourceAlters.map(a => <AlterPill key={a.id} alter={a} />)}
        </div>
        {showResult && resultAlters.length > 0 && (
          <>
            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex flex-wrap gap-1">
              {resultAlters.map(a => <AlterPill key={a.id} alter={a} />)}
            </div>
          </>
        )}
      </div>

      {event.cause && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Cause:</span> {event.cause}</p>
      )}
      {event.notes && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{event.notes}</p>
      )}
    </div>
  );
}

function ConnectionsMap({ alterId, events, altersById }) {
  // Predecessors: alters in source_alter_ids where this alter is in result_alter_ids
  const predecessorIds = useMemo(() => {
    const ids = new Set();
    events.forEach(e => {
      if ((e.result_alter_ids || []).includes(alterId) && e.type !== "dormancy" && e.type !== "return") {
        (e.source_alter_ids || []).forEach(id => { if (id !== alterId) ids.add(id); });
      }
    });
    return [...ids];
  }, [alterId, events]);

  // Successors: alters in result_alter_ids where this alter is in source_alter_ids
  const successorIds = useMemo(() => {
    const ids = new Set();
    events.forEach(e => {
      if ((e.source_alter_ids || []).includes(alterId) && e.type !== "dormancy" && e.type !== "return") {
        (e.result_alter_ids || []).forEach(id => { if (id !== alterId) ids.add(id); });
      }
    });
    return [...ids];
  }, [alterId, events]);

  const thisAlter = altersById[alterId];
  if (!thisAlter) return null;
  if (predecessorIds.length === 0 && successorIds.length === 0) return null;

  const color = thisAlter.color || "#9333ea";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Connections</p>
      <div className="flex items-start gap-2 flex-wrap">
        {predecessorIds.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">From</span>
            <div className="flex flex-wrap gap-1">
              {predecessorIds.map(id => altersById[id] && <AlterPill key={id} alter={altersById[id]} />)}
            </div>
          </div>
        )}
        {predecessorIds.length > 0 && (
          <div className="flex items-center self-center mt-4">
            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">This alter</span>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border text-foreground"
            style={{ borderColor: color, backgroundColor: `${color}33`, outline: `2px solid ${color}55`, outlineOffset: "1px" }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-background" style={{ backgroundColor: color }} />
            {thisAlter.name}
          </div>
        </div>
        {successorIds.length > 0 && (
          <div className="flex items-center self-center mt-4">
            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
        )}
        {successorIds.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Became</span>
            <div className="flex flex-wrap gap-1">
              {successorIds.map(id => altersById[id] && <AlterPill key={id} alter={altersById[id]} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LineageTab({ alterId }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: allEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => localEntities.Alter.list(),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);

  const relatedEvents = useMemo(() =>
    allEvents
      .filter(e =>
        (e.source_alter_ids || []).includes(alterId) ||
        (e.result_alter_ids || []).includes(alterId)
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [allEvents, alterId]
  );

  async function handleDelete(eventId) {
    await localEntities.SystemChangeEvent.delete(eventId);
    queryClient.invalidateQueries({ queryKey: ["systemChangeEvents"] });
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Lineage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">System change events involving this alter</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Record Event
        </Button>
      </div>

      {/* Connections map */}
      {relatedEvents.length > 0 && (
        <ConnectionsMap alterId={alterId} events={relatedEvents} altersById={altersById} />
      )}

      {/* Event list */}
      {relatedEvents.length === 0 ? (
        <div className="text-center py-10">
          <GitMerge className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No lineage events recorded yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Record a fusion, split, dormancy, or return event to build this alter's history.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {relatedEvents.map(e => (
            <EventCard key={e.id} event={e} altersById={altersById} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {modalOpen && (
        <RecordSystemChangeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          preselectedAlterIds={[alterId]}
        />
      )}
    </div>
  );
}
