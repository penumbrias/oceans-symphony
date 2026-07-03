import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { GraduationCap, X } from "lucide-react";
import {
  isRouteSeen,
  markRouteSeen,
  arePageTutorialsEnabled,
  hasUserCompletedFullTour,
  subscribePageTutorials,
} from "@/lib/pageTutorials";
import { getRoutesWithTourSteps } from "@/components/onboarding/FeatureTour";

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

  if (!shouldShow(pathname)) return null;

  const handleShow = () => {
    markRouteSeen(pathname);
    onLaunch?.(pathname);
  };
  const handleDismiss = () => {
    markRouteSeen(pathname);
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

function shouldShow(pathname) {
  if (!arePageTutorialsEnabled()) return false;
  if (hasUserCompletedFullTour()) return false;
  if (isRouteSeen(pathname)) return false;
  return getRoutesWithTourSteps().has(pathname);
}
