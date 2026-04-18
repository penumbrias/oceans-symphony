import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow } from "date-fns";

export default function CurrentSymptoms() {
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
    refetchInterval: 60000,
  });

  const { data: definitions = [] } = useQuery({
    queryKey: ["symptomDefinitions"],
    queryFn: () => base44.entities.SymptomDefinition.list(),
  });

  const defsById = Object.fromEntries(definitions.map((d) => [d.id, d]));

  const activeWithDefs = activeSessions
    .map((s) => ({ session: s, def: defsById[s.symptom_definition_id] }))
    .filter((x) => x.def && !x.def.is_archived);

  if (activeWithDefs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
        Active Symptoms
      </p>
      <div className="flex flex-wrap gap-2">
        {activeWithDefs.map(({ session, def }) => (
          <div
            key={session.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"
            style={{
              borderColor: def.color || "#8B5CF6",
              backgroundColor: `${def.color || "#8B5CF6"}15`,
              color: def.color || "#8B5CF6",
            }}
          >
            <span>{def.name}</span>
            <span className="opacity-60 font-normal">
              · {formatDistanceToNow(new Date(session.start_time), { addSuffix: false })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}