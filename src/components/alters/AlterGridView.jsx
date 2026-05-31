import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Folder, ArrowLeft } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { isValidHexColor } from "@/lib/colorUtils";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getSubsystemsOwnedBy, getMemberAlters, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";
import { needsHalo, getSurfaceBackground, adjustForContrast } from "@/lib/contrast";
import AlterActionMenu from "./AlterActionMenu";
import SubsystemActionMenu from "./SubsystemActionMenu";

const EMPTY_SET = new Set();
// Past this nesting depth, stop expanding inline (a tinted card inside a
// tinted card inside… gets unreadable on a phone) and open the deeper
// subsystem's profile instead.
const MAX_GRID_INLINE_DEPTH = 3;

function AlterCard({ alter, fronting, isPrimary, compact, onTap, onSwipeRight, onSwipeLeft, onSwipeLeftUp, anonymize = "off", ownsSubsystem = false, expanded = false, onToggleExpand, activeSessions = [] }) {
  const formatAlter = useAlterLabel();
  const [menuOpen, setMenuOpen] = useState(false);
  // Falls back to the default purple for missing OR invalid colours
  // (e.g. "#8b5c1" — 5 hex digits, not parseable by CSS) so a single
  // malformed alter doesn't render as a blank uncoloured tile next
  // to its siblings.
  const alterColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const { bind, dragX, swipeHint } = useSwipeActions({ onTap, onSwipeRight, onSwipeLeft, onSwipeLeftUp, onLongPress: () => setMenuOpen(true) });

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
      {menuOpen && <AlterActionMenu alter={alter} activeSessions={activeSessions} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], allGroups = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compact = cols >= 4;
  const [expandedOwners, setExpandedOwners] = useState(new Set());
  const [subsystemMenuGroup, setSubsystemMenuGroup] = useState(null);
  // For owners with multiple subsystems: which one's members are shown
  // (keyed by alter id). Absent → show the chooser.
  const [gridActiveSub, setGridActiveSub] = useState({});
  const setActiveSubFor = (alterId, subId) => setGridActiveSub((m) => ({ ...m, [alterId]: subId }));

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
    activeSessions,
  });

  // Recursive node: a card, plus (when expanded) a full-width tinted
  // container holding the subsystem's members as their own grid — each of
  // which can itself expand. Cycle-guarded by a per-branch visited set and
  // the hard depth clamp; past MAX_GRID_INLINE_DEPTH the chevron opens the
  // subsystem's profile instead of nesting another card.
    const ICON = (compact ? "w-14 h-14" : "w-16 h-16");
    const renderNode = (alter, visited, depth) => {
    const ownedSubs = getSubsystemsOwnedBy(allGroups, alter.id);
    const loopOrTooDeep = visited.has(alter.id) || depth > MAX_SUBSYSTEM_DEPTH;
    const hasSub = ownedSubs.length > 0 && !loopOrTooDeep;
    const multi = ownedSubs.length > 1;
    const inlineExpandable = hasSub && depth < MAX_GRID_INLINE_DEPTH;
    const expanded = inlineExpandable && expandedOwners.has(alter.id);
    const activeSub = !hasSub ? null : (multi ? ownedSubs.find((s) => s.id === gridActiveSub[alter.id]) || null : ownedSubs[0]);
    const members = (expanded && activeSub) ? getMemberAlters(activeSub, allAlters) : [];
    const ownerColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
    const low = needsHalo(ownerColor, surfaceBg);
    const borderColor = low ? adjustForContrast(ownerColor, surfaceBg) : ownerColor;
    const nextVisited = hasSub ? new Set(visited).add(alter.id) : visited;

    return (
      <React.Fragment key={alter.id}>
        <AlterCard
          alter={alter}
          {...cardProps(alter)}
          ownsSubsystem={hasSub}
          expanded={!!expanded}
          onToggleExpand={() =>
            inlineExpandable ? toggleExpand(alter.id) : navigate(`/group/${ownedSubs[0].id}`)
          }
        />
        {expanded && (
          <div
            style={{
              gridColumn: "1 / -1",
              backgroundColor: `${ownerColor}26`, // ~0.15–0.3 tint
              border: `1px solid ${borderColor}`,
            }}
            className="rounded-2xl p-3"
          >
            {multi && !activeSub ? (
              // Chooser: tiles for each of the alter's subsystems.
              <>
                <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-2 px-1">Subsystems</p>
                <div className={`grid ${colsClass} gap-3`}>
                  {ownedSubs.map((sub) => (
                    <button key={sub.id} type="button" onClick={() => setActiveSubFor(alter.id, sub.id)}
                      className="flex flex-col items-center gap-2 select-none" title={sub.name}>
                      <span className={`rounded-full border-2 flex items-center justify-center ${ICON}`}
                        style={{ borderColor: sub.color || "hsl(var(--border))", backgroundColor: sub.color ? `${sub.color}20` : "hsl(var(--muted))" }}>
                        <Folder className="w-5 h-5" style={{ color: sub.color || "hsl(var(--muted-foreground))" }} />
                      </span>
                      <span className="text-xs text-center font-medium truncate w-full px-1">{sub.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : activeSub ? (
              <>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground truncate">{activeSub.name}</p>
                  {multi && (
                    <button type="button" onClick={() => setActiveSubFor(alter.id, null)}
                      className="text-[0.625rem] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 flex-shrink-0">
                      <ArrowLeft className="w-3 h-3" /> All
                    </button>
                  )}
                </div>
                <div className={`grid ${colsClass} gap-3`}>
                  {members.map((m) => renderNode(m, nextVisited, depth + 1))}
                  <button type="button" onClick={() => setSubsystemMenuGroup(activeSub)}
                    className="flex flex-col items-center gap-2 select-none" title={`Manage ${activeSub.name}`}>
                    <span className={`rounded-full border-2 border-dashed border-border/70 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors ${ICON}`}>
                      <Plus className="w-5 h-5" />
                    </span>
                    <span className="text-xs text-center font-medium text-muted-foreground">{members.length === 0 ? "Add member" : "Manage"}</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <>
      <div className={`grid ${colsClass} gap-3`}>
        {alters.map((alter) => renderNode(alter, EMPTY_SET, 0))}
      </div>
      {subsystemMenuGroup && <SubsystemActionMenu group={subsystemMenuGroup} onClose={() => setSubsystemMenuGroup(null)} />}
    </>
  );
}
