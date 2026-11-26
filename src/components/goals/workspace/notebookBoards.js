// The Notebook's own widget boards, one copy for the old Notebook page
// (src/pages/Goals.jsx) and the new house's Notebook room
// (src/house/notebook/): the front board's standard layout, a goal page's
// widget registry, whether a page has its own saved layout, and "Edit page"
// for a board that isn't on screen yet.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { profilePageId, PAGE_BOARD_OWNER_TYPE } from "@/lib/profileBoard";
import { profileBoardQueryKey, listProfileBoardRows } from "@/lib/boardStore";
import { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { V2_WIDGETS } from "@/v2/widgets";
import { goalWidgetDefs } from "@/v2/goalWidgetDefs";

// The Notebook's front page (v0.358.0): a widget board like Needs — Add a
// goal, then every goal as a card. Edit page moves, resizes and adds
// widgets (pictures, notes, anything); the layout is saved on the first
// edit, never before.
export const NOTEBOOK_PAGES = [
  { tab: "goals", label: "Goals", widgets: [
    { widgetId: "goal_add" },
    { widgetId: "goals", settings: { view: "cards" } },
    // Notes & lists joined the Notebook (v0.376.0).
    { widgetId: "notes_index" },
  ] },
];
export const NOTEBOOK_ICONS = { [profilePageId("goals")]: Target };

// A goal page's board: the standard four widgets until the first Edit
// page; Media, Text and the rest can go beside them.
export const GOAL_PAGE_REGISTRY = { ...V2_WIDGETS, ...goalWidgetDefs({ onGoalPage: true }) };

// Whether a board has its own saved layout (a ProfileBoard row). Reads only.
export function useHasOwnBoard(boardId) {
  const { data: rows = [] } = useQuery({
    queryKey: profileBoardQueryKey(PAGE_BOARD_OWNER_TYPE, boardId),
    queryFn: () => listProfileBoardRows(PAGE_BOARD_OWNER_TYPE, boardId),
  });
  return rows.length > 0;
}

// "Edit page" while the board isn't on screen: show it, then ask it into
// edit mode once it has mounted (it listens for the editor event).
export function useEditWhenShown(layoutEditing, initial = false) {
  const [want, setWant] = useState(initial);
  const was = useRef(false);
  useEffect(() => {
    if (layoutEditing) { was.current = true; return undefined; }
    if (was.current) { was.current = false; setWant(false); return undefined; }
    if (!want) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      openPageLayoutEditor();
      if (tries > 20) { clearInterval(t); setWant(false); }
    }, 150);
    return () => clearInterval(t);
  }, [want, layoutEditing]);
  return { want, edit: () => setWant(true) };
}
