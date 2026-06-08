import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, ArrowLeft } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { isValidHexColor } from "@/lib/colorUtils";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getSubsystemsOwnedBy, getMemberAlters, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";
import { needsHalo, getSurfaceBackground, adjustForContrast, groupNameColor } from "@/lib/contrast";
import AlterActionMenu from "./AlterActionMenu";
import SubsystemActionMenu from "./SubsystemActionMenu";
import GroupIcon from "@/components/shared/GroupIcon";

const EMPTY_SET = new Set();
// Past this nesting depth the tinted-card-inside-tinted-card shrinks toward
// half the screen width and gets cramped on a phone — so instead of nesting
// another level inline, the whole grid "drills in" with a breadcrumb (exactly
// like the list view and the groups section): the deeper subsystem becomes a
// fresh top-level view you can back out of, no redirect to its profile.
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
            className={`rounded-full object-cover transition-all cursor-pointer ${sizeClass} ${anonymizeBlurAvatars(anonymize) ? "blur-sm" : ""}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
              boxShadow,
            }}
            className={`rounded-full flex items-center justify-center transition-all cursor-pointer ${sizeClass} ${anonymizeBlurAvatars(anonymize) ? "blur-sm" : ""}`}
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
          className={`text-xs text-center font-medium truncate w-full px-1 ${anonymizeBlurNames(anonymize) ? "blur-sm" : ""}`}
        >
          {alter.emoji ? <span className="mr-0.5">{alter.emoji}</span> : null}{formatAlter(alter)}
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

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], allGroups = [], cols = 3, anonymize = "off", persistKey }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();
  const compact = cols >= 4;
  const [expandedOwners, setExpandedOwners] = useState(new Set());
  const [subsystemMenuGroup, setSubsystemMenuGroup] = useState(null);
  // For owners with multiple subsystems: which one's members are shown
  // (keyed by node PATH, not alter id — the same alter can appear in more
  // than one branch and each instance expands independently). Absent → chooser.
  const [gridActiveSub, setGridActiveSub] = useState({});
  const setActiveSubFor = (path, subId) => setGridActiveSub((m) => ({ ...m, [path]: subId }));

  // Breadcrumb drill-in stack of subsystems (groups). Empty = top level.
  // Once inline nesting would get too cramped, drilling resets the grid to
  // that subsystem's members at the top with a breadcrumb — same model as
  // the list view. Persisted to sessionStorage when persistKey is set so
  // leaving for a profile and coming back lands you where you were.
  const storeKey = persistKey ? `gridSubsysNav_${persistKey}` : null;
  const [navStack, setNavStack] = useState(() => {
    if (!storeKey) return [];
    try { const raw = sessionStorage.getItem(storeKey); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => {
    if (!storeKey) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify(navStack)); } catch { /* storage off */ }
  }, [navStack, storeKey]);
  // Drop breadcrumb entries whose group was deleted while away.
  useEffect(() => {
    if (!storeKey || navStack.length === 0 || allGroups.length === 0) return;
    const valid = navStack.filter((g) => allGroups.some((x) => x.id === g.id));
    if (valid.length !== navStack.length) setNavStack(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, storeKey]);

  const current = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const displayAlters = current ? getMemberAlters(current, allAlters) : alters;

  // Drilling into a subsystem replaces the view (breadcrumb) instead of
  // nesting another level. Guard against pushing a group already in the trail.
  const drillInto = (group) => {
    if (!group || navStack.some((g) => g.id === group.id)) return;
    setNavStack((s) => [...s, group]);
    // Collapse inline expansion state so the new top level starts clean.
    setExpandedOwners(new Set());
    setGridActiveSub({});
  };
  // Seed the visited set with the breadcrumb owners so a member can't
  // re-expand an ancestor and loop.
  const baseVisited = useMemo(() => {
    const s = new Set();
    for (const g of navStack) if (g.owner_alter_id) s.add(g.owner_alter_id);
    return s;
  }, [navStack]);

  const toggleFront = (alter) => toggleFrontFor(alter, activeSessions, base44, queryClient, toast, t);
  const togglePrimary = (alter) => togglePrimaryFor(alter, activeSessions, base44, queryClient, toast, t);
  const replaceFront = (alter) => replaceFrontWith(alter, base44, queryClient, toast, t);

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
    // `path` uniquely identifies THIS instance of the alter in the tree
    // (ancestor ids joined). Expansion state is keyed by path, not by
    // alter.id — otherwise expanding one instance of an alter expanded
    // every other instance of them too. Members expand inline at any
    // depth (the cards stay full-size in full-width tinted cards, so it
    // doesn't get cramped like the indented list); bounded only by the
    // cycle guard + hard depth clamp.
    const renderNode = (alter, visited, depth, path) => {
    const ownedSubs = getSubsystemsOwnedBy(allGroups, alter.id);
    const loopOrTooDeep = visited.has(alter.id) || depth > MAX_SUBSYSTEM_DEPTH;
    const hasSub = ownedSubs.length > 0 && !loopOrTooDeep;
    const multi = ownedSubs.length > 1;
    // Inline = members nest here; otherwise drilling in resets the view.
    const inlineExpandable = hasSub && depth < MAX_GRID_INLINE_DEPTH;
    const expanded = hasSub && expandedOwners.has(path);
    const activeSub = !hasSub ? null : (multi ? ownedSubs.find((s) => s.id === gridActiveSub[path]) || null : ownedSubs[0]);
    const members = (expanded && activeSub && inlineExpandable) ? getMemberAlters(activeSub, allAlters) : [];
    const ownerColor = isValidHexColor(alter.color) ? alter.color : "#9333ea";
    const low = needsHalo(ownerColor, surfaceBg);
    const borderColor = low ? adjustForContrast(ownerColor, surfaceBg) : ownerColor;
    const nextVisited = hasSub ? new Set(visited).add(alter.id) : visited;

    return (
      <React.Fragment key={path}>
        <AlterCard
          alter={alter}
          {...cardProps(alter)}
          ownsSubsystem={hasSub}
          expanded={!!expanded}
          // Multi → toggle the chooser (shallow, fine at any depth). Single &
          // shallow → nest inline. Single & too deep → drill in (breadcrumb).
          onToggleExpand={() =>
            multi || inlineExpandable ? toggleExpand(path) : drillInto(ownedSubs[0])
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
                    <button key={sub.id} type="button"
                      onClick={() => (inlineExpandable ? setActiveSubFor(path, sub.id) : drillInto(sub))}
                      className="flex flex-col items-center gap-2 select-none" title={sub.name}>
                      <GroupIcon group={sub} boxed className={ICON} boxClassName="rounded-full border-2 border-border/50" iconClassName="w-5 h-5" />
                      <span className="text-xs text-center font-medium truncate w-full px-1" style={{ color: groupNameColor(sub.color) }}>{sub.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : activeSub ? (
              <>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground truncate" style={{ color: groupNameColor(activeSub.color) }}>{activeSub.name}</p>
                  {multi && (
                    <button type="button" onClick={() => setActiveSubFor(path, null)}
                      className="text-[0.625rem] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 flex-shrink-0">
                      <ArrowLeft className="w-3 h-3" /> All
                    </button>
                  )}
                </div>
                <div className={`grid ${colsClass} gap-3`}>
                  {members.map((m) => renderNode(m, nextVisited, depth + 1, `${path}/${m.id}`))}
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
      {navStack.length > 0 && (
        <div className="flex items-center gap-1 text-xs border-b border-border/50 pb-1.5 mb-3 min-w-0">
          <button onClick={() => setNavStack([])} className="text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" /> All {t.alters}
          </button>
          {navStack.map((g, i) => {
            const isLast = i === navStack.length - 1;
            return (
              <React.Fragment key={g.id}>
                <span className="text-muted-foreground/40 flex-shrink-0">/</span>
                {isLast ? (
                  <span className="font-medium text-foreground truncate min-w-0 px-0.5" style={{ color: groupNameColor(g.color) }}>{g.name}</span>
                ) : (
                  <button onClick={() => setNavStack(navStack.slice(0, i + 1))} className="text-muted-foreground hover:text-foreground truncate min-w-0 max-w-[7rem] px-0.5">
                    {g.name}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      <div className={`grid ${colsClass} gap-3`}>
        {displayAlters.map((alter) => renderNode(alter, baseVisited, 0, alter.id))}
        {current && (
          <button type="button" onClick={() => setSubsystemMenuGroup(current)}
            className="flex flex-col items-center gap-2 select-none" title={`Manage ${current.name}`}>
            <span className={`rounded-full border-2 border-dashed border-border/70 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors ${ICON}`}>
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-xs text-center font-medium text-muted-foreground">{displayAlters.length === 0 ? "Add member" : "Manage"}</span>
          </button>
        )}
      </div>
      {subsystemMenuGroup && <SubsystemActionMenu group={subsystemMenuGroup} onClose={() => setSubsystemMenuGroup(null)} />}
    </>
  );
}
