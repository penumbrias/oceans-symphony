import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { isValidHexColor } from "@/lib/colorUtils";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getSubsystemsOwnedBy, getMemberAlters } from "@/lib/subsystemUtils";
import { needsHalo, getSurfaceBackground, adjustForContrast } from "@/lib/contrast";

function AlterCard({ alter, fronting, isPrimary, compact, onTap, onSwipeRight, onSwipeLeft, onSwipeLeftUp, anonymize = "off", ownsSubsystem = false, expanded = false, onToggleExpand }) {
  const formatAlter = useAlterLabel();
  // Falls back to the default purple for missing OR invalid colours
  // (e.g. "#8b5c1" — 5 hex digits, not parseable by CSS) so a single
  // malformed alter doesn't render as a blank uncoloured tile next
  // to its siblings.
  const alterColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const { bind, dragX, swipeHint } = useSwipeActions({ onTap, onSwipeRight, onSwipeLeft, onSwipeLeftUp });

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
              {(formatAlter(alter) || alter.name || "?").slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      {swipeHint && (
        <span className={`text-[0.625rem] font-semibold uppercase tracking-wide ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
          {swipeHint === "front" ? (fronting ? "Remove" : "Add") : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Promote")}
        </span>
      )}
      {!swipeHint && (
        <span
          title={formatAlter(alter)}
          className={`text-xs text-center font-medium truncate w-full px-1 ${anonymize !== "off" ? "blur-sm" : ""}`}
        >
          {formatAlter(alter)}
        </span>
      )}
      {ownsSubsystem && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
          aria-expanded={expanded}
          className="flex items-center gap-0.5 text-[0.625rem] font-medium text-primary hover:text-primary/80 -mt-1"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? "Hide" : "Members"}
        </button>
      )}
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], allGroups = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compact = cols >= 4;
  const [expandedOwners, setExpandedOwners] = useState(new Set());

  const toggleFront = (alter) => toggleFrontFor(alter, activeSessions, base44, queryClient, toast);
  const togglePrimary = (alter) => togglePrimaryFor(alter, activeSessions, base44, queryClient, toast);
  const replaceFront = (alter) => replaceFrontWith(alter, base44, queryClient, toast);

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);
  const isPrimaryOf = (alterId) => activeSessions.some(s => s.alter_id === alterId && s.is_primary);

  const toggleExpand = (id) => {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const colsClass = {
    2: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    3: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
    4: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
    5: "grid-cols-5 sm:grid-cols-6 md:grid-cols-7",
  }[cols] || "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  const surfaceBg = getSurfaceBackground();

  const cardProps = (alter) => ({
    fronting: isFronting(alter.id),
    isPrimary: isPrimaryOf(alter.id),
    compact,
    onTap: () => navigate(`/alter/${alter.id}`),
    onSwipeRight: () => toggleFront(alter),
    onSwipeLeft: () => togglePrimary(alter),
    onSwipeLeftUp: () => replaceFront(alter),
    anonymize,
  });

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {alters.map((alter) => {
        const ownedSub = getSubsystemsOwnedBy(allGroups, alter.id)[0] || null;
        const expanded = ownedSub && expandedOwners.has(alter.id);
        const members = expanded ? getMemberAlters(ownedSub, allAlters) : [];
        // Container tint = owner's colour at ~0.3, with a contrast-aware
        // border so it stays visible against the page background.
        const ownerColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
        const low = needsHalo(ownerColor, surfaceBg);
        const borderColor = low ? adjustForContrast(ownerColor, surfaceBg) : ownerColor;

        return (
          <React.Fragment key={alter.id}>
            <AlterCard
              alter={alter}
              {...cardProps(alter)}
              ownsSubsystem={!!ownedSub}
              expanded={!!expanded}
              onToggleExpand={() => toggleExpand(alter.id)}
            />
            {expanded && (
              // Full-width container that breaks the grid flow and pushes
              // the rest down; a tinted card visually unites the
              // subsystem's members beneath their parent.
              <div
                style={{
                  gridColumn: "1 / -1",
                  backgroundColor: `${ownerColor}26`, // ~0.15–0.3 tint
                  border: `1px solid ${borderColor}`,
                }}
                className="rounded-2xl p-3"
              >
                <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-2 px-1">{ownedSub.name}</p>
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-2">No members yet.</p>
                ) : (
                  <div className={`grid ${colsClass} gap-3`}>
                    {members.map((m) => (
                      <AlterCard
                        key={m.id}
                        alter={m}
                        {...cardProps(m)}
                        // Members who own their own subsystem get a chevron
                        // that opens their profile (grid keeps one level of
                        // inline expansion to stay readable).
                        ownsSubsystem={getSubsystemsOwnedBy(allGroups, m.id).length > 0}
                        expanded={false}
                        onToggleExpand={() => navigate(`/alter/${m.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
