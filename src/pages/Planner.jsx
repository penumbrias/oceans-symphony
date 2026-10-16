// The planner page — the surface plus nothing else. Everything it does
// lives in PlannerSurface so the home-screen widgets behave identically.
//
// The planner is THE activities page now: the old activity tracker was
// merged into it, and /activities redirects here (see ActivitiesRedirect).
//
// Deep links: `?activityId=<id>` (or the older `?highlight=<id>`) opens
// that entry's details; `?date=YYYY-MM-DD` starts on that day's week. The
// params are consumed once and stripped so a refresh or back-nav doesn't
// reopen the sheet.

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PlannerSurface from "@/components/planner/PlannerSurface";

function parseDay(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Planner() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  // Read once on mount — the surface owns the anchor after that.
  const [initialAnchor] = useState(() => parseDay(params.get("date")));

  useEffect(() => {
    const id = params.get("activityId") || params.get("highlight");
    if (!id && !params.has("date")) return;
    if (id) setOpenId(id);
    const next = new URLSearchParams(params);
    next.delete("activityId");
    next.delete("highlight");
    next.delete("date");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <PlannerSurface
      dayCount={7}
      chrome
      initialAnchor={initialAnchor}
      openActivityId={openId}
      onOpenedActivity={() => setOpenId(null)}
    />
  );
}
