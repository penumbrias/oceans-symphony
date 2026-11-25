// The right dock: one tabbed stack, Info · Layers · History · Help (plan §3,
// board 22 / requirement R1). The same body is the right dock in the full
// studio and the Info sheet in the compact studio.
//
// A room not rebuilt yet has no Info or Layers of its own; those tabs say so
// plainly and point at what the page holds. Help is the page's own tutorial
// (tourStepsFor, the one copy every tour plays) with "Show me around this
// page", the whole Tour and the page-tips switch — so page tips live here
// and nowhere else (R1). History is the newest Recent changes.

import Penumblob from "@/components/shared/Penumblob";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, History, Info as InfoIcon, Layers as LayersIcon, Map as MapIcon, PlayCircle } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useExperimentalOn } from "@/lib/experimentalFeatures";
import { formatDistanceToNow } from "date-fns";
import {
  isRouteSeen, markRouteSeen, arePageTutorialsEnabled, setPageTutorialsEnabled,
  subscribePageTutorials, tutorialRouteKey, loadTourRoutes, tourRoutesIfLoaded,
  openPageTour, openFullTour,
} from "@/lib/pageTutorials";
import { PageTabs, TabPanel } from "@/house/kit/Panel";
import { Button } from "@/house/kit/Button";
import { Switch } from "@/house/kit/Choices";
import Info from "@/house/kit/Info";
import { Row } from "@/house/kit/Content";
import { EmptyBlock, LoadingBlock, ErrorBlock } from "@/house/kit/States";
import { useRecentChanges } from "@/house/frame/useFrameData";
import { recordKindLabel } from "@/house/frame/recordLabels";

export const DOCK_TAB_LIST = [
  { id: "info", label: "Info", icon: InfoIcon },
  { id: "layers", label: "Layers", icon: LayersIcon },
  { id: "history", label: "History", icon: History },
  { id: "help", label: "Help", icon: GraduationCap },
];

// Has this page a walk-through the person hasn't seen yet? (Puts a dot on Help.)
export function useFreshPageHelp(pathname) {
  const key = tutorialRouteKey(pathname);
  const [, tick] = useState(0);
  const [routes, setRoutes] = useState(tourRoutesIfLoaded);
  useEffect(() => subscribePageTutorials(() => tick((n) => n + 1)), []);
  useEffect(() => {
    if (routes) return undefined;
    let live = true;
    loadTourRoutes().then((r) => { if (live && r) setRoutes(r); });
    return () => { live = false; };
  }, [routes]);
  return !!routes?.has(key) && arePageTutorialsEnabled() && !isRouteSeen(key);
}

function InfoTab({ page }) {
  const t = useTerms();
  const rows = [
    { id: "area", label: "Area", value: page.area?.label || "", empty: "Not in a menu" },
    { id: "room", label: "Room", value: "The page you know, inside the new frame", lockedReason: "This room is rebuilt in a later step" },
  ];
  return (
    <Info
      title={page.title}
      kind={page.kind === "profile" ? `${page.area?.label || t.System} · profile` : page.area?.label || "Page"}
      sections={[{ id: "page", title: "This page", rows }]}
    />
  );
}

function LayersTab() {
  return (
    <EmptyBlock compact icon={LayersIcon} title="No layers on this page"
      body="Pages that draw things in layers, like the Day and the map, list them here to show, hide and reorder." />
  );
}

function HistoryTab({ active }) {
  const t = useTerms();
  const navigate = useNavigate();
  const { data = [], isLoading, isError, refetch } = useRecentChanges(active);
  if (isLoading) return <LoadingBlock label="Loading recent changes" rows={4} />;
  if (isError) return <ErrorBlock what="Couldn't load recent changes" onRetry={() => refetch()} />;
  const rows = data.filter((e) => e && !e.trashed_at).slice(0, 8);
  if (!rows.length) {
    return <EmptyBlock compact icon={History} title="No changes yet" body="Edits, deletes and layout changes show here, each with a way to put it back." />;
  }
  const verb = (e) => (e.action === "deleted" ? "Deleted" : e.action === "edited" ? "Edited" : e.action === "synced" ? "Replaced by sync" : e.action === "layout" ? "Layout changed" : "Changed");
  const what = (e) => {
    const entity = recordKindLabel(e.entity, t);
    return `${entity}${e.label ? `: ${e.label}` : ""}`;
  };
  const when = (e) => { try { return formatDistanceToNow(new Date(e.timestamp), { addSuffix: true }); } catch { return ""; } };
  return (
    <div className="hf-dock-list">
      <ul className="hf-plain-list">
        {rows.map((e) => (
          <li key={e.id}><Row title={verb(e)} subtitle={what(e)} meta={when(e)} href="/history" /></li>
        ))}
      </ul>
      <Button rank="secondary" block icon={History} onClick={() => navigate("/history")}>
        Open Recent changes
      </Button>
    </div>
  );
}

