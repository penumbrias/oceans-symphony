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
import { Star, Search, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import BulletinComposer from "@/components/bulletin/BulletinComposer";

const SYSTEM_BOARD = "__system";

export default function BulletinComposerModal({
  open, onClose, alters = [], authorAlterId, frontingAlterIds = [],
  initialGroupId = null, initialContent = "",
}) {
  const qc = useQueryClient();
  const t = useTerms();
  const [boardId, setBoardId] = useState(initialGroupId || SYSTEM_BOARD);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: open,
  });
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(), enabled: open,
  });
  const settings = settingsRows[0];
  const favourites = useMemo(
    () => (Array.isArray(settings?.favorite_board_ids) ? settings.favorite_board_ids : []),
    [settings]
  );

  const boards = useMemo(() => {
    const all = [
      { id: SYSTEM_BOARD, label: `${t.System} board` },
      ...groups.map((g) => ({ id: g.id, label: g.name || "Group" })),
    ];
    const needle = q.trim().toLowerCase();
    const shown = needle ? all.filter((b) => b.label.toLowerCase().includes(needle)) : all;
    // Favourites first, everything else in its existing order.
    return [
      ...shown.filter((b) => favourites.includes(b.id)),
      ...shown.filter((b) => !favourites.includes(b.id)),
    ];
  }, [groups, favourites, q, t.System]);

  const current = boards.find((b) => b.id === boardId) || boards[0];

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
            <span className="flex-1 min-w-0 truncate">{current?.label}</span>
            <span className="text-xs text-muted-foreground">Change</span>
          </button>

          {picking && (
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
              <div className="max-h-48 overflow-y-auto overscroll-contain space-y-0.5">
                {boards.map((b) => (
                  <div key={b.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setBoardId(b.id); setPicking(false); setQ(""); }}
                      className={`flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded-md flex items-center gap-2 ${
                        b.id === boardId ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span className="flex-1 truncate">{b.label}</span>
                      {b.id === boardId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavourite(b.id)}
                      aria-label={favourites.includes(b.id) ? `Unfavourite ${b.label}` : `Favourite ${b.label}`}
                      title="Keep this board at the top"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary flex-shrink-0"
                    >
                      <Star className={`w-3.5 h-3.5 ${favourites.includes(b.id) ? "text-primary fill-primary" : ""}`} />
                    </button>
                  </div>
                ))}
                {boards.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No boards match that.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* The real composer — remounted per board so its draft state can't
            carry across a board change. */}
        <BulletinComposer
          key={boardId}
          alters={alters}
          authorAlterId={authorAlterId}
          frontingAlterIds={frontingAlterIds}
          initialContent={initialContent}
          groupId={boardId === SYSTEM_BOARD ? null : boardId}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
