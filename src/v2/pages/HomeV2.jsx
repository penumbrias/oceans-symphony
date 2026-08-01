// UI v2 Home — the customizable widget homescreen.
//
// The canvas is REUSED from the experimental homescreen (grid, hold-to-
// move, edge-resize, pages + swipe, edit mode, app drawer, styles,
// wallpaper) — those mechanics are functionality, and functionality is
// kept. What's different is the widget set: `V2_WIDGETS` renders every
// widget through the new v2 primitives instead of embedding the legacy
// dashboard components.
//
// The layout is stored in its own SystemSettings field (`ui_v2_home`), so
// switching between the old experimental homescreen and this one never
// disturbs the other's arrangement.

import React, { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import { V2_WIDGETS, seedV2Home } from "@/v2/widgets";

export const V2_HOME_FIELD = "ui_v2_home";

export default function HomeV2({ settingsRow, api }) {
  const qc = useQueryClient();
  const seeded = useRef(false);

  // First open: lay out a sensible starting set instead of an empty grid.
  // Runs once, and only when nothing has been saved yet — a user who
  // clears every widget keeps their empty canvas.
  useEffect(() => {
    if (seeded.current) return;
    if (!settingsRow?.id) return;
    if (settingsRow[V2_HOME_FIELD]) return;
    seeded.current = true;
    (async () => {
      try {
        await base44.entities.SystemSettings.update(settingsRow.id, { [V2_HOME_FIELD]: seedV2Home() });
        qc.invalidateQueries({ queryKey: ["systemSettings"] });
      } catch { /* non-fatal: the canvas just starts empty */ }
    })();
  }, [settingsRow, qc]);

  return (
    <ExperimentalDashboard
      settingsRow={settingsRow}
      api={api}
      registry={V2_WIDGETS}
      settingsField={V2_HOME_FIELD}
    />
  );
}
