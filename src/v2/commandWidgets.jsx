// Every quick-action-bar button, available as its own widget.
//
// The command bar and the dock are optional chrome — a user who turns them
// off shouldn't lose the actions. So each key (check-in, note, activity,
// symptom, task, plan, set front, support) is registrable as a widget and
// fires exactly what the bar fires: the same modals, hosted by the
// Dashboard, reached the same way. No second implementation of any capture
// flow lives here.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart, PenLine, Zap, Activity as ActivityIcon, CheckSquare, CalendarDays,
  Users, LifeBuoy,
} from "lucide-react";

import { V2_COMMAND_KEYS } from "@/lib/uiV2";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { boxStyle } from "@/v2/primitives";
import { QuickNoteSheet } from "@/components/v2/V2Frame";

// id → { icon, i18n label key }. "support" isn't a command key (it's the
// bar's own anchor) but belongs in the same set from the user's side.
// `label` names it in the widget picker (it can carry {{term}} tokens,
// resolved by widgetLabel); `labelKey` is the short button text at runtime.
export const COMMAND_WIDGETS = [
  { id: "quick_checkin", icon: Heart, label: "Check-in", labelKey: "capture.checkIn", desc: "Opens the quick check-in \u2014 the same one the command bar opens." },
  { id: "quick_note", icon: PenLine, label: "Quick note", labelKey: "capture.note", desc: "Jot a note without leaving the home screen." },
  { id: "start_activity", icon: Zap, label: "Start an activity", labelKey: "capture.activity", desc: "Start something and time it." },
  { id: "start_symptom", icon: ActivityIcon, label: "Start a symptom", labelKey: "capture.symptom", desc: "Start a symptom episode you can end later." },
  { id: "quick_task", icon: CheckSquare, label: "New to-do", labelKey: "capture.task", desc: "Add a to-do." },
  { id: "quick_plan", icon: CalendarDays, label: "New plan", labelKey: "capture.plan", desc: "Schedule something." },
  { id: "set_front", icon: Users, label: "Set {{fronters}}", labelKey: "capture.front", desc: "Open the Set {{Fronters}} window." },
  { id: "support", icon: LifeBuoy, label: "Support", labelKey: "capture.support", desc: "Go straight to grounding and support." },
];

const TARGETS = Object.fromEntries(V2_COMMAND_KEYS.map((k) => [k.id, k.target]));

export function CommandWidget({ keyId, mode = "normal", settings, api }) {
  const t = useT();
  const terms = useTerms();
  const navigate = useNavigate();
  const [noteOpen, setNoteOpen] = useState(false);
  const def = COMMAND_WIDGETS.find((c) => c.id === keyId) || COMMAND_WIDGETS[0];
  const Icon = def.icon;
  const label = settings?.label || applyTerms(t(def.labelKey), terms);

  const fire = () => {
    if (def.id === "quick_note") return setNoteOpen(true);
    if (def.id === "support") return navigate("/grounding");
    // Prefer the handlers the Dashboard already hosts; fall back to the
    // ?action= route the command bar uses (works from any page).
    const on = api?.quickOn || {};
    if (def.id === "start_activity" && on.startActivity) return on.startActivity();
    if (def.id === "start_symptom" && on.startSymptom) return on.startSymptom();
    if (def.id === "quick_task" && on.quickTask) return on.quickTask();
    if (def.id === "quick_plan" && on.quickPlan) return on.quickPlan();
    if (def.id === "quick_checkin") return window.dispatchEvent(new CustomEvent("open-quick-checkin"));
    if (def.id === "set_front") return window.dispatchEvent(new CustomEvent("open-set-front"));
    if (TARGETS[def.id]) return navigate(TARGETS[def.id]);
  };

  // The button IS the widget's one visible box (widget contract) — no
  // Section wrapper, so it reads as a key on the board, not a card with a
  // key inside it.
  return (
    <>
      <button
        type="button"
        onClick={fire}
        title={label}
        aria-label={label}
        className="h-full w-full flex items-center justify-center gap-2 transition-colors hover:bg-muted/30"
        style={{ ...boxStyle({ borderFallback: false }), color: "var(--v2-accent, hsl(var(--primary)))" }}
      >
        <Icon className="flex-shrink-0" style={{ width: "1.25em", height: "1.25em" }} />
        {mode !== "minimal" && <span className="truncate text-[0.875em] font-medium">{label}</span>}
      </button>
      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </>
  );
}
