// The one door to the emergency card from Quick Support, the Safety Plan
// and Contacts (v0.368.0). Opens it full screen when it has something on
// it, or its Info to fill it in when it's empty.

import React from "react";
import { useNavigate } from "react-router-dom";
import { Siren, ChevronRight } from "lucide-react";
import { useEmergencyCard } from "@/lib/useEmergencyCard";

export default function EmergencyCardLink({ className = "" }) {
  const navigate = useNavigate();
  const { sections, isFetched } = useEmergencyCard();
  if (!isFetched) return null;
  const filled = sections.length > 0;
  return (
    <button type="button" onClick={() => navigate(filled ? "/emergency?show=1" : "/emergency?edit=1")}
      className={`w-full flex items-center gap-3 min-h-[52px] px-4 py-2 rounded-xl border border-border bg-card text-left hover:bg-muted/40 ${className}`}>
      <Siren className="w-5 h-5 text-foreground flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold">{filled ? "Show my emergency info" : "Set up emergency info"}</span>
        <span className="block text-xs text-muted-foreground">
          {filled ? "For someone helping you when you can't speak" : "What a helper should know, if you can't speak"}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}
