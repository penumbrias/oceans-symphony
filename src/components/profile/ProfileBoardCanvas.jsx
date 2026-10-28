// A profile page as a widget board (v0.290.0 alters, v0.291.0 groups,
// contacts and locations) — the one host every profile page mounts.
//
//   const page = useProfilePageState(PAGES, ownerType);
//   <ProfileBoardCanvas ownerType="group" record={group} pageIcons={…}
//     page={page} tourId="group-profile-tabs" api={{ alters }} />
//
// It renders ExperimentalDashboard (the home-screen canvas) with the
// profile's board store (boardStore.js): the ProfileBoard row when the
// person has edited the layout, else the seeded board built from the record
// (profileBoard.js), which is today's page. The canvas's own auto-fit on a
// still-seeded board is kept in memory here and never written — no row
// exists until the person's first real edit.
//
// useProfilePageState keeps the URL's ?tab= and the page shown in step
// (today's deep links name a tab; a page the person added is named by its
// id), and knows whether the board is in layout-edit mode so the page's
// own header buttons can step aside.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import { V2_WIDGETS } from "@/v2/widgets";
import { profileRegistryFor } from "@/v2/profileWidgets";
import { BoardSubjectContext } from "@/lib/boardSubject";
import { profileBoardStore, profileBoardQueryKey, listProfileBoardRows } from "@/lib/boardStore";
import { seedProfileBoard, profilePageId, tabOfPageId, DEFAULT_OWNER_ID, pickProfileBoardRows, layoutForCopy } from "@/lib/profileBoard";

export const PROFILE_EDIT_EVENT = "os-profile-edit-home";
export const openProfileLayoutEditor = () => window.dispatchEvent(new CustomEvent(PROFILE_EDIT_EVENT));

// `aliases` maps an older ?tab= name onto the page that holds it now (the
// new alter profile, v0.305.0). When `pages` changes (the profile switched
// layouts), the page shown follows the URL again.
export function useProfilePageState(pages, { aliases = null } = {}) {
  const tabNames = useMemo(() => pages.map((p) => p.tab), [pages]);
  const firstPageId = profilePageId(pages[0].tab);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageIdOfTabParam = useCallback((t) => {
    if (!t) return null;
    if (tabNames.includes(t)) return profilePageId(t);
    if (aliases?.[t] && tabNames.includes(aliases[t])) return profilePageId(aliases[t]);
    return t;
  }, [tabNames, aliases]);
  const tabParam = searchParams.get("tab");
  const initialPageId = pageIdOfTabParam(tabParam);
  const [currentPageId, setCurrentPageId] = useState(initialPageId || firstPageId);
  const pagesKey = tabNames.join("|");
  const lastPagesKey = React.useRef(pagesKey);
  useEffect(() => {
    if (lastPagesKey.current === pagesKey) return;
    lastPagesKey.current = pagesKey;
    setCurrentPageId(initialPageId || firstPageId);
  }, [pagesKey, initialPageId, firstPageId]);
  const onPageChange = useCallback((pageId) => {
    setCurrentPageId(pageId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (pageIdOfTabParam(next.get("tab")) === pageId) return prev;
      if (pageId === firstPageId) next.delete("tab"); else next.set("tab", tabOfPageId(pageId) || pageId);
      // A ?compose= / ?messageId= belongs to the page it opened.
      next.delete("compose"); next.delete("messageId");
      return next;
    }, { replace: true });
  }, [setSearchParams, pageIdOfTabParam, firstPageId]);
  // Whether the board itself is in layout-edit mode (its edit bar is up).
  const [layoutEditing, setLayoutEditing] = useState(false);
  useEffect(() => {
    const onState = (e) => { if (e?.detail?.scope === "os-profile") setLayoutEditing(!!e.detail.editing); };
    window.addEventListener("os-home-edit-state", onState);
    return () => window.removeEventListener("os-home-edit-state", onState);
  }, []);
  return {
    initialPageId, currentPageId, onPageChange, layoutEditing,
    onFirstPage: currentPageId === firstPageId,
    searchParams, setSearchParams,
  };
}

// `layoutSuffix` picks which of the record's layouts this is: "" the
// classic one, "::v2" the new alter profile's (its own row and default,
// so the classic layout is never touched).
export default function ProfileBoardCanvas({ ownerType, record, pageIcons = null, page, tourId = null, api = null, layoutSuffix = "" }) {
  const queryClient = useQueryClient();
  // The settings row carries the device look and the saved widget styles
  // the canvas reads; the profile's own layout is its ProfileBoard row.
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = settingsRows[0] || null;
  const recordId = record?.id || null;
  const ownerId = recordId ? `${recordId}${layoutSuffix}` : null;
  const defaultOwnerId = DEFAULT_OWNER_ID + layoutSuffix;
  const { data: boardRows = [], isFetched: boardRowsFetched } = useQuery({
    queryKey: profileBoardQueryKey(ownerType, ownerId),
    queryFn: () => listProfileBoardRows(ownerType, ownerId),
    enabled: !!ownerId,
  });
  // The type's default layout (v0.292.0), shown when the profile has no
  // row of its own; its first edit copies it into the profile's own row.
  const { data: defaultRows = [], isFetched: defaultRowsFetched } = useQuery({
    queryKey: profileBoardQueryKey(ownerType, defaultOwnerId),
    queryFn: () => listProfileBoardRows(ownerType, defaultOwnerId),
  });
  const defaultBoard = useMemo(() => layoutForCopy(pickProfileBoardRows(defaultRows).board), [defaultRows]);
  const [fittedSeed, setFittedSeed] = useState(null);
  useEffect(() => { setFittedSeed(null); }, [ownerId, defaultBoard]);
  const boardStore = useMemo(() => {
    if (!record) return null;
    const base = profileBoardStore({ ownerType, ownerId, rows: boardRows, qc: queryClient });
    return {
      ...base,
      recordId,
      layoutSuffix,
      board: base.board || fittedSeed || defaultBoard || seedProfileBoard(record, ownerType),
      write: async (next, opts) => {
        const row = await base.write(next, opts);
        if (!row) setFittedSeed(next);
        return row;
      },
    };
  }, [record, ownerType, ownerId, recordId, layoutSuffix, boardRows, fittedSeed, defaultBoard, queryClient]);
  const registry = useMemo(() => profileRegistryFor(ownerType, V2_WIDGETS), [ownerType]);
  const subject = useMemo(() => (recordId ? { type: ownerType, id: recordId } : null), [ownerType, recordId]);
  const boardApi = useMemo(() => api || {}, [api]);
  if (!boardStore || !boardRowsFetched || !defaultRowsFetched) return null;
  return (
    <BoardSubjectContext.Provider value={subject}>
      <ExperimentalDashboard
        settingsRow={settingsRow}
        api={boardApi}
        registry={registry}
        boardStore={boardStore}
        eventPrefix="os-profile"
        viewFlow
        notices={null}
        initialPageId={page.initialPageId}
        onPageChange={page.onPageChange}
        pageStrip="tabs"
        pageIcons={pageIcons}
        pageStripProps={tourId ? { "data-tour": tourId } : null}
      />
    </BoardSubjectContext.Provider>
  );
}
