// The Activities page — managing the activities themselves: add, nest,
// reorder, rename, recolour and delete them, and open one to see how it's
// been going and who / which feelings are linked to it.
//
// Logging and planning live on the Planner. Old /activities links that
// pointed at an entry (?activityId=, ?highlight=, ?date= — notifications,
// mentions, search results saved before the merge) still go there, params
// intact. `?category=<id>` opens that activity's details here.

import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityManager } from "@/components/activities/ActivityCustomizationMenu";
import ActivityCategoryDetail from "@/components/activities/ActivityCategoryDetail";
import ActivityNestingRecovery from "@/components/activities/ActivityNestingRecovery";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

export default function Activities() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(() => params.get("category"));

  useEffect(() => {
    if (!params.has("category")) return;
    const next = new URLSearchParams(params);
    next.delete("category");
    setParams(next, { replace: true });
  }, [params, setParams]);
  // Back to the top whenever the view changes — the details page is long.
  useEffect(() => { try { window.scrollTo(0, 0); } catch { /* */ } }, [openId]);

  if (params.has("activityId") || params.has("highlight") || params.has("date")) {
    return <Navigate to={`/planner${search}`} replace />;
  }

  return (
    <div className="min-h-screen p-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto space-y-3" data-tour="activities-manage">
        <ErrorBoundary
          fallback={(err, reset) => <ActivityNestingRecovery error={err} onReset={reset} />}
          resetKeys={[openId]}>
          {openId ? (
            <ActivityCategoryDetail categoryId={openId} onBack={() => setOpenId(null)} onOpen={setOpenId} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <h1 className="font-display text-3xl font-semibold text-foreground">Activities</h1>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/planner")}>
                  <CalendarRange className="w-4 h-4" /> Planner
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tap an activity to select it, then Details, edit, add a sub-activity or delete. Drag (or use “→ here”) to nest one inside another.
              </p>
              <ActivityManager onOpen={setOpenId} />
            </>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
