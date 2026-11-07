import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { GraduationCap, X } from "lucide-react";
import { toast } from "sonner";
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
} from "@/lib/pageTutorials";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { isOnboardingDone } from "@/lib/onboardingState";

// Banner that appears once per page on first visit, offering to launch
// the FeatureTour scoped to that route. See src/lib/pageTutorials.js for
// state rules. Mounting site: AppLayout, just above the route Outlet.
//
// onLaunch(route) — caller is responsible for mounting <FeatureTour
// restrictToRoute={route} ... /> when this fires. Marking seen happens
// both on explicit interaction here and when the user navigates away
// without engaging (the useEffect cleanup).
export default function PageTutorialBanner({ onLaunch }) {
  const { pathname } = useLocation();
  const [, forceTick] = useState(0);

  // Re-render when pageTutorials state changes (Settings reset, etc.).
  useEffect(() => subscribePageTutorials(() => forceTick(n => n + 1)), []);

  // The banner PERSISTS on the page across visits until the user acts on it —
  // it's only marked "seen" when they explicitly tap "Show me around" or the X
  // (handleShow / handleDismiss). Previously, navigating away marked it seen,
  // so it vanished after a single glance without being dismissed.

  // Seen-ness is per page, not per record: one "seen" covers every
  // profile. The tour itself is launched for the exact path so it opens on
  // THIS profile.
  const pageKey = tutorialRouteKey(pathname);
  const [routes, setRoutes] = useState(tourRoutesIfLoaded);
  // No page tips until setup is finished or skipped (v0.370.3): the first
  // minutes belong to the welcome steps.
  const { data: settingsList, isFetched: settingsFetched } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const setupDone = settingsFetched && isOnboardingDone(pickPrimarySystemSettings(settingsList || []));
  const couldShow = setupDone && mayShow(pageKey);
  useEffect(() => {
    if (routes || !couldShow) return;
    let live = true;
    loadTourRoutes().then((r) => { if (live && r) setRoutes(r); });
    return () => { live = false; };
  }, [routes, couldShow]);
  // The gentlest prompt in the app: it waits while anything else (a
  // reminder, a notice, "Continue setup") is asking for attention.
  const wanted = couldShow && !!routes?.has(pageKey);
  const mine = useAttentionSlot("page-tutorial", { priority: ATTENTION.TIP, active: wanted });
  if (!wanted || !mine) return null;

  const handleShow = () => {
    markRouteSeen(pageKey);
    onLaunch?.(pathname);
  };
  const handleDismiss = () => {
    markRouteSeen(pageKey);
  };
  // Turns the prompt off on every page (it comes
  // back from Settings → Tour). Nothing is lost: the tours stay in Settings → Tour.
  const handleStopAll = () => {
    markRouteSeen(pageKey);
    setPageTutorialsEnabled(false);
    toast("Page tips are off. Settings → Tour turns them back on.");
  };

  return (
    <div className="mb-3 mt-1">
      <div className="flex items-center gap-2 bg-primary/8 border border-primary/20 rounded-xl px-3 py-2">
        <GraduationCap className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs flex-1 text-foreground leading-snug">
          <span className="font-medium">New to this page?</span>{" "}
          <button
            type="button"
            onClick={handleShow}
            className="text-primary underline underline-offset-2 hover:opacity-80 font-medium"
          >
            Show me around
          </button>
        </p>
        <button
          type="button"
          onClick={handleStopAll}
          className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 flex-shrink-0 rounded-md hover:bg-muted/40 transition-colors"
        >
          Stop showing these
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss page tutorial prompt"
          className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0 rounded-md hover:bg-muted/40 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function mayShow(pageKey) {
  if (!arePageTutorialsEnabled()) return false;
  if (hasUserCompletedFullTour()) return false;
  return !isRouteSeen(pageKey);
}
