// UI v2 Home — the customizable widget homescreen.
//
// The canvas is REUSED from the experimental homescreen (grid, hold-to-
// move, edge-resize, pages + swipe, edit mode, app drawer, styles,
// wallpaper) — those mechanics are functionality, and functionality is
// kept. What's different is the widget set: `V2_WIDGETS` renders every
// widget through the new v2 primitives instead of embedding the legacy
// dashboard components.
//
// PER-DEVICE LAYOUTS. A phone screen and a monitor want different
// arrangements, so each keeps its own layout in its own SystemSettings
// field. A desktop opening for the first time starts from a COPY of the
// phone layout (never an empty grid), and from then on the two are
// independent — rearranging on the laptop doesn't disturb the phone.
// Both fields live on the same settings row, so backups and device sync
// carry them without any extra wiring.

import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import { V2_WIDGETS, seedV2Home } from "@/v2/widgets";

export const V2_HOME_FIELD = "ui_v2_home";
export const V2_HOME_FIELD_DESKTOP = "ui_v2_home_desktop";

// Matches the `lg:` breakpoint the rest of the v2 chrome switches at, so
// the rail and the desktop layout always appear together.
function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = (e) => setWide(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function HomeV2({ settingsRow, api }) {
  const qc = useQueryClient();
  const wide = useIsWide();
  const field = wide ? V2_HOME_FIELD_DESKTOP : V2_HOME_FIELD;
  const seeded = useRef({});

  // First open of this device class: lay out a starting set instead of an
  // empty grid. Runs once per field, and only when nothing is saved yet —
  // a user who clears every widget keeps their empty canvas.
  useEffect(() => {
    if (seeded.current[field]) return;
    if (!settingsRow?.id) return;
    if (settingsRow[field]) return;
    seeded.current[field] = true;
    const start = wide && settingsRow[V2_HOME_FIELD]
      ? JSON.parse(JSON.stringify(settingsRow[V2_HOME_FIELD]))
      : seedV2Home();
    (async () => {
      try {
        await base44.entities.SystemSettings.update(settingsRow.id, { [field]: start });
        qc.invalidateQueries({ queryKey: ["systemSettings"] });
      } catch { /* non-fatal: the canvas just starts empty */ }
    })();
  }, [settingsRow, field, wide, qc]);

  return (
    <ExperimentalDashboard
      // Remounting on a breakpoint change keeps the canvas's internal
      // page/edit state from carrying across two different layouts.
      key={field}
      settingsRow={settingsRow}
      api={api}
      registry={V2_WIDGETS}
      settingsField={field}
    />
  );
}
