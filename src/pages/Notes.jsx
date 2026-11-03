// Notes & lists (v0.347.0): your lists, notes and flash-card decks as an
// ordinary app page. It is the lists panel itself (GroceryListPanel, asPage),
// in the app's colours, so there is one copy of the feature: the quick-jump
// overlay and this page show the same lists from the same stores.
//
// ?list=<id> opens a given list (a goal's "Open", search results).

import React from "react";
import { useSearchParams } from "react-router-dom";
import GroceryListPanel from "@/components/grocery/GroceryListPanel";

export default function Notes() {
  const [params] = useSearchParams();
  const listId = params.get("list") || params.get("highlight") || null;
  return (
    <div className="p-4 space-y-2" style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab, 0px))" }}>
      <h1 className="font-display text-3xl font-semibold text-foreground max-w-3xl mx-auto">Notes &amp; lists</h1>
      <div data-tour="notes-page" className="rounded-2xl border border-border/50 bg-card overflow-hidden max-w-3xl mx-auto">
        <GroceryListPanel asPage initialListId={listId} />
      </div>
    </div>
  );
}
