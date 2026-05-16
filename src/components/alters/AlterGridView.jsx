import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor } from "@/hooks/useSwipeActions";
import { isValidHexColor } from "@/lib/colorUtils";

function AlterCard({ alter, fronting, isPrimary, compact, onTap, onSwipeRight, onSwipeLeft, anonymize = "off" }) {
  // Falls back to the default purple for missing OR invalid colours
  // (e.g. "#8b5c1" — 5 hex digits, not parseable by CSS) so a single
  // malformed alter doesn't render as a blank uncoloured tile next
  // to its siblings.
  const alterColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const { bind, dragX, swipeHint } = useSwipeActions({ onTap, onSwipeRight, onSwipeLeft });

  const boxShadow = fronting
    ? isPrimary
      ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
      : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
    : `inset 0 0 0 2px ${alterColor}80`;
  const sizeClass = compact
    ? (fronting ? "w-16 h-16" : "w-14 h-14")
    : (fronting ? "w-20 h-20" : "w-16 h-16");

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        className="relative"
        {...bind}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {resolvedUrl && !imgError ? (
          <img
            src={resolvedUrl}
            alt={alter.name}
            style={{ boxShadow }}
            className={`rounded-full object-cover transition-all cursor-pointer ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
              boxShadow,
            }}
            className={`rounded-full flex items-center justify-center transition-all cursor-pointer ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
          >
            <span className="text-xs font-semibold text-muted-foreground">
              {alter.name.slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      {swipeHint && (
        <span className={`text-[0.625rem] font-semibold uppercase tracking-wide ${swipeHint === "front" ? "text-emerald-500" : "text-amber-500"}`}>
          {swipeHint === "front" ? (fronting ? "Remove" : "Add") : (isPrimary ? "Demote" : "Promote")}
        </span>
      )}
      {!swipeHint && (
        <span className={`text-xs text-center font-medium truncate w-full px-1 ${anonymize !== "off" ? "blur-sm" : ""}`}>
          {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
        </span>
      )}
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compact = cols >= 4;

  const toggleFront = (alter) => toggleFrontFor(alter, activeSessions, base44, queryClient, toast);
  const togglePrimary = (alter) => togglePrimaryFor(alter, activeSessions, base44, queryClient, toast);

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);

  const colsClass = {
    2: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    3: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
    4: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
    5: "grid-cols-5 sm:grid-cols-6 md:grid-cols-7",
  }[cols] || "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {alters.map((alter) => (
        <AlterCard
          key={alter.id}
          alter={alter}
          fronting={isFronting(alter.id)}
          // Match an explicit primary row — if duplicate active sessions
          // exist for this alter, `.find()`'s first-match behaviour could
          // return a non-primary row even when a primary one also exists.
          isPrimary={activeSessions.some(s => s.alter_id === alter.id && s.is_primary)}
          compact={compact}
          onTap={() => navigate(`/alter/${alter.id}`)}
          onSwipeRight={() => toggleFront(alter)}
          onSwipeLeft={() => togglePrimary(alter)}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}
