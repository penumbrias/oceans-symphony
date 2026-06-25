import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, Folder, FolderTree, Plus, ArrowLeft, Settings2 } from "lucide-react";
import AlterCard from "./AlterCard";
import SubsystemActionMenu from "./SubsystemActionMenu";
import GroupIcon from "@/components/shared/GroupIcon";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import useLongPress from "@/hooks/useLongPress";
import { useTerms } from "@/lib/useTerms";
import { groupNameColor } from "@/lib/contrast";
import {
  getSubsystemsOwnedBy,
  getMemberAlters,
  MAX_SUBSYSTEM_DEPTH,
} from "@/lib/subsystemUtils";

// Renders the alters-section list with subsystems nested inline. An alter
// that owns a subsystem gets an expander beside the activity bolt; owning
// more than one shows a chooser first. Members nest inline UNTIL the
// indentation would get too deep to stay readable — at which point, rather
// than opening the subsystem's profile, the whole list "drills in" with a
// breadcrumb (exactly like the groups section): the chosen subsystem
// becomes a fresh top-level view you can back out of.
//
// SAFETY: recursion is bounded by a per-branch visited-alter set AND a
// hard depth clamp, so an ownership loop renders as a truncated branch
// rather than spinning forever (the cycle-guard rule from CLAUDE.md).

const INDENT_PX = 16;
const MAX_INLINE_DEPTH = 3;
const EMPTY_SET = new Set();

function brighten(hex, amt = 0.45) {
  if (typeof hex !== "string") return null;
  const c = hex.replace("#", "");
  if (c.length !== 6 || /[^0-9a-f]/i.test(c)) return null;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const up = (x) => Math.round(x + (255 - x) * amt).toString(16).padStart(2, "0");
  return `#${up(r)}${up(g)}${up(b)}`;
}

function SubsystemAccessory({ group, count = 1, tint, iconUrl, expanded, inlineExpandable, onToggle, onOpen, onMenu }) {
  const [resolved, setResolved] = useState(null);
  // Single: the subsystem's own avatar. Multi: the alter's optional
  // "subsystems icon" (set on their profile, picked from assets).
  useEffect(() => {
    const src = count > 1 ? iconUrl : group?.avatar_url;
    if (!src) { setResolved(null); return; }
    resolveImageUrl(src).then(setResolved).catch(() => setResolved(null));
  }, [group?.avatar_url, iconUrl, count]);
  const color = group?.color || tint || undefined;
  const ring = brighten(color) || "#a5b4fc";
  const showImg = !!resolved;
  const press = useLongPress({
    onClick: () => (inlineExpandable ? onToggle() : onOpen()),
    onLongPress: () => onMenu(),
  });
  return (
    <button
      type="button"
      {...press}
      aria-expanded={inlineExpandable ? expanded : undefined}
      title={count > 1
        ? `${count} subsystems — tap to ${expanded ? "hide" : "list"}`
        : (inlineExpandable ? `${expanded ? "Hide" : "Show"} ${group?.name} — hold for options` : `Open ${group?.name} — hold for options`)}
      className={`flex-shrink-0 ${(count > 1 && !showImg) ? "px-1.5 gap-0.5" : "w-8"} h-8 rounded-full flex items-center justify-center overflow-hidden border transition-all hover:scale-105`}
      style={{
        backgroundColor: showImg ? "transparent" : color ? `${color}20` : "hsl(var(--muted))",
        borderColor: color ? `${color}55` : "hsl(var(--border))",
        boxShadow: expanded ? `0 0 0 2px ${ring}` : undefined,
        touchAction: "pan-y",
      }}
    >
      {showImg ? (
        <img src={resolved} alt="" className="w-full h-full object-cover" />
      ) : count > 1 ? (
        <><FolderTree className="w-3.5 h-3.5" style={{ color }} /><span className="text-[0.625rem] font-semibold" style={{ color }}>{count}</span></>
      ) : (inlineExpandable && expanded
        ? <ChevronDown className="w-4 h-4" style={{ color }} />
        : <Folder className="w-4 h-4" style={{ color }} />)}
    </button>
  );
}

