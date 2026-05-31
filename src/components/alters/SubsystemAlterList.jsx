import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Folder, FolderTree, Plus, ArrowLeft, Settings2 } from "lucide-react";
import AlterCard from "./AlterCard";
import SubsystemActionMenu from "./SubsystemActionMenu";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import useLongPress from "@/hooks/useLongPress";
import { useTerms } from "@/lib/useTerms";
import {
  getSubsystemsOwnedBy,
  getMemberAlters,
  MAX_SUBSYSTEM_DEPTH,
} from "@/lib/subsystemUtils";

// Renders the alters-section list with subsystems nested inline. An alter
// that owns a subsystem gets an expander beside the activity bolt. If they
// own MORE than one subsystem, expanding first shows a chooser of those
// subsystems; picking one shows its members (with a back link). Members
// who own their own subsystem expand further, until the indentation gets
// too deep to stay readable (then the chip opens the profile instead).
//
// SAFETY: recursion is bounded by a per-branch visited-alter set AND a
// hard depth clamp, so an ownership loop renders as a truncated branch
// rather than spinning forever (the cycle-guard rule from CLAUDE.md).

const INDENT_PX = 16;
const MAX_INLINE_DEPTH = 3;
const EMPTY_SET = new Set();

// Round folder/avatar button beside the activity bolt. Tap toggles inline
// expansion (or opens the profile when too deep); press-and-hold opens the
// subsystem actions popup. For an alter that owns multiple subsystems it
// shows a stacked-folder icon with a count instead of a single avatar.
function SubsystemAccessory({ group, count = 1, expanded, inlineExpandable, onToggle, onOpen, onMenu }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (count > 1 || !group?.avatar_url) { setResolved(null); return; }
    resolveImageUrl(group.avatar_url).then(setResolved).catch(() => setResolved(null));
  }, [group?.avatar_url, count]);
  const color = group?.color || undefined;
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
      className={`flex-shrink-0 ${count > 1 ? "px-1.5 gap-0.5" : "w-8"} h-8 rounded-full flex items-center justify-center overflow-hidden border transition-all hover:scale-105 ${expanded ? "ring-2 ring-primary/50" : ""}`}
      style={{
        backgroundColor: resolved ? "transparent" : color ? `${color}20` : "hsl(var(--muted))",
        borderColor: color ? `${color}55` : "hsl(var(--border))",
        touchAction: "pan-y",
      }}
    >
      {count > 1 ? (
        <><FolderTree className="w-3.5 h-3.5" style={{ color }} /><span className="text-[0.625rem] font-semibold" style={{ color }}>{count}</span></>
      ) : resolved ? (
        <img src={resolved} alt="" className="w-full h-full object-cover" />
      ) : (inlineExpandable && expanded
        ? <ChevronDown className="w-4 h-4" style={{ color }} />
        : <Folder className="w-4 h-4" style={{ color }} />)}
    </button>
  );
}

export default function SubsystemAlterList({ topAlters, allAlters, allGroups, activeSessions, anonymize }) {
  return (
    <div className="flex flex-col gap-2">
      {topAlters.map((alter, i) => (
        <SubsystemNode
          key={alter.id}
          alter={alter}
          index={i}
          depth={0}
          visited={EMPTY_SET}
          allAlters={allAlters}
          allGroups={allGroups}
          activeSessions={activeSessions}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}

function SubsystemNode({ alter, index, depth, visited, allAlters, allGroups, activeSessions, anonymize }) {
  const navigate = useNavigate();
  const t = useTerms();
  const [expanded, setExpanded] = useState(false);
  const [activeSubId, setActiveSubId] = useState(null);
  const [menuGroup, setMenuGroup] = useState(null);

  const ownedSubs = getSubsystemsOwnedBy(allGroups, alter.id);
  const loopOrTooDeep = visited.has(alter.id) || depth > MAX_SUBSYSTEM_DEPTH;
  const hasSub = ownedSubs.length > 0 && !loopOrTooDeep;
  const multi = ownedSubs.length > 1;
  const inlineExpandable = hasSub && depth < MAX_INLINE_DEPTH;
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  // Which subsystem's members are shown: the only one (single), or the
  // chosen one (multi). Null in multi mode means "show the chooser".
  const activeSub = !hasSub ? null : (multi ? ownedSubs.find((s) => s.id === activeSubId) || null : ownedSubs[0]);
  const members = (expanded && activeSub) ? getMemberAlters(activeSub, allAlters) : [];
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
            expanded={expanded}
            inlineExpandable={inlineExpandable}
            onToggle={() => setExpanded((v) => !v)}
            onOpen={() => (multi ? setExpanded((v) => !v) : navigate(`/group/${ownedSubs[0].id}`))}
            onMenu={() => (multi ? setExpanded(true) : setMenuGroup(ownedSubs[0]))}
          />
        ) : null}
      />

      {hasSub && expanded && (
        <div className="border-l-2 border-border/40 mt-2 flex flex-col gap-2" style={indentStyle}>
          {multi && !activeSub ? (
            // Chooser: list the alter's subsystems; pick one to view.
            ownedSubs.map((sub) => {
              const count = getMemberAlters(sub, allAlters).length;
              return (
                <div key={sub.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubId(sub.id)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left min-w-0"
                    style={{ borderLeftColor: sub.color || "transparent", borderLeftWidth: sub.color ? 3 : 1 }}
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: sub.color || "hsl(var(--muted-foreground))" }} />
                    <span className="text-sm flex-1 truncate">{sub.emoji ? `${sub.emoji} ` : ""}{sub.name}</span>
                    <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{count}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                  <button type="button" onClick={() => setMenuGroup(sub)} title="Options"
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          ) : activeSub ? (
            <>
              {multi && (
                <button type="button" onClick={() => setActiveSubId(null)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> All {subTerm}s
                </button>
              )}
              {members.length > 0 ? (
                members.map((m, j) => (
                  <SubsystemNode
                    key={m.id}
                    alter={m}
                    index={j}
                    depth={depth + 1}
                    visited={nextVisited}
                    allAlters={allAlters}
                    allGroups={allGroups}
                    activeSessions={activeSessions}
                    anonymize={anonymize}
                  />
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => setMenuGroup(activeSub)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/20 transition-colors text-sm"
                >
                  <span className="w-7 h-7 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0">
                    <Plus className="w-4 h-4" />
                  </span>
                  Add a member to {activeSub.name}
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      {menuGroup && <SubsystemActionMenu group={menuGroup} onClose={() => setMenuGroup(null)} />}
    </div>
  );
}
