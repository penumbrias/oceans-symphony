// Is anything stopping notifications on this device — and the one-tap fix
// for each (owner, 2026-10-01). Lives at the top of Settings →
// Notifications & reminders, on the Reminders page, and next to a
// reminder's delivery options. Re-checks when the app comes back to the
// front, so returning from the phone's settings updates it at once.
//
//   onlyWhenIssues  render nothing while everything's fine (Reminders page,
//                   reminder editor)
//   includeBattery  also flag battery optimisation — Settings only; most
//                   apps are optimised by default, so it isn't an alarm
//                   everywhere

import React, { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, AlarmClock, BatteryWarning, Check } from "lucide-react";
import {
  getNotificationHealth, allowNotifications, openNotificationSettings,
  openExactAlarmSettings, openBatterySettings, canOpenPhoneSettings,
} from "@/lib/notificationHealth";

const btn = "text-xs px-2.5 py-1 rounded-full border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50 flex-shrink-0";

export default function NotificationStatusCard({ onlyWhenIssues = false, includeBattery = false, className = "" }) {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => { getNotificationHealth().then(setHealth).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  if (!health || !health.supported) return null;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); refresh(); }
  };

  const issues = [];
  if (!health.allowed) {
    // A browser that has blocked them can't be asked again and can't be
    // opened from here — say where the switch is instead of a dead button.
    const stuck = !health.canAsk && !canOpenPhoneSettings();
    issues.push({
      key: "off", icon: BellOff, text: "Notifications are off",
      action: stuck ? null : health.canAsk ? "Allow" : "Open phone settings",
      onClick: () => run(allowNotifications),
      hint: stuck ? "Turn them on in this site's settings (the icon by the address bar)." : null,
    });
  } else if (health.channelMuted) {
    issues.push({ key: "muted", icon: BellOff, text: "Reminder notifications are muted", action: "Open phone settings", onClick: () => run(openNotificationSettings) });
  }
  if (health.exactAlarms === false) {
    issues.push({ key: "exact", icon: AlarmClock, text: "Reminders may arrive late", action: "Allow on-time reminders", onClick: () => run(openExactAlarmSettings) });
  }
  if (includeBattery && health.batteryUnrestricted === false) {
    issues.push({
      key: "battery", icon: BatteryWarning, text: "Battery saver can stop reminders while the app is closed",
      action: "Open battery settings", onClick: () => run(openBatterySettings),
      hint: "Battery → Unrestricted",
    });
  }

  if (!issues.length) {
    if (onlyWhenIssues) return null;
    return (
      <div className={`flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-sm ${className}`}>
        <BellRing className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <span className="flex-1">Notifications are on</span>
        <Check className="w-4 h-4 text-emerald-500" aria-hidden />
      </div>
    );
  }

  return (
    <div role="status" className={`rounded-xl border border-amber-500/40 bg-amber-500/5 divide-y divide-amber-500/20 ${className}`}>
      {issues.map(({ key, icon: Icon, text, action, onClick, hint }) => (
        <div key={key} className="flex items-center gap-2 px-3 py-2">
          <Icon className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{text}</p>
            {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
          </div>
          {action && <button type="button" disabled={busy} onClick={onClick} className={btn}>{action}</button>}
        </div>
      ))}
    </div>
  );
}
