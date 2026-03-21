import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { User, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterChip({ alter, isPrimary, startTime }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  return (
    <Link to={`/alter/${alter.id}`}>
      <div className="flex items-center gap-2.5 bg-card border border-border/50 rounded-2xl px-3 py-2.5 hover:border-border transition-all min-w-0">
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-border/30"
            style={{ backgroundColor: bg || "hsl(var(--muted))" }}
          >
            {alter.avatar_url ? (
              <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
            )}
          </div>
          {isPrimary && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
              <Zap className="w-2 h-2 text-white" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{alter.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {isPrimary ? "Primary · " : "Co-fronter · "}
            {formatDistanceToNow(new Date(startTime), { addSuffix: false })}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function CurrentFronters({ alters }) {
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  const active = sessions.find((s) => s.is_active);
  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  if (!active) {
    return (
      <div className="bg-muted/40 border border-border/40 rounded-2xl px-4 py-4 mb-5 flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No one is currently fronting</p>
      </div>
    );
  }

  const primary = altersById[active.primary_alter_id];
  const coFronters = (active.co_fronter_ids || []).map((id) => altersById[id]).filter(Boolean);
  const all = [primary, ...coFronters].filter(Boolean);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currently Fronting</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {all.map((alter, i) => (
          <FronterChip
            key={alter.id}
            alter={alter}
            isPrimary={i === 0}
            startTime={active.start_time}
          />
        ))}
      </div>
    </div>
  );
}