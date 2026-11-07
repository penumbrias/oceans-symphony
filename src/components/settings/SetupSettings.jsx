// Settings → Setup (v0.369.0): what's set up so far, from the same step
// list as the home screen's setup card (src/lib/setupSteps.js). Each row
// opens the real page where that thing is done. "Start over" runs the
// welcome steps again and never deletes anything; "Take the tour" is the
// whole-app tour.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle, RotateCcw, Map } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Group, LinkRow } from "@/components/shared/SettingRows";
import { useSetupSteps, SETUP_GROUPS } from "@/lib/setupSteps";
import { storedOnboarding } from "@/lib/onboardingState";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { openFullTour } from "@/lib/pageTutorials";
import { useTerms } from "@/lib/useTerms";

const DoneIcon = ({ className }) => <Check className={`${className} !text-primary`} aria-hidden="true" />;
const OpenIcon = ({ className }) => <Circle className={`${className} opacity-60`} aria-hidden="true" />;

function when(iso) {
  try { return format(new Date(iso), "d MMM yyyy"); } catch { return null; }
}

export default function SetupSettings() {
  const t = useTerms();
  const navigate = useNavigate();
  const { steps, isFetched, doneCount, total } = useSetupSteps();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const ob = storedOnboarding(pickPrimarySystemSettings(settingsList));
  const finished = ob.completed_at ? when(ob.completed_at) : null;

  return (
    <div className="space-y-1" data-tour="settings-setup-page">
      <p className="text-sm text-muted-foreground leading-relaxed pb-2">
        {isFetched ? `${doneCount} of ${total} set up.` : "Checking…"}{" "}
        Each line is marked from what's really saved for your {t.system}, so it's the same for every {t.alter}. Tap one to go there.
        {finished ? ` Welcome steps finished ${finished}.` : ""}
      </p>
      {SETUP_GROUPS.map((g, i) => {
        const rows = steps.filter((s) => s.group === g.id);
        if (!rows.length) return null;
        return (
          <Group key={g.id} title={g.label} first={i === 0}>
            {rows.map((s) => (
              <LinkRow key={s.id}
                icon={s.done ? DoneIcon : OpenIcon}
                label={<>{s.label}<span className="sr-only">{s.done ? " (done)" : " (not done yet)"}</span></>}
                value={s.value}
                onClick={() => navigate(s.path)} />
            ))}
          </Group>
        );
      })}
      <Group title="Again">
        <LinkRow icon={RotateCcw} label="Start over"
          hint="Runs the welcome steps again. Nothing is deleted or replaced."
          onClick={() => navigate("/?onboarding=replay")} />
        <LinkRow icon={Map} label="Take the tour" hint="The whole app, one page at a time."
          onClick={() => openFullTour()} />
      </Group>
    </div>
  );
}
