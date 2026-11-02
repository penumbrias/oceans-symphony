// Needs (System Needs): one place for what everyone wants. Since v0.331.0
// the page is a widget board, like a profile page (PageBoardCanvas):
//   • Balance — the Needs balance widget, expanded (everyone, Plan it on
//     each thing they enjoy, need or wished for).
//   • Wishes — the Add a wish widget, then the Wishes widget expanded
//     (every shared wish's card, done and let go folded away).
//   • Turns — the Taking turns widget, expanded ("this now, that next").
// Edit page (the grid button) moves, resizes and adds widgets; the layout is
// saved on the first edit, never before. Goals live on their own page.
//
// ?tab=balance|wishes|turns picks the page; ?highlight=<id> scrolls to a
// wish, a turn or an alter's balance.

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Target, LayoutGrid, HeartHandshake, Heart, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";
import { profilePageId } from "@/lib/profileBoard";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { WISHES_QUERY_KEY } from "@/lib/wishes";
import { TURNS_QUERY_KEY } from "@/lib/needs";

// The page's standard layout (what shows until the first edit).
export const NEEDS_PAGES = [
  { tab: "balance", label: "Balance", widgets: [{ widgetId: "needs_balance", mode: "expanded" }] },
  { tab: "wishes", label: "Wishes", widgets: [
    { widgetId: "wish_add" },
    { widgetId: "wishes", mode: "expanded", settings: { show: "both", view: "cards" } },
  ] },
  { tab: "turns", label: "Turns", widgets: [{ widgetId: "turns", mode: "expanded" }] },
];
const PAGE_ICONS = {
  [profilePageId("balance")]: HeartHandshake,
  [profilePageId("wishes")]: Heart,
  [profilePageId("turns")]: ArrowLeftRight,
};

export default function Needs() {
  const navigate = useNavigate();
  const page = useProfilePageState(NEEDS_PAGES);
  // Rows render after their queries land and the board mounts: look again
  // once each is ready (same queries the widgets read — cached).
  const { isFetched: wishesReady } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: () => base44.entities.Wish.list().catch(() => []) });
  const { isFetched: turnsReady } = useQuery({ queryKey: TURNS_QUERY_KEY, queryFn: () => base44.entities.TurnAgreement.list().catch(() => []) });
  const [settled, setSettled] = useState(false);
  useEffect(() => { const id = setTimeout(() => setSettled(true), 600); return () => clearTimeout(id); }, []);
  useHighlightScroll([page.currentPageId, wishesReady, turnsReady, settled]);

  return (
    <div className="min-h-screen px-4 pt-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto" data-tour="needs-page">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="font-display text-3xl font-semibold text-foreground flex-1 min-w-0">Needs</h1>
          {!page.layoutEditing && (
            <>
              <Button variant="outline" size="sm" className="h-11 gap-1.5" onClick={() => navigate("/goals")}>
                <Target className="w-4 h-4" /> Goals
              </Button>
              <Button variant="outline" size="sm" className="h-11 w-11 px-0" data-tour="needs-layout-btn"
                onClick={openPageLayoutEditor} aria-label="Edit page"
                title="Edit page — move, resize and add widgets">
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        <PageBoardCanvas pageId="needs" pages={NEEDS_PAGES} page={page} pageIcons={PAGE_ICONS} tourId="needs-tabs" />
      </div>
    </div>
  );
}
