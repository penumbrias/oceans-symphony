// Notes & lists (v0.347.0; a widget board since v0.363.0, garden step 5 —
// docs/garden.md). The page shows the person's notes, lists and flash-card
// decks as widgets (Notes & lists, plus any List, Note or Deck widget they
// add with Edit page). Opening one — from here, from a widget anywhere,
// from search or a goal — opens the list sheet: the lists panel
// (GroceryListPanel asPage) on that list, the one place a list is edited.
// The quick-jump privacy cover is the same panel and is not changed.
//
// ?list=<id> (or ?highlight=<id>) opens that list's sheet.

import React, { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EyeOff, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import GroceryListPanel from "@/components/grocery/GroceryListPanel";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";

// The page's standard layout (what shows until the first edit).
export const NOTES_PAGES = [
  { tab: "all", label: "All", widgets: [{ widgetId: "notes_index", mode: "expanded" }] },
];

function ListSheet({ listId, onClose }) {
  const peek = usePeekHeight("symphony_note_list_peek_h", 85);
  return (
    <Drawer open={!!listId} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards}
        data-note-list-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">Note or list</DrawerTitle>
        <DrawerDescription className="sr-only">Changes save as you make them.</DrawerDescription>
        <div className="flex justify-end px-3 -mt-1">
          <button type="button" onClick={onClose} aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-vaul-no-drag="">
          {listId && <GroceryListPanel key={listId} asPage initialListId={listId} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function Notes() {
  const [params, setParams] = useSearchParams();
  const page = useProfilePageState(NOTES_PAGES);
  const listId = params.get("list") || params.get("highlight") || null;
  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("list"); next.delete("highlight");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="min-h-screen px-4 pt-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab, 0px))" }}>
      <div className="max-w-2xl mx-auto" data-tour="notes-page">
        <div className="mb-3">
          <BoardPageHeader title="Notes & lists" layoutEditing={page.layoutEditing}
            onEditLayout={openPageLayoutEditor} tourId="notes-layout-btn"
            after={!page.layoutEditing && (
              // The quick-taps gesture and its lock are set up in Settings;
              // this is the door people look for from here (v0.356.0).
              <Link to="/settings#privacy-cover"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-1">
                <EyeOff className="w-3.5 h-3.5" /> Quick taps &amp; privacy screen
              </Link>
            )} />
        </div>
        <PageBoardCanvas pageId="notes" pages={NOTES_PAGES} page={page} />
      </div>
      <ListSheet listId={listId} onClose={close} />
    </div>
  );
}
