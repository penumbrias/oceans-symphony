import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import AlterCard from "./AlterCard";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import {
  getSubsystemsOwnedBy,
  getMemberAlters,
  MAX_SUBSYSTEM_DEPTH,
} from "@/lib/subsystemUtils";

// Round folder/avatar button matching the groups-section MemberRow look.
// Shows the subsystem's own avatar when set, else a colour-tinted folder.
function SubsystemIcon({ group }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!group?.avatar_url) { setResolved(null); return; }
    resolveImageUrl(group.avatar_url).then(setResolved).catch(() => setResolved(null));
  }, [group?.avatar_url]);
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 border border-border/40"
      style={{ backgroundColor: resolved ? "transparent" : group?.color ? `${group.color}20` : "hsl(var(--muted))" }}
    >
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : <Folder className="w-3.5 h-3.5" style={{ color: group?.color || "hsl(var(--muted-foreground))" }} />}
    </span>
  );
}

// Renders the alters-section list with subsystems nested inline:
// top-level alters, and under any alter that owns a subsystem an
// expandable, indented list of its members. A member who owns their
// own subsystem expands further — UNTIL the indentation would get too
// deep to stay readable, at which point deeper levels switch to a
// "open" button that navigates to that alter's profile instead of
// indenting further (per the readability cap the user asked for).
//
// SAFETY: recursion is bounded by a per-branch visited-alter set AND a
// hard depth clamp, so an ownership loop renders as a truncated branch
// rather than spinning forever (the cycle-guard rule from CLAUDE.md).

const INDENT_PX = 16;
// Past this nesting depth, stop indenting inline and offer navigation —
// keeps a chip from shrinking toward half the screen width on a phone.
const MAX_INLINE_DEPTH = 3;

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

const EMPTY_SET = new Set();

function SubsystemNode({ alter, index, depth, visited, allAlters, allGroups, activeSessions, anonymize }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const ownedSub = getSubsystemsOwnedBy(allGroups, alter.id)[0] || null;
  // Guard: don't expand an alter we've already expanded up this branch
  // (loop), or past the hard depth clamp.
  const loopOrTooDeep = visited.has(alter.id) || depth > MAX_SUBSYSTEM_DEPTH;
  const hasSub = !!ownedSub && !loopOrTooDeep;
  // Inline-expandable while shallow enough; deeper than the cap → navigate.
  const inlineExpandable = hasSub && depth < MAX_INLINE_DEPTH;

  const members = (hasSub && expanded) ? getMemberAlters(ownedSub, allAlters) : [];
  const nextVisited = hasSub ? new Set(visited).add(alter.id) : visited;

  return (
    <div>
      <AlterCard alter={alter} index={index} activeSessions={activeSessions} anonymize={anonymize} />

      {hasSub && (
        <div className="flex justify-end mt-1 pr-1">
          {inlineExpandable ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              title={`${expanded ? "Hide" : "Show"} ${ownedSub.name}`}
              className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <SubsystemIcon group={ownedSub} />
              <span className="truncate max-w-[10rem]">{ownedSub.name}</span>
              {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/group/${ownedSub.id}`)}
              title={`Open ${ownedSub.name}`}
              className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <SubsystemIcon group={ownedSub} />
              <span className="truncate max-w-[10rem]">{ownedSub.name}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {expanded && members.length > 0 && (
        <div
          className="border-l-2 border-border/40 mt-2 flex flex-col gap-2"
          style={{ marginLeft: INDENT_PX, paddingLeft: INDENT_PX / 2 }}
        >
          {members.map((m, j) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
