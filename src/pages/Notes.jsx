// Notes & lists (v0.347.0; a widget board since v0.363.0, garden step 5 —
// docs/garden.md). The page shows the person's notes, lists and flash-card
// decks as widgets (Notes & lists, plus any List, Note or Deck widget they
// add with Edit page). Opening one — from here, from a widget anywhere,
// from search or a goal — opens the list sheet (components/notes/ListSheet,
// v0.365.0): the one place a list is edited, writing through noteLists.js.
// The quick-jump privacy cover (GroceryListPanel) is separate and unchanged.
//
// ?list=<id> (or ?highlight=<id>) opens that list's sheet.

import React, { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EyeOff } from "lucide-react";
import ListSheet from "@/components/notes/ListSheet";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";

// The page's standard layout (what shows until the first edit).
export const NOTES_PAGES = [
  { tab: "all", label: "All", widgets: [{ widgetId: "notes_index", mode: "expanded" }] },
];

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
