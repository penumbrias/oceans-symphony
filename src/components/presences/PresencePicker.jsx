import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import PresenceForm from "./PresenceForm";

// Helper: every timestamp a presence was sensed (back-compat for rows that
// only have the single `timestamp`).
export function sightingsOf(p) {
  if (Array.isArray(p.sightings) && p.sightings.length) return p.sightings;
  return p.timestamp ? [p.timestamp] : [];
}

// Used inside SetFrontModal's "New presence" tab. Lets the user PICK an
// already-recorded presence (logs another sighting — that's how reoccurrence
// is sourced) OR record a brand-new one. Falls straight to the form when none
// exist yet.
export default function PresencePicker({ onClose }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data: presences = [] } = useQuery({
    queryKey: ["presences"],
    queryFn: () => base44.entities.Presence.list("-timestamp", 200),
  });

  const logAgain = async (p) => {
    try {
      const now = new Date().toISOString();
      const sightings = [...sightingsOf(p), now];
      await base44.entities.Presence.update(p.id, { sightings, timestamp: now });
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success(`Noted — ${p.label || p.vibe || "presence"} sensed again`);
      onClose?.();
    } catch (e) {
      toast.error(e.message || "Couldn't log that");
    }
  };

  if (creating || presences.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {presences.length > 0 && (
          <button onClick={() => setCreating(false)} className="text-xs text-primary hover:text-primary/80 mb-2">
            ← Back to recorded presences
          </button>
        )}
        <PresenceForm onSaved={onClose} onCancel={presences.length ? () => setCreating(false) : onClose} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-2">
      <p className="text-xs text-muted-foreground">
        Sensing one you've recorded before? Tap it to note it's here again. Otherwise record a new one.
      </p>
      <div className="space-y-1.5">
        {presences.map((p) => {
          const count = sightingsOf(p).length;
          return (
            <button
              key={p.id}
              onClick={() => logAgain(p)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 text-left transition-colors"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                style={{ backgroundColor: p.color ? `${p.color}30` : "hsl(var(--muted))", boxShadow: p.color ? `inset 0 0 0 2px ${p.color}` : undefined }}
              >
                {p.emoji || "🌫️"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.label || p.vibe || "Unnamed presence"}</p>
                <p className="text-xs text-muted-foreground">
                  {count > 1 ? `seen ${count}×` : "seen once"}
                  {p.timestamp ? ` · last ${formatDistanceToNow(new Date(p.timestamp), { addSuffix: true })}` : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <Button variant="outline" onClick={() => setCreating(true)} className="w-full gap-1.5">
        <Plus className="w-4 h-4" /> Record a new presence
      </Button>
    </div>
  );
}
