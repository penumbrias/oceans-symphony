import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Pin, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor } from "@/hooks/useSwipeActions";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useAnonymizeMode from "@/hooks/useAnonymizeMode";

// Self-contained horizontal gallery of pinned alters. Used on the
// alters directory (above groups) AND as a toggleable Dashboard
// element, so it fetches its own data and renders nothing when no
// alter is pinned.
//
// Gestures per chip (mobile-first):
//   - tap            → toggle this alter's front
//   - hold (~400ms)  → toggle primary
// Horizontal scrolling of the strip does NOT fire a tap: useSwipeActions
// only treats a release as a tap when the finger moved < ~10px, and it
// cancels the long-press timer as soon as the finger moves, so dragging
// to scroll is safe.
export default function PinnedAltersGallery({ showHeader = true, className = "" }) {
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();
  const { mode: anonymize } = useAnonymizeMode();

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const pinned = alters
    .filter((a) => a.is_pinned && !a.is_archived)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (pinned.length === 0) return null;

  return (
    <div data-tour="pinned-alters" className={`mb-3 ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Pin className="w-3 h-3 fill-primary text-primary" /> Pinned
          </p>
          <div className="flex-1 h-px bg-border/50" />
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
        {pinned.map((a) => (
          <PinnedAlterChip
            key={a.id}
            alter={a}
            activeSessions={activeSessions}
            anonymize={anonymize}
            formatAlter={formatAlter}
            queryClient={queryClient}
          />
        ))}
      </div>
    </div>
  );
}

function PinnedAlterChip({ alter, activeSessions, anonymize, formatAlter, queryClient }) {
  const resolvedAvatar = useResolvedAvatarUrl(alter.avatar_url);
  const mySession = activeSessions.find((s) => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;
  const blurNames = anonymize !== "off";
  const blurAvatar = anonymize === "all";
  const label = formatAlter(alter);

  const { bind } = useSwipeActions({
    onTap: () => toggleFrontFor(alter, activeSessions, base44, queryClient, toast),
    onLongPress: () => togglePrimaryFor(alter, activeSessions, base44, queryClient, toast),
    longPressMs: 400,
  });

  const ringColor = fronting
    ? (isPrimary ? "#f59e0b" : (alter.color || "#8b5cf6"))
    : (alter.color || "hsl(var(--border))");

  return (
    <button
      type="button"
      {...bind}
      title={`${label} — tap to toggle ${fronting ? "off" : "on"} front, hold to set primary`}
      className="flex flex-col items-center gap-1 w-16 flex-shrink-0 select-none"
      style={{ touchAction: "pan-x" }}
    >
      <div
        className="relative w-14 h-14 rounded-full overflow-hidden border-2 flex items-center justify-center"
        style={{
          borderColor: ringColor,
          boxShadow: fronting ? `0 0 0 2px ${ringColor}55` : "none",
          backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))",
        }}
      >
        {resolvedAvatar ? (
          <img src={resolvedAvatar} alt={label} className={`w-full h-full object-cover ${blurAvatar ? "blur-md" : ""}`} />
        ) : (
          <span className="text-lg font-semibold text-foreground">
            {(alter.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        {fronting && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-card"
            style={{ backgroundColor: isPrimary ? "#f59e0b" : (alter.color || "#8b5cf6") }}
          >
            {isPrimary ? <Star className="w-2.5 h-2.5 text-white" fill="white" /> : <Zap className="w-2.5 h-2.5 text-white" fill="white" />}
          </span>
        )}
      </div>
      <span className={`text-[0.6875rem] text-foreground text-center leading-tight truncate w-full ${blurNames ? "blur-sm" : ""}`}>
        {label}
      </span>
    </button>
  );
}
