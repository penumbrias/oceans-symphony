// An app page as a widget board (v0.331.0) — the Needs page first. Same
// canvas, store and rules as a profile page (ProfileBoardCanvas.jsx), minus
// the record: the layout is a ProfileBoard row { owner_type: "page",
// owner_id: <pageId> }, created on the person's FIRST layout edit and never
// before; until then the page renders seedBoardFromPages(pages) — one board
// page per tab, the tab's widgets top to bottom.
//
//   const page = useProfilePageState(PAGES);
//   <PageBoardCanvas pageId="needs" pages={PAGES} page={page} />
//   <button onClick={openPageLayoutEditor}>Edit page</button>
//
// No board subject: the widgets show everyone's things, like on home.

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import { V2_WIDGETS } from "@/v2/widgets";
import { profileBoardStore, profileBoardQueryKey, listProfileBoardRows } from "@/lib/boardStore";
import { seedBoardFromPages, PAGE_BOARD_OWNER_TYPE } from "@/lib/profileBoard";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

// The page's own layout editor listens on the profile prefix, so
// useProfilePageState (which watches that scope) follows its edit mode.
export const PAGE_BOARD_EVENT_PREFIX = "os-profile";
const NO_API = {};
export const openPageLayoutEditor = () => window.dispatchEvent(new CustomEvent(`${PAGE_BOARD_EVENT_PREFIX}-edit-home`));

export default function PageBoardCanvas({ pageId, pages, page, tourId = null, pageIcons = null }) {
  const queryClient = useQueryClient();
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = pickPrimarySystemSettings(settingsRows) || null;
  const { data: rows = [], isFetched } = useQuery({
    queryKey: profileBoardQueryKey(PAGE_BOARD_OWNER_TYPE, pageId),
    queryFn: () => listProfileBoardRows(PAGE_BOARD_OWNER_TYPE, pageId),
  });
  // The canvas's auto-fit on a still-seeded board is kept in memory, never
  // written: no row exists until a person edits the layout.
  const [fittedSeed, setFittedSeed] = useState(null);
  useEffect(() => { setFittedSeed(null); }, [pageId]);
  const seed = useMemo(() => seedBoardFromPages(pages), [pages]);
  const boardStore = useMemo(() => {
    const base = profileBoardStore({ ownerType: PAGE_BOARD_OWNER_TYPE, ownerId: pageId, rows, qc: queryClient });
    return {
      ...base,
      recordId: pageId,
      board: base.board || fittedSeed || seed,
      write: async (next, opts) => {
        const row = await base.write(next, opts);
        if (!row) setFittedSeed(next);
        return row;
      },
    };
  }, [pageId, rows, fittedSeed, seed, queryClient]);
  if (!isFetched) return null;
  return (
    <ExperimentalDashboard
      settingsRow={settingsRow}
      api={NO_API}
      registry={V2_WIDGETS}
      boardStore={boardStore}
      eventPrefix={PAGE_BOARD_EVENT_PREFIX}
      viewFlow
      notices={null}
      initialPageId={page.initialPageId}
      onPageChange={page.onPageChange}
      pageStrip="tabs"
      pageIcons={pageIcons}
      pageStripProps={tourId ? { "data-tour": tourId } : null}
    />
  );
}