function HelpTab({ active }) {
  const { pathname } = useLocation();
  const t = useTerms();
  const experimentalOn = useExperimentalOn();
  const [mod, setMod] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => subscribePageTutorials(() => tick((n) => n + 1)), []);
  useEffect(() => {
    if (!active || mod) return undefined;
    let live = true;
    import("@/components/onboarding/FeatureTour").then((m) => { if (live) setMod(m); }).catch(() => {});
    return () => { live = false; };
  }, [active, mod]);
  // Opening Help on a page counts as having seen its tips.
  useEffect(() => { if (active) markRouteSeen(tutorialRouteKey(pathname)); }, [active, pathname]);
  const alterId = pathname.match(/^\/alter\/([^/?#]+)/)?.[1] || null;
  const steps = useMemo(
    () => (mod ? mod.tourStepsFor(t, { restrictToRoute: pathname, alterId, experimentalOn }) : null),
    [mod, t, pathname, alterId, experimentalOn],
  );
  return (
    <div className="hf-help">
      <div className="hf-help-guide">
        <Penumblob size={48} cue={active ? pathname : null} />
        <p className="hf-help-guide-line">{"Here's how this page works. Ask me to show you around, one part at a time."}</p>
      </div>
      {!steps ? <LoadingBlock label="Loading this page's help" rows={3} /> : null}
      {steps && steps.length === 0 ? (
        <EmptyBlock compact icon={GraduationCap} title="No walk-through for this page yet"
          body="The Tour shows the whole app, one place at a time." action={{ label: "Take the tour", icon: MapIcon, onClick: openFullTour }} />
      ) : null}
      {steps && steps.length > 0 ? (
        <>
          <Button rank="primary" block icon={PlayCircle} onClick={() => { markRouteSeen(tutorialRouteKey(pathname)); openPageTour(pathname); }}>
            Show me around this page
          </Button>
          <ol className="hf-help-steps">
            {steps.map((st, i) => (
              <li key={`${st.title}-${i}`}>
                <h3 className="house-label hf-help-step-title">{st.title}</h3>
                {st.body ? <p className="hf-help-step-body">{st.body}</p> : null}
              </li>
            ))}
          </ol>
          <Button rank="secondary" block icon={MapIcon} onClick={openFullTour}>Take the tour</Button>
        </>
      ) : null}
      <Switch label="Show a dot on Help for pages I haven't seen" checked={arePageTutorialsEnabled()} onChange={(on) => setPageTutorialsEnabled(on)} />
    </div>
  );
}

export default function DockPanels({ tab, onTab, page, fresh }) {
  const idPrefix = "hf-dock";
  // Words only (no icons), so all four fit the narrowest dock.
  const tabs = DOCK_TAB_LIST.map(({ icon: _icon, ...d }) => ({ ...d, dot: d.id === "help" && fresh && tab !== "help", dotLabel: "has a walk-through you haven't seen" }));
  return (
    <div className="hf-dock">
      <PageTabs label={`Panels for ${page.title}`} tabs={tabs} value={tab} onChange={onTab} idPrefix={idPrefix} withPanels />
      <TabPanel idPrefix={idPrefix} id={tab} className="hf-dock-body">
        {tab === "info" ? <InfoTab page={page} /> : null}
        {tab === "layers" ? <LayersTab /> : null}
        {tab === "history" ? <HistoryTab active /> : null}
        {tab === "help" ? <HelpTab active /> : null}
      </TabPanel>
    </div>
  );
}
