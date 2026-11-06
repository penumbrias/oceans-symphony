// The list sheet (v0.365.0, garden step 5b — docs/garden.md part 2): the one
// door to a note, list or flash-card deck. Every place that opens one — the
// Notes & lists page and its widgets, a widget on home or a profile, search,
// a goal — opens this sheet, built like the inspector: a non-modal
// half-height sheet with two tabs.
//
//   List (or Cards)  the writing, the items to tick off, the cards
//   Info             name, kind, who it's for, where it's kept
//   ⋯                Delete
//
// Every write goes through the one write path in src/lib/noteLists.js
// (noteListWriters), the same one the lists panel uses. The writing pad, the
// item rows and the deck are the lists panel's own pieces (NotePad,
// GroceryRow, FlashCards), shown in the app's colours.
//
// The privacy cover (GroceryListPanel's overlay) is not this sheet and is
// not changed by it.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import { Info, ListChecks, Layers, MoreHorizontal, Plus, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { Group, Row, ChoiceRow, StackedRow, TabBar } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { inputBase } from "@/components/alters/info/entryEditors";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { confirm } from "@/components/shared/ConfirmDialog";
import { localEntities } from "@/api/base44Client";
import { isDbInitialized } from "@/lib/localDb";
import { useTerms } from "@/lib/useTerms";
import { NotePad, GroceryRow } from "@/components/grocery/GroceryListPanel";
import FlashCards from "@/components/grocery/FlashCards";
import {
  useNoteLists, useNoteListWriters, useListFavorites, LIST_KINDS, listKind, listProgress,
  itemState, tickedByDay, DONE_HEADER,
} from "@/lib/noteLists";

const KIND_OPTIONS = Object.entries(LIST_KINDS).map(([value, k]) => ({ value, label: `${k.emoji} ${k.label}` }));
const norm = (s) => String(s || "").trim().toLowerCase();
const dayLabel = (d) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEE, MMM d"));

function useAlters() {
  const { data = [] } = useQuery({
    queryKey: ["alters"], queryFn: () => localEntities.Alter.list(), enabled: isDbInitialized(),
  });
  return useMemo(() => data.filter((a) => !a.is_archived), [data]);
}

// ── List tab ──────────────────────────────────────────────────────────

