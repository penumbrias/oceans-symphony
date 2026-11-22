// "How this page works" — the pixel look's side help panel (computer
// width). It is where a page's "New to this page? Show me around" lives in
// the pixel look: the page's own tutorial steps, listed, with Show me around
// (the same page tour), the whole Tour, and the page-tips switch.
//
// It reads the steps through tourStepsFor (FeatureTour.jsx), the one copy
// the tours play, so the panel never says something the tour doesn't. The
// big tour module is only fetched once the panel opens.
import React from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { isOnboardingDone } from "@/lib/onboardingState";
import { GraduationCap, X } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useExperimentalOn } from "@/lib/experimentalFeatures";
import {
  isRouteSeen,
  markRouteSeen,
  arePageTutorialsEnabled,
  setPageTutorialsEnabled,
  hasUserCompletedFullTour,
  subscribePageTutorials,
  tutorialRouteKey,
  loadTourRoutes,
  tourRoutesIfLoaded,
  openPageTour,
  openFullTour,
} from "@/lib/pageTutorials";

export const PIXEL_HELP_KEY = "symphony_pixel_help_open_v1";

function readPinned() {
  try { return localStorage.getItem(PIXEL_HELP_KEY) === "1"; } catch { return false; }
}
function writePinned(on) {
  try { localStorage.setItem(PIXEL_HELP_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
}

// Open when the person pinned it open, or — like the old banner — on a page
// they haven't seen yet that has a walk-through (page tips on, full tour not
// done). Closing it on a new page marks the page seen, as the banner's ×
// did.
export function usePixelHelp() {
  const { pathname } = useLocation();
  const key = tutorialRouteKey(pathname);
  const [pinned, setPinned] = React.useState(readPinned);
  const [, tick] = React.useState(0);
  const [routes, setRoutes] = React.useState(tourRoutesIfLoaded);
  React.useEffect(() => subscribePageTutorials(() => tick((n) => n + 1)), []);
  React.useEffect(() => {
    if (routes) return;
    let live = true;
    loadTourRoutes().then((r) => { if (live && r) setRoutes(r); });
    return () => { live = false; };
  }, [routes]);
  // No page tips until setup is finished or skipped, like the banner.
  const { data: settingsList, isFetched } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const setupDone = isFetched && isOnboardingDone(pickPrimarySystemSettings(settingsList || []));
  const fresh = setupDone && !!routes?.has(key) && arePageTutorialsEnabled() && !hasUserCompletedFullTour() && !isRouteSeen(key);
  const open = pinned || fresh;
  const setOpen = (on) => {
    setPinned(on);
    writePinned(on);
    if (!on) markRouteSeen(key);
  };
  return { open, setOpen };
}

export default function PixelHelpPanel({ open, onClose }) {
  const { pathname } = useLocation();
  const t = useTerms();
  const experimentalOn = useExperimentalOn();
  const [mod, setMod] = React.useState(null);
  const [, tick] = React.useState(0);
  React.useEffect(() => subscribePageTutorials(() => tick((n) => n + 1)), []);
  React.useEffect(() => {
    if (!open || mod) return;
    let live = true;
    import("@/components/onboarding/FeatureTour").then((m) => { if (live) setMod(m); }).catch(() => {});
    return () => { live = false; };
  }, [open, mod]);

  // The panel takes room from the page instead of covering it.
  React.useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-px-help", "1");
    else root.removeAttribute("data-px-help");
    return () => root.removeAttribute("data-px-help");
  }, [open]);

  const alterId = pathname.match(/^\/alter\/([^/?#]+)/)?.[1] || null;
  const steps = React.useMemo(
    () => (mod ? mod.tourStepsFor(t, { restrictToRoute: pathname, alterId, experimentalOn }) : null),
    [mod, t, pathname, alterId, experimentalOn],
  );
  if (!open) return null;

  const tipsOn = arePageTutorialsEnabled();
  const showAround = () => {
    markRouteSeen(tutorialRouteKey(pathname));
    openPageTour(pathname);
  };

  return (
    <aside className="px-help" aria-label="How this page works">
      <div className="px-help-ttl">
        <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /> How this page works</span>
        <button type="button" className="px-help-x" onClick={onClose} aria-label="Close how this page works">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-help-body">
        {!steps && <p className="px-help-muted">Loading…</p>}
        {steps && steps.length === 0 && (
          <p className="px-help-muted">This page has no walk-through yet. The Tour shows the whole app.</p>
        )}
        {steps && steps.length > 0 && (
          <ol className="px-help-steps">
            {steps.map((st, i) => (
              <li key={`${st.title}-${i}`}>
                <div className="px-help-step-title">
                  {st.emoji && <span aria-hidden="true">{st.emoji}</span>} {st.title}
                </div>
                {st.body && <div className="px-help-step-body">{st.body}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="px-help-foot">
        {steps && steps.length > 0 && (
          <button type="button" className="px-help-btn px-help-btn-main" onClick={showAround}>Show me around</button>
        )}
        <button type="button" className="px-help-btn" onClick={openFullTour}>Take the tour</button>
        <label className="px-help-switch">
          <input
            type="checkbox"
            checked={tipsOn}
            onChange={(e) => setPageTutorialsEnabled(e.target.checked)}
          />
          Open this on pages I haven't seen
        </label>
      </div>
    </aside>
  );
}
