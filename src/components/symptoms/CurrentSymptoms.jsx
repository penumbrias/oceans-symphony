import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow } from "date-fns";

export default function CurrentSymptoms({ onOpenCheckIn }) {
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
    refetchInterval: 60000,
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const symptomsById = Object.fromEntries(symptoms.map(s => [s.id, s]));

  const active = activeSessions
    .map(sess => ({ sess, symptom: symptomsById[sess.symptom_id] }))
    .filter(x => x.symptom && !x.symptom.is_archived);

  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Active Symptoms</p>
      <div className="flex flex-wrap gap-2">
        {active.map(({ sess, symptom }) => (
          <button
            key={sess.id}
            onClick={() => onOpenCheckIn?.("symptoms")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-80"
            style={{ borderColor: symptom.color || "#8B5CF6", backgroundColor: `${symptom.color || "#8B5CF6"}15`, color: symptom.color || "#8B5CF6" }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: symptom.color || "#8B5CF6" }} />
            {symptom.label}
            <span className="opacity-60 font-normal">
              · {formatDistanceToNow(new Date(sess.start_time))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}