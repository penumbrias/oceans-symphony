// Writing a post as a popup, the way a new journal entry works — reachable
// from anywhere rather than only from the board you happen to be on.
//
// The board you're posting to is chosen at the TOP, because it's the thing
// you're most likely to want to change. Favourites are system-wide and sort
// first; the rest follow in the group tree's own order.
//
// The composer itself is the existing BulletinComposer, unchanged — this is
// a host for it, not a second way to write a post.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Search, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import BulletinComposer from "@/components/bulletin/BulletinComposer";
import AlterBoardComposer from "@/components/bulletin/AlterBoardComposer";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { flattenGroupTree } from "@/lib/groupTree";
import { isSubsystem } from "@/lib/subsystemUtils";

const SYSTEM_BOARD = "__system";
// An alter's own board is an AlterMessage feed on their profile, not a
// Bulletin — its id is prefixed so it can never collide with a group id.
const ALTER_PREFIX = "alter:";
const alterIdOf = (boardId) => (String(boardId || "").startsWith(ALTER_PREFIX) ? boardId.slice(ALTER_PREFIX.length) : null);

export default function BulletinComposerModal({
  open, onClose, alters = [], authorAlterId, frontingAlterIds = [],
  initialGroupId = null, initialContent = "",
}) {
  const qc = useQueryClient();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [boardId, setBoardId] = useState(initialGroupId || SYSTEM_BOARD);
  const [picking, setPicking] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: open,
  });
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(), enabled: open,
  });
  const settings = pickPrimarySystemSettings(settingsRows);
  const favourites = useMemo(
    () => (Array.isArray(settings?.favorite_board_ids) ? settings.favorite_board_ids : []),
    [settings]
  );

  // Every board, sorted into the menu's sections. Groups keep their tree
  // (depth-tagged, cycle-guarded) so nested ones read as nested.
  const sections = useMemo(() => {
    const tree = flattenGroupTree(groups, { sort: "order" });
    const asBoard = (g) => ({ id: g.id, label: g.name || "Group", depth: g._depth || 0, color: g.color });
    return [
      { id: "groups", label: "Group boards", boards: tree.filter((g) => !isSubsystem(g)).map(asBoard) },
      { id: "subsystems", label: "Subsystem boards", boards: tree.filter(isSubsystem).map(asBoard) },
      {
        id: "alters", label: `${t.Alter} boards`,
        boards: (alters || []).filter((a) => !a.is_archived)
          .map((a) => ({ id: ALTER_PREFIX + a.id, label: formatAlter(a), depth: 0, color: a.color, kind: `${t.alter} board` }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ].filter((sec) => sec.boards.length > 0);
  }, [groups, alters, formatAlter, t.Alter, t.alter]);

  const systemBoard = useMemo(() => ({ id: SYSTEM_BOARD, label: `${t.System} board`, depth: 0 }), [t.System]);
  const allBoards = useMemo(() => [systemBoard, ...sections.flatMap((s) => s.boards)], [sections, systemBoard]);
  const current = allBoards.find((b) => b.id === boardId) || systemBoard;
  const pickedAlterId = alterIdOf(boardId);

  const toggleFavourite = async (id) => {
    const next = favourites.includes(id) ? favourites.filter((x) => x !== id) : [...favourites, id];
    try {
      if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { favorite_board_ids: next });
      else await base44.entities.SystemSettings.create({ favorite_board_ids: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* a favourite failing to save shouldn't block posting */ }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-base">New post</DialogTitle>
        </DialogHeader>

        {/* Board first — what you're posting to, before what you write. */}
        <div className="space-y-1.5">
          <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Posting to
          </label>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-input bg-background text-sm text-left"
          >
            {favourites.includes(current?.id) && <Star className="w-3.5 h-3.5 text-primary fill-primary flex-shrink-0" />}
            <span className="flex-1 min-w-0 truncate">
              {current?.label}
              {current?.kind && <span className="text-muted-foreground"> · {current.kind}</span>}
            </span>
            <span className="text-xs text-muted-foreground">Change</span>
          </button>

          {picking && (
            <BoardMenu
              systemBoard={systemBoard}
              sections={sections}
              allBoards={allBoards}
              favourites={favourites}
              selectedId={boardId}
              onPick={(id) => { setBoardId(id); setPicking(false); }}
              onToggleFavourite={toggleFavourite}
            />
          )}
        </div>

        {/* The real composer — remounted per board so its draft state can't
            carry across a board change. An alter's board takes the same
            composer their profile's Board feed uses. */}
        {pickedAlterId ? (
          <AlterBoardComposer key={boardId} alterId={pickedAlterId} alters={alters} onPosted={onClose} />
        ) : (
          <BulletinComposer
            key={boardId}
            alters={alters}
            authorAlterId={authorAlterId}
            frontingAlterIds={frontingAlterIds}
            initialContent={initialContent}
            groupId={boardId === SYSTEM_BOARD ? null : boardId}
            onClose={onClose}
            embedded
            showHeader={false}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// A cascading menu, like File / Edit menus in a drawing app: the top level
// holds favourites, the system board and one row per kind of board; a kind
// opens its own submenu. On a wide screen the submenu opens beside the top
// level (hover or tap); on a phone it opens in place with a Back row.
// Typing in search skips the menus and lists every match, labelled by kind.
function BoardMenu({ systemBoard, sections, allBoards, favourites, selectedId, onPick, onToggleFavourite }) {
  const [q, setQ] = useState("");
  const [openSection, setOpenSection] = useState(null);

  const needle = q.trim().toLowerCase();
  const favBoards = favourites.map((id) => allBoards.find((b) => b.id === id)).filter(Boolean);
  const sub = sections.find((s) => s.id === openSection) || null;

  const row = (b, { indent = true, hint } = {}) => (
    <div key={b.id} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPick(b.id)}
        className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded-md flex items-center gap-2 ${
          b.id === selectedId ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
        }`}
      >
        {indent && b.depth > 0 && (
          <span aria-hidden className="text-muted-foreground/60 flex-shrink-0" style={{ paddingLeft: `${Math.min(b.depth, 6) * 10}px` }}>↳</span>
        )}
        {b.color && <span aria-hidden className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />}
        <span className="flex-1 truncate">{b.label}</span>
        {hint && <span className="text-[0.6875rem] text-muted-foreground/70 flex-shrink-0">{hint}</span>}
        {b.id === selectedId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
      </button>
      <button
        type="button"
        onClick={() => onToggleFavourite(b.id)}
        aria-label={favourites.includes(b.id) ? `Unfavourite ${b.label}` : `Favourite ${b.label}`}
        title="Keep this board at the top"
        className="p-1.5 rounded-md text-muted-foreground hover:text-primary flex-shrink-0"
      >
        <Star className={`w-3.5 h-3.5 ${favourites.includes(b.id) ? "text-primary fill-primary" : ""}`} />
      </button>
    </div>
  );

  const heading = (text) => (
    <p className="px-2 pt-1.5 pb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground/80">{text}</p>
  );

  const searchResults = needle
    ? [
        ...(systemBoard.label.toLowerCase().includes(needle) ? [{ b: systemBoard, hint: "Other" }] : []),
        ...sections.flatMap((s) => s.boards.filter((b) => b.label.toLowerCase().includes(needle)).map((b) => ({ b, hint: s.label }))),
      ]
    : [];

  const topLevel = (
    <div className={`space-y-0.5 ${sub ? "hidden sm:block" : ""}`}>
      {favBoards.length > 0 && (
        <>
          {heading("Favourites")}
          {favBoards.map((b) => row(b, { indent: false }))}
          <div className="my-1 border-t border-border/50" />
        </>
      )}
      {row(systemBoard)}
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-haspopup="menu"
          aria-expanded={openSection === s.id}
          onClick={() => setOpenSection((v) => (v === s.id ? null : s.id))}
          onMouseEnter={() => { if (window.matchMedia?.("(min-width: 640px) and (hover: hover)").matches) setOpenSection(s.id); }}
          className={`w-full text-left text-sm px-2 py-1.5 rounded-md flex items-center gap-2 ${
            openSection === s.id ? "bg-muted/60 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
          }`}
        >
          <span className="flex-1 truncate">{s.label}</span>
          <span className="text-[0.6875rem] text-muted-foreground/70">{s.boards.length}</span>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      ))}
    </div>
  );

  const subMenu = sub && (
    <div role="menu" aria-label={sub.label} className="space-y-0.5 sm:border-l sm:border-border/50 sm:pl-1.5">
      <button
        type="button"
        onClick={() => setOpenSection(null)}
        className="sm:hidden w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center gap-1 text-muted-foreground hover:bg-muted/50"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> All boards
      </button>
      {heading(sub.label)}
      {sub.boards.map((b) => row(b))}
    </div>
  );

  return (
    <div className="rounded-lg border border-border/60 p-1.5 space-y-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search boards…"
          className="w-full h-8 pl-6 pr-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain">
        {needle ? (
          <div className="space-y-0.5">
            {searchResults.map(({ b, hint }) => row(b, { indent: false, hint }))}
            {searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No boards match that.</p>
            )}
          </div>
        ) : (
          <div className={sub ? "sm:grid sm:grid-cols-2 sm:gap-1.5" : ""}>
            {topLevel}
            {subMenu}
          </div>
        )}
      </div>
    </div>
  );
}