export default function SubsystemAlterList({ topAlters, allAlters, allGroups, activeSessions, anonymize, persistKey }) {
  const t = useTerms();
  // Breadcrumb drill-in stack of subsystems (groups). Empty = top level.
  // Persisted to sessionStorage (when persistKey is set) so leaving for an
  // alter profile and coming back lands you where you were.
  const storeKey = persistKey ? `subsysNav_${persistKey}` : null;
  const [navStack, setNavStack] = useState(() => {
    if (!storeKey) return [];
    try { const raw = sessionStorage.getItem(storeKey); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [rootMenuGroup, setRootMenuGroup] = useState(null);

  // Which owner-rows / subsystems are expanded inline. One flat Set of ids
  // (alter ids and group ids never collide) persisted to sessionStorage, so
  // leaving for an alter profile and coming back keeps every subsystem you'd
  // opened expanded instead of collapsing back to default.
  const expandKey = persistKey ? `subsysExpanded_${persistKey}` : null;
  const [expandedIds, setExpandedIds] = useState(() => {
    if (!expandKey) return new Set();
    try { const raw = sessionStorage.getItem(expandKey); return new Set(raw ? JSON.parse(raw) : []); } catch { return new Set(); }
  });
  useEffect(() => {
    if (!expandKey) return;
    try { sessionStorage.setItem(expandKey, JSON.stringify([...expandedIds])); } catch { /* storage off */ }
  }, [expandedIds, expandKey]);
  const toggleExpanded = useCallback((id) => {
    setExpandedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const expandOn = useCallback((id) => {
    setExpandedIds((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  useEffect(() => {
    if (!storeKey) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify(navStack)); } catch { /* storage off */ }
  }, [navStack, storeKey]);

  // Drop any breadcrumb entries whose group was deleted while away.
  useEffect(() => {
    if (!storeKey || navStack.length === 0 || allGroups.length === 0) return;
    const valid = navStack.filter((g) => allGroups.some((x) => x.id === g.id));
    if (valid.length !== navStack.length) setNavStack(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, storeKey]);

  const current = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const displayAlters = current ? getMemberAlters(current, allAlters) : topAlters;
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  // Drilling into a subsystem replaces the view (breadcrumb) instead of
  // indenting further. Guard against pushing a group already in the trail.
  const drillInto = (group) => {
    if (!group || navStack.some((g) => g.id === group.id)) return;
    setNavStack((s) => [...s, group]);
  };

  // Seed the visited set with the owners along the breadcrumb so a member
  // can't re-expand an ancestor and loop.
  const baseVisited = useMemo(() => {
    const s = new Set();
    for (const g of navStack) if (g.owner_alter_id) s.add(g.owner_alter_id);
    return s;
  }, [navStack]);

  return (
    <div className="flex flex-col gap-2">
      {navStack.length > 0 && (
        <div className="flex items-center gap-1 text-xs border-b border-border/50 pb-1.5 min-w-0">
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

      {displayAlters.map((alter, i) => (
        <SubsystemNode
          key={alter.id}
          alter={alter}
          index={i}
          depth={0}
          visited={baseVisited}
          allAlters={allAlters}
          allGroups={allGroups}
          activeSessions={activeSessions}
          anonymize={anonymize}
          onDrillInto={drillInto}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          expandOn={expandOn}
        />
      ))}

      {current && displayAlters.length === 0 && (
        <button
          type="button"
          onClick={() => setRootMenuGroup(current)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/20 transition-colors text-sm"
        >
          <span className="w-7 h-7 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0">
            <Plus className="w-4 h-4" />
          </span>
          Add a member to {current.name}
        </button>
      )}

      {rootMenuGroup && <SubsystemActionMenu group={rootMenuGroup} onClose={() => setRootMenuGroup(null)} />}
    </div>
  );
}

function SubsystemNode({ alter, index, depth, visited, allAlters, allGroups, activeSessions, anonymize, onDrillInto, expandedIds, toggleExpanded, expandOn }) {
  // Expand state is lifted to SubsystemAlterList (persisted across remounts) —
  // keyed by alter id (this owner's section) and subsystem group id.
  const expanded = expandedIds.has(alter.id);
  const [menuGroup, setMenuGroup] = useState(null);

  const ownedSubs = getSubsystemsOwnedBy(allGroups, alter.id);
  const loopOrTooDeep = visited.has(alter.id) || depth > MAX_SUBSYSTEM_DEPTH;
  const hasSub = ownedSubs.length > 0 && !loopOrTooDeep;
  const multi = ownedSubs.length > 1;
  // Inline = members nest here; otherwise drilling in resets the view.
  const inlineExpandable = hasSub && depth < MAX_INLINE_DEPTH;
  const nextVisited = hasSub ? new Set(visited).add(alter.id) : visited;
  const indentStyle = { marginLeft: INDENT_PX, paddingLeft: INDENT_PX / 2 };

  return (
    <div>
      <AlterCard
        alter={alter}
        index={index}
        activeSessions={activeSessions}
        anonymize={anonymize}
        rightAccessory={hasSub ? (
          <SubsystemAccessory
            group={multi ? null : ownedSubs[0]}
            count={ownedSubs.length}
            tint={(multi ? alter.color : ownedSubs[0]?.color) || undefined}
            iconUrl={alter.subsystems_icon || undefined}
            expanded={expanded}
            inlineExpandable={inlineExpandable}
            onToggle={() => toggleExpanded(alter.id)}
            // Single, too deep to nest → drill in (breadcrumb). Multi → just
            // toggle the chooser (it's shallow, fine at any depth).
            onOpen={() => (multi ? toggleExpanded(alter.id) : onDrillInto?.(ownedSubs[0]))}
            onMenu={() => (multi ? expandOn(alter.id) : setMenuGroup(ownedSubs[0]))}
          />
        ) : null}
      />

      {hasSub && expanded && (
        <div className="border-l-2 border-border/40 mt-2 flex flex-col gap-2" style={indentStyle}>
          {multi ? (
            // All subsystems stay listed — each opens/closes independently, so
            // several can be expanded at once.
            ownedSubs.map((sub) => {
              const subExpanded = expandedIds.has(sub.id);
              const subMembers = (subExpanded && inlineExpandable) ? getMemberAlters(sub, allAlters) : [];
              return (
                <div key={sub.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      // At the depth cap, picking a subsystem drills in
                      // (breadcrumb); otherwise it toggles members inline.
                      onClick={() => (inlineExpandable ? toggleExpanded(sub.id) : onDrillInto?.(sub))}
                      className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left min-w-0"
                      style={{ borderLeftColor: sub.color || "transparent", borderLeftWidth: sub.color ? 3 : 1 }}
                    >
                      <GroupIcon group={sub} className="w-4 h-4" />
                      <span className="text-sm flex-1 truncate" style={{ color: groupNameColor(sub.color) }}>{sub.emoji ? `${sub.emoji} ` : ""}{sub.name}</span>
                      <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{getMemberAlters(sub, allAlters).length}</span>
                      {inlineExpandable && subExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    </button>
                    <button type="button" onClick={() => setMenuGroup(sub)} title="Options"
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60">
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>
                  {subExpanded && inlineExpandable && (
                    <div className="border-l-2 border-border/40 flex flex-col gap-2" style={indentStyle}>
                      {subMembers.length > 0 ? (
                        subMembers.map((m, j) => (
                          <SubsystemNode key={m.id} alter={m} index={j} depth={depth + 1} visited={nextVisited}
                            allAlters={allAlters} allGroups={allGroups} activeSessions={activeSessions} anonymize={anonymize} onDrillInto={onDrillInto}
                            expandedIds={expandedIds} toggleExpanded={toggleExpanded} expandOn={expandOn} />
                        ))
                      ) : (
                        <button type="button" onClick={() => setMenuGroup(sub)}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/20 transition-colors text-sm">
                          <span className="w-7 h-7 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0"><Plus className="w-4 h-4" /></span>
                          Add a member to {sub.name}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : inlineExpandable ? (
            (() => {
              const sub = ownedSubs[0];
              const subMembers = getMemberAlters(sub, allAlters);
              return subMembers.length > 0 ? (
                subMembers.map((m, j) => (
                  <SubsystemNode key={m.id} alter={m} index={j} depth={depth + 1} visited={nextVisited}
                    allAlters={allAlters} allGroups={allGroups} activeSessions={activeSessions} anonymize={anonymize} onDrillInto={onDrillInto}
                    expandedIds={expandedIds} toggleExpanded={toggleExpanded} expandOn={expandOn} />
                ))
              ) : (
                <button type="button" onClick={() => setMenuGroup(sub)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/20 transition-colors text-sm">
                  <span className="w-7 h-7 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0"><Plus className="w-4 h-4" /></span>
                  Add a member to {sub.name}
                </button>
              );
            })()
          ) : null}
        </div>
      )}

      {menuGroup && <SubsystemActionMenu group={menuGroup} onClose={() => setMenuGroup(null)} />}
    </div>
  );
}
