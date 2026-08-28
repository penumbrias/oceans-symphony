// The planner page — the surface plus nothing else. Everything it does
// lives in PlannerSurface so the home-screen widgets behave identically.
//
// Deep links: `?activityId=<id>` opens that plan's details (the planner
// is where plans live now — the activity tracker is being retired, so
// every "open this plan" link lands here). The param is consumed once
// and stripped so a refresh or back-nav doesn't reopen the sheet.

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PlannerSurface from "@/components/planner/PlannerSurface";

export default function Planner() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const id = params.get("activityId");
    if (!id) return;
    setOpenId(id);
    const next = new URLSearchParams(params);
    next.delete("activityId");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <PlannerSurface
      dayCount={7}
      chrome
      openActivityId={openId}
      onOpenedActivity={() => setOpenId(null)}
    />
  );
}
