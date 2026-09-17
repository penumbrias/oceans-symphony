// The Quick Check-In button row — extracted verbatim from Dashboard.jsx's
// inline `case "quick_checkin"` JSX (v0.90.0) so the classic dashboard,
// the experimental homescreen widget, and the experimental action bar all
// render the SAME buttons from one source. Purely presentational: every
// behaviour (the 500ms hold gesture for quick actions, the modal openers,
// executeQuickAction) stays in Dashboard.jsx and arrives via props, since
// the modals those handlers open are hosted there.
//
// v0.231.0: the row is fully configurable per widget — every button
// (Quick Check-In included) can be toggled, reordered, relabelled and
// re-iconed, and the row can show icon+label / icon only / label only.
// The catalogue below is the single source for both the render and the
// config sheet's per-button editor.
//
// Props:
//   hold        — { onPointerDown, onPointerMove, onPointerUp } for the
//                 Quick Check-In button's tap/hold gesture
//   holdProgress, holdActive — visual fill + ring while holding
//   buttons     — resolved config: [{ id, on, label, iconName }] in display
//                 order (resolveQuickButtons(settings)). When absent, the
//                 legacy `show` / `showCheckin` props drive visibility
//                 (the action bar's path).
//   display     — "both" (default) | "icon" | "label"
//   show        — { start_activity, start_symptom, quick_task, quick_plan }
//   on          — { startActivity, startSymptom, quickTask, quickPlan }
//   quickActionsSlot — rendered after the buttons (the AnimatePresence-
//                 wrapped QuickActionsMenu on classic; null elsewhere)
//   dense       — action-bar styling: tighter buttons, no margins

import React from "react";
import { Heart, Zap, Activity as ActivityIcon, CheckSquare, CalendarClock } from "lucide-react";
import LucideByName from "@/components/shared/LucideByName";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// An uploaded image as a button icon (asset-library local-image:// URLs
// must resolve through the shared hook).
function ImgIcon({ url, className }) {
  const src = useResolvedAvatarUrl(url);
  if (!src) return null;
  return <img src={src} alt="" className={`${className} rounded-[4px] object-cover`.trim()} />;
}

// One entry per button the row can hold. `onKey` names the handler in the
// `on` prop; `legacyKey` is the old per-widget toggle it grew out of.
export const QUICK_BUTTON_DEFS = [
  {
    id: "checkin", label: "Quick Check-In", icon: Heart, onKey: null, legacyKey: null,
    tour: "quick-checkin",
    cls: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  },
  {
    id: "start_activity", label: "Start Activity", icon: Zap, onKey: "startActivity", legacyKey: "startActivity",
    tour: "start-activity-button",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
  },
  {
    id: "start_symptom", label: "Start Symptom", icon: ActivityIcon, onKey: "startSymptom", legacyKey: "startSymptom",
    tour: "start-symptom-button",
    cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20",
  },
  {
    id: "quick_task", label: "Add to do", icon: CheckSquare, onKey: "quickTask", legacyKey: "quickTask",
    tour: "quick-task-button",
    cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20",
  },
  {
    id: "quick_plan", label: "Quick Plan", icon: CalendarClock, onKey: "quickPlan", legacyKey: "quickPlan",
    tour: "quick-plan-button",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
  },
];

// Widget settings → the ordered, per-button config the row renders.
// Understands both shapes: the new `settings.buttons` array and the old
// per-button toggles (startActivity etc.) a pre-v0.231 widget stored.
// Buttons missing from a stored array (added in later versions) append at
// the end, off. At least one button is always on — the row can't vanish.
export function resolveQuickButtons(settings = {}) {
  const stored = Array.isArray(settings.buttons) ? settings.buttons : null;
  let out;
  if (stored) {
    const seen = new Set();
    out = [];
    for (const b of stored) {
      const def = QUICK_BUTTON_DEFS.find((d) => d.id === b?.id);
      if (!def || seen.has(def.id)) continue;
      seen.add(def.id);
      out.push({ id: def.id, on: b.on !== false, label: b.label || "", iconName: b.iconName || "", iconUrl: b.iconUrl || "" });
    }
    for (const d of QUICK_BUTTON_DEFS) {
      if (!seen.has(d.id)) out.push({ id: d.id, on: false, label: "", iconName: "", iconUrl: "" });
    }
  } else {
    out = QUICK_BUTTON_DEFS.map((d) => ({
      id: d.id,
      on: d.legacyKey ? settings[d.legacyKey] === true : true,
      label: "",
      iconName: "",
      iconUrl: "",
    }));
  }
  if (!out.some((b) => b.on)) {
    const c = out.find((b) => b.id === "checkin") || out[0];
    if (c) c.on = true;
  }
  return out;
}