function ListTab({ list, items, alters }) {
  const writers = useNoteListWriters();
  const favorites = useListFavorites(list);
  const [text, setText] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const kind = listKind(list);
  const canAttach = list.source !== "local";
  const run = (p) => Promise.resolve(p).catch((e) => toast.error(e?.message || "Couldn't save that."));

  if (kind === "flashcards") {
    return (
      <div className="os-themed-lists pt-2">
        <FlashCards key={list.id} cards={items} list={list} alters={alters} canAttach={canAttach}
          onAdd={(patch) => run(writers.addCard(list, patch))}
          onUpdate={(item, patch) => run(writers.patchItem(list, item, patch))}
          onRemove={(card) => run(writers.removeItem(list, card))} />
      </div>
    );
  }

  const toDo = items.filter((i) => itemState(i) === "to_buy");
  const ticked = tickedByDay(items);
  const shopping = kind === "shopping";
  const waiting = new Set(toDo.map((i) => norm(i.name)));
  const quickAdds = shopping ? favorites.filter((f) => !waiting.has(norm(f.name))) : [];
  const isFav = (name) => favorites.some((f) => norm(f.name) === norm(name));
  const hasRanOut = items.some((i) => i.ran_out_at);
  const add = async (name) => {
    const v = String(name ?? text).trim();
    if (!v) return;
    await run(writers.addItem(list, v, { existing: items }));
    if (name === undefined) setText("");
  };
  const clearRanOut = () => {
    if (!clearArmed) { setClearArmed(true); setTimeout(() => setClearArmed(false), 4000); return; }
    setClearArmed(false);
    run(writers.clearRanOut(list, items));
  };
  const row = (item) => (
    <GroceryRow key={item.id} item={item} state={itemState(item)} isFavorite={isFav(item.name)} showStar={shopping}
      onToggle={() => run(writers.tick(list, item))}
      onToggleFavorite={() => run(writers.toggleFavorite(list, item.name, favorites))}
      onRemove={() => run(writers.removeItem(list, item))}
      onRestore={() => run(writers.untick(list, item))} />
  );

  return (
    <div className="os-themed-lists pt-2 space-y-3">
      <NotePad key={list.id} list={list} alters={alters} canAttach={canAttach}
        compact={kind !== "note" || items.length > 0}
        onSave={(l, patch) => run(writers.saveNote(l, patch))} />

      <div className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Add an item"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={kind === "note" ? "Add a checkbox item…" : `Add to ${list.name || "the list"}…`}
          className={`${inputBase} flex-1 min-w-0 h-10 text-base`} />
        <button type="button" onClick={() => add()} aria-label="Add" disabled={!text.trim()}
          className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex-shrink-0">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {quickAdds.length > 0 && (
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground pb-1">Frequent items</p>
          <div className="flex flex-wrap gap-1.5">
            {quickAdds.map((f) => (
              <button key={f.id || f.name} type="button" onClick={() => add(f.name)}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-border/60 text-xs hover:bg-muted/50">
                <Plus className="w-3 h-3" /> {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {toDo.length > 0 && <ul className="space-y-1">{toDo.map(row)}</ul>}
      {items.length === 0 && kind !== "note" && (
        <p className="text-sm text-muted-foreground text-center py-4">Nothing to tick off yet. Add an item above.</p>
      )}

      {ticked.map((g) => (
        <section key={g.key}>
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1">
            {dayLabel(g.date)}{DONE_HEADER[kind] ? ` · ${DONE_HEADER[kind]}` : ""}
          </h2>
          <ul className="space-y-1">{g.items.map(row)}</ul>
        </section>
      ))}

      {hasRanOut && (
        <button type="button" onClick={clearRanOut}
          className={`block mx-auto text-xs underline underline-offset-2 py-2 ${clearArmed ? "text-destructive font-semibold" : "text-muted-foreground hover:text-destructive"}`}>
          {clearArmed ? "Tap again to clear" : "Clear all ran-out items"}
        </button>
      )}
    </div>
  );
}

// ── Info tab ──────────────────────────────────────────────────────────

function InfoTab({ list, items, alters }) {
  const t = useTerms();
  const writers = useNoteListWriters();
  const local = list.source === "local";
  const kind = listKind(list);
  const save = (patch) => writers.updateList(list, patch).catch((e) => toast.error(e?.message || "Couldn't save that."));
  const p = listProgress(items);
  const made = list.created_date ? new Date(list.created_date) : null;
  return (
    <>
      <Group title={kind === "flashcards" ? "Deck" : kind === "note" ? "Note" : "List"} first>
        <Row label="Name">
          <DebouncedText value={list.name || ""} ariaLabel="Name" maxLength={120} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => { const n = String(v).trim(); if (n && n !== list.name) save({ name: n }); }} />
        </Row>
        <ChoiceRow label="Kind" hint={kind === "flashcards" ? "Each item is a card" : "Every kind has writing and tick-off items"}
          options={KIND_OPTIONS} value={kind} onChange={(v) => { if (v !== kind) save({ list_type: v }); }} />
        {!local && alters.length > 0 && (
          <StackedRow label="For" hint={`Optional: whose it is. Leave empty for the whole ${t.system}.`}>
            <AlterSearchSelect alters={alters} value={list.owner_alter_id || null}
              onChange={(id) => save({ owner_alter_id: id || null })}
              placeholder="No one — shared" noneLabel="No one — shared" />
          </StackedRow>
        )}
      </Group>
      <Group title="About">
        <Row label="Kept" hint={local
          ? "Not encrypted, so it opens from the lock screen too. Keep sensitive things off it."
          : "Encrypted with the rest of your data."}>
          <span className="text-sm text-muted-foreground">{local ? "Available when locked" : "Encrypted"}</span>
        </Row>
        <Row label={kind === "flashcards" ? "Cards" : "Items"}>
          <span className="text-sm text-muted-foreground tabular-nums">
            {kind === "flashcards" ? p.total : `${p.done} of ${p.total} ticked`}
          </span>
        </Row>
        {made && !Number.isNaN(made.getTime()) && (
          <Row label="Made">
            <span className="text-sm text-muted-foreground">{format(made, "MMM d, yyyy")}</span>
          </Row>
        )}
      </Group>
    </>
  );
}

// ── The sheet ─────────────────────────────────────────────────────────

export default function ListSheet({ listId, onClose }) {
  const peek = usePeekHeight("symphony_note_list_peek_h", 85);
  const { byId, items: itemsOf } = useNoteLists();
  const writers = useNoteListWriters();
  const alters = useAlters();
  const [tab, setTab] = useState("list");
  useEffect(() => { setTab("list"); }, [listId]);
  const list = listId ? byId.get(listId) : null;
  const items = list ? itemsOf(list.id) : [];
  const kind = list ? listKind(list) : "note";
  const tabs = [
    { id: "list", label: kind === "flashcards" ? "Cards" : "List", icon: kind === "flashcards" ? Layers : ListChecks },
    { id: "info", label: "Info", icon: Info },
  ];

  const remove = async () => {
    if (!list) return;
    const n = items.length;
    const what = kind === "flashcards" ? (n === 1 ? "card" : "cards") : (n === 1 ? "item" : "items");
    const ok = await confirm(n > 0
      ? `Delete "${list.name}" and its ${n} ${what}? This can't be undone.`
      : `Delete "${list.name}"? This can't be undone.`);
    if (!ok) return;
    try { await writers.deleteList(list); onClose(); }
    catch (e) { toast.error(e?.message || "Couldn't delete it."); }
  };

  return (
    <Drawer open={!!listId} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards}
        data-note-list-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">{list?.name || "Note or list"}</DrawerTitle>
        <DrawerDescription className="sr-only">Changes save as you make them.</DrawerDescription>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-6" data-vaul-no-drag="">
          <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
            <div className="py-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 text-base font-semibold truncate">
                {list ? `${LIST_KINDS[kind].emoji} ${list.name || "Untitled"}` : "Note or list"}
              </p>
              {list && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More" title="More"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><MoreHorizontal className="w-4 h-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive" onSelect={remove}>Delete…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button type="button" aria-label="Close" onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><X className="w-4 h-4" /></button>
            </div>
            {list && <TabBar tabs={tabs} value={tab} onChange={setTab} />}
          </div>
          {!list ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {byId.size ? "This note or list isn't here any more." : "Loading…"}
            </p>
          ) : (
            <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
              {tab === "list" && <ListTab key={list.id} list={list} items={items} alters={alters} />}
              {tab === "info" && <InfoTab list={list} items={items} alters={alters} />}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
