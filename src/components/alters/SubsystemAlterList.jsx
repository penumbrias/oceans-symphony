import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Folder, Plus } from "lucide-react";
import AlterCard from "./AlterCard";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import useLongPress from "@/hooks/useLongPress";
import {
  getSubsystemsOwnedBy,
  getMemberAlters,
  MAX_SUBSYSTEM_DEPTH,
} from "@/lib/subsystemUtils";

// Renders the alters-section list with subsystems nested inline:
// top-level alters, and under any alter that owns a subsystem an
// expandable, indented list of its members. The expander lives INLINE
// to the right of the card (next to the front/activity bolt) — the same
// place the groups section puts its subsystem folder button — and shows
// the subsystem's own avatar when one is set, else a colour-tinted
// folder icon. A member who owns their own subsystem expands further
// UNTIL the indentation would get too deep to stay readable, at which
// point the button opens that subsystem's profile instead.
//
// SAFETY: recursion is bounded by a per-branch visited-alter set AND a
// hard depth clamp, so an ownership loop renders as a truncated branch
// rather than spinning forever (the cycle-guard rule from CLAUDE.md).

const INDENT_PX = 16;
// Past this nesting depth, stop indenting inline and offer navigation —
// keeps a chip from shrinking toward half the screen width on a phone.
const MAX_INLINE_DEPTH = 3;
const EMPTY_SET = new Set();

// Round folder/avatar button matching the groups-section MemberRow look,
// sized to sit beside the activity bolt. Toggles inline expansion when
// shallow enough, otherwise opens the subsystem's profile.
function SubsystemAccessory({ group, expanded, inlineExpandable, onToggle, onOpen }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!group?.avatar_url) { setResolved(null); return; }
    resolveImageUrl(group.avatar_url).then(setResolved).catch(() => setResolved(null));
  }, [group?.avatar_url]);
  const color = group?.color || undefined;
  // Tap toggles inline expansion (or opens the profile when too deep to
  // expand); press-and-hold always opens the subsystem's profile page.
  // Scroll-safe: the hook cancels on movement.
  const press = useLongPress({
    onClick: () => (inlineExpandable ? onToggle() : onOpen()),
    onLongPress: () => onOpen(),
  });
  return (
    <button
      type="button"
      {...press}
      aria-expanded={inlineExpandable ? expanded : undefined}
      title={inlineExpandable ? `${expanded ? "Hide" : "Show"} ${group.name} — hold to open its page` : `Open ${group.name}`}
      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border transition-all hover:scale-105 ${expanded ? "ring-2 ring-primary/50" : ""}`}
      style={{
        backgroundColor: resolved ? "transparent" : color ? `${color}20` : "hsl(var(--muted))",
        borderColor: color ? `${color}55` : "hsl(var(--border))",
        touchAction: "pan-y",
      }}
    >
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : (inlineExpandable && expanded
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
  const [expanded, setExpanded] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

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
      <AlterCard
        alter={alter}
        index={index}
        activeSessions={activeSessions}
        anonymize={anonymize}
        rightAccessory={hasSub ? (
          <SubsystemAccessory
            group={ownedSub}
            expanded={expanded}
            inlineExpandable={inlineExpandable}
            onToggle={() => setExpanded((v) => !v)}
            onOpen={() => navigate(`/group/${ownedSub.id}`)}
          />
        ) : null}
      />

      {hasSub && expanded && (
        <div
          className="border-l-2 border-border/40 mt-2 flex flex-col gap-2"
          style={{ marginLeft: INDENT_PX, paddingLeft: INDENT_PX / 2 }}
        >
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
            // Empty subsystem → an "add member" slot so the user can
            // populate it without leaving the alters list.
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/20 transition-colors text-sm"
            >
              <span className="w-7 h-7 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4" />
              </span>
              Add a member to {ownedSub.name}
            </button>
          )}
        </div>
      )}

      {manageOpen && (
        <GroupMembersModal
          group={ownedSub}
          allGroups={allGroups}
          isOpen={manageOpen}
          onClose={() => setManageOpen(false)}
        />
      )}
    </div>
  );
}