export default function QuickCheckinButtons({
  hold = {},
  holdProgress = 0,
  holdActive = false,
  buttons = null,
  display = "both",
  show = {},
  on = {},
  quickActionsSlot = null,
  dense = false,
  showCheckin = true,
}) {
  // Legacy path (the action bar): visibility flags in catalogue order.
  const resolved = buttons || QUICK_BUTTON_DEFS.map((d) => ({
    id: d.id,
    on: d.id === "checkin" ? showCheckin : show[d.id] === true,
    label: "",
    iconName: "",
  }));
  const iconOnly = display === "icon";
  const labelOnly = display === "label";
  const btnBase = dense
    ? "text-xs font-medium text-center rounded-lg inline-flex items-center gap-1.5 min-h-[38px] whitespace-nowrap flex-shrink-0 transition-colors"
    : "text-sm font-medium text-center rounded-lg inline-flex items-center gap-2 min-h-[44px] transition-colors";
  const pad = iconOnly ? (dense ? "px-2.5" : "px-3") : dense ? "px-3" : "px-4";

  const renderIcon = (def, b, extra = "") => {
    const cls = `w-4 h-4 ${extra}`.trim();
    if (b.iconUrl) return <ImgIcon url={b.iconUrl} className={cls} />;
    return b.iconName
      ? <LucideByName name={b.iconName} className={cls} fallback={<def.icon className={cls} />} />
      : <def.icon className={cls} />;
  };

  return (
    // dense (action bar): a single row, never wraps — the bar's container
    // scrolls horizontally if the buttons overflow.
    <div className={dense ? "relative flex flex-nowrap items-center gap-1.5 w-max" : "relative flex flex-wrap items-center gap-2 mt-3 mb-3"}>
      {resolved.filter((b) => b.on).map((b) => {
        const def = QUICK_BUTTON_DEFS.find((d) => d.id === b.id);
        if (!def) return null;
        const label = b.label || def.label;
        if (def.id === "checkin") {
          return (
            <button
              key={b.id}
              data-tour={def.tour}
              onPointerDown={hold.onPointerDown}
              onPointerMove={hold.onPointerMove}
              onPointerUp={hold.onPointerUp}
              onPointerLeave={hold.onPointerUp}
              onPointerCancel={hold.onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              style={{ userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation" }}
              aria-label={label}
              className={`${def.cls} ${iconOnly ? (dense ? "px-2.5" : "px-3") : dense ? "px-3.5" : "px-5"} ${dense ? "text-xs min-h-[38px] whitespace-nowrap flex-shrink-0" : "text-sm min-h-[44px]"} font-medium text-center rounded-lg inline-flex items-center gap-2 transition-colors relative overflow-hidden${holdActive ? " ring-2 ring-destructive/30" : ""}`}
            >
              {!labelOnly && renderIcon(def, b, "relative z-10")}
              {!iconOnly && <span className="relative z-10">{label}</span>}
              {holdProgress > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-destructive/20 pointer-events-none"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
            </button>
          );
        }
        return (
          <button
            key={b.id}
            data-tour={def.tour}
            onClick={on[def.onKey]}
            aria-label={label}
            className={`${def.cls} ${pad} ${btnBase}`}
          >
            {!labelOnly && renderIcon(def, b)}
            {!iconOnly && <span>{label}</span>}
          </button>
        );
      })}
      {quickActionsSlot}
    </div>
  );
}
