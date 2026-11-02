// "Goals earn XP" — the one switch for whether Goals add to the
// recurring-tasks level (src/lib/goalXp.js). Lives in Recurring tasks →
// Manage tasks, next to the XP it changes. Hidden while Goals is off.
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { SwitchRow } from "@/components/shared/SettingRows";
import { useGoalXp } from "@/lib/useGoalXp";
import { GOAL_XP } from "@/lib/goalXp";

export default function GoalsXpSwitch() {
  const qc = useQueryClient();
  const { available, on, settings } = useGoalXp();
  if (!available || !settings?.id) return null;
  const set = async (next) => {
    try {
      await base44.entities.SystemSettings.update(settings.id, { goals_earn_xp: !!next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    }
  };
  return (
    <SwitchRow
      label="Goals earn XP"
      hint={`${GOAL_XP.tick} XP for each point ticked on a goal, ${GOAL_XP.activity} for each time a tracked activity is done (up to its target), ${GOAL_XP.reached} for reaching a goal.`}
      checked={on}
      onChange={set}
    />
  );
}
