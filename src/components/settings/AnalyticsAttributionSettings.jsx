// Analytics & attribution — grouping, inferred presence and the dashboard
// insight spotlight — as one Settings page in the row grammar (v0.320.0).
// The values and writes are the ones the old Tracking setup subsection had.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
import {
  getInferPresenceEnabled, setInferPresenceEnabled, getInferPresenceWindowMinutes, setInferPresenceWindowMinutes,
} from "@/lib/inferredPresence";
import { Group, ChoiceRow, SwitchRow } from "@/components/shared/SettingRows";

const WINDOWS = [
  { id: 30, label: "30 min" }, { id: 60, label: "1 hour" }, { id: 120, label: "2 hours" },
  { id: 180, label: "3 hours" }, { id: 240, label: "4 hours" }, { id: 360, label: "6 hours" },
];

export default function AnalyticsAttributionSettings() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const { mode: analyticsGrouping, setMode: setAnalyticsGrouping } = useAnalyticsGrouping();
  const [inferPresence, setInferPresence] = useState(getInferPresenceEnabled);
  const [inferWindow, setInferWindow] = useState(getInferPresenceWindowMinutes);
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = pickPrimarySystemSettings(rows);
  const spotlight = settings?.analytics_spotlight_enabled === true;

  const half = inferWindow / 2;
  const halfLabel = inferWindow >= 60
    ? `${(half / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hour${half / 60 === 1 ? "" : "s"}`
    : `${half} min`;

  return (
    <div>
      <Group title="Analytics grouping" first>
        <ChoiceRow label="Group data by"
          hint={`For large ${terms.systems}, analytics can aggregate by group instead of by individual ${terms.alter}. Groups are managed from the ${terms.System} Members page.`}
          options={[{ id: "individual", label: `By ${terms.alter}` }, { id: "group", label: "By group" }]}
          value={analyticsGrouping} onChange={setAnalyticsGrouping} />
        {analyticsGrouping === "group" && (
          <p className="text-xs text-muted-foreground mt-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
            Group mode is active. Patterns & Insights will show data aggregated by group.
            {" "}{terms.Alters} without a group appear under "Ungrouped."
          </p>
        )}
      </Group>

      <Group title="Attribution">
        <SwitchRow label="Infer presence from authored content"
          hint={`When an ${terms.alter} posts a chat message, bulletin or journal, treat that as them being present for a window around then, so nearby activities, emotions and symptoms get attributed to them even without ${terms.fronting} tracking.`}
          checked={inferPresence}
          onChange={(next) => { setInferPresence(next); setInferPresenceEnabled(next); }} />
        {inferPresence && (
          <ChoiceRow label="Presence window"
            hint={`Centred on each post (±${halfLabel}). Changing it re-shapes analytics immediately.`}
            options={WINDOWS} value={inferWindow}
            onChange={(min) => { setInferWindow(min); setInferPresenceWindowMinutes(min); }} />
        )}
      </Group>

      {/* Opt-in, and it lives HERE (not on the dashboard: the explainer card
          there felt intrusive). */}
      <Group title="Dashboard">
        <SwitchRow label="Insight spotlight (experimental)"
          hint={`Shows one gentle pattern from your analytics on the dashboard, like a shift in ${terms.switch} rhythm or sleep vs your own usual. Descriptive only, dismissible, never a judgement.`}
          checked={spotlight}
          onChange={async (next) => {
            try {
              if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { analytics_spotlight_enabled: next });
              else await base44.entities.SystemSettings.create({ analytics_spotlight_enabled: next });
              refetch();
              queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
            } catch { /* non-fatal */ }
          }} />
      </Group>
    </div>
  );
}
