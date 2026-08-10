// The planner page — the surface plus nothing else. Everything it does
// lives in PlannerSurface so the home-screen widgets behave identically.

import React from "react";
import PlannerSurface from "@/components/planner/PlannerSurface";

export default function Planner() {
  return <PlannerSurface dayCount={7} chrome />;
}
