// Notes & lists lives inside the Notebook (v0.376.0; its own page from
// v0.347.0). The board is unchanged — same widgets, same saved layout
// (page board "notes") — and now shows in the Notebook at /goals?notes=1.
// Every note, list and deck stays stored where it always was (the lists
// panel's stores); only where you open them moved. The quick-jump privacy
// cover is the same panel and is not changed.
//
// /notes (old links, saved shortcuts) lands on the Notebook's Notes & lists,
// keeping ?list=<id> / ?highlight=<id>.

import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { EyeOff } from "lucide-react";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";

// The board's standard layout (what shows until the first edit).
export const NOTES_PAGES = [
  { tab: "all", label: "All", widgets: [{ widgetId: "notes_index", mode: "expanded" }] },
];

// The Notes & lists board, drawn inside the Notebook (Goals.jsx).
export function NotesView({ onOpenNotebook }) {
  const page = useProfilePageState(NOTES_PAGES);
  return (
    <div className="space-y-3" data-tour="notes-page">
      <nav aria-label="Where this page is" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button type="button" onClick={onOpenNotebook} className="hover:text-foreground min-h-[1.75rem]">Notebook</button>
      </nav>
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
      <PageBoardCanvas pageId="notes" pages={NOTES_PAGES} page={page} />
    </div>
  );
}

export default function NotesRedirect() {
  const { search } = useLocation();
  const old = new URLSearchParams(search);
  const next = new URLSearchParams({ notes: "1" });
  const id = old.get("list") || old.get("highlight");
  if (id) next.set("list", id);
  return <Navigate to={`/goals?${next.toString()}`} replace />;
}
