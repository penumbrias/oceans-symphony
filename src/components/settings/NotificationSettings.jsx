// Settings → Notifications & reminders, in parts (owner, 2026-10-01: "so
// much rambling … such a mess"). One short line per control; anything a
// person must DO on their phone is a button on NotificationStatusCard,
// never a paragraph of steps.
//
//   PersistentNotificationsSection  status-bar notifications (Android)
//   PopupMessagesSection            the in-app pop-up messages (toasts)
//   ServerDeliverySection           reminders through the server (opt-in)
//   NotificationTests               push / scheduled-alert diagnostics

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, HeartPulse, Timer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { readNotificationPrefs } from "@/lib/notificationPrefs";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { getAllPersistNotifPrefs, setPersistNotifPref } from "@/lib/persistentNotifPrefs";
import { getLocalIdentity } from "@/lib/friendsApi";
import {
  cloudReminderDeliveryEnabled,
  enableCloudReminderDelivery,
  disableCloudReminderDelivery,
} from "@/lib/serverReminderSync";
import {
  registerPush, unregisterPush, isPushEnabled, pushDiagnostics,
  showLocalTestNotification, pushDeepDiagnostic,
} from "@/lib/pushRegistration";
import { scheduledAlertsDiagnostics } from "@/lib/planReminderScheduler";

const NATIVE = isNative();

function useSettingsRow() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  return list?.[0] || null;
}

// One row: label (+ optional one-line note) and a switch.
function Row({ icon: Icon, iconClass = "", label, note, checked, onChange, disabled = false, busy = false }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2">
      {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {note && <p className="text-xs text-muted-foreground leading-snug">{note}</p>}
      </div>
      {busy
        ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
        : <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={`${label}: ${checked ? "on" : "off"}`} />}
    </div>
  );
}

// ── Status bar (Android ongoing notifications) ──────────────────────
// Device-local toggles (persistentNotifPrefs); usePersistentNotifications
// in AppLayout does the scheduling. Also embedded by the setup guide.
export function PersistentNotificationsSection() {
  const t = useTerms();
  const [prefs, setPrefs] = useState(() => getAllPersistNotifPrefs());
  const toggle = (key, val) => {
    setPersistNotifPref(key, val);
    setPrefs((p) => ({ ...p, [key]: val }));
  };
  const rows = [
    { key: "fronters", icon: Users, iconClass: "text-violet-500", label: `Who's ${t.fronting}` },
    { key: "symptoms", icon: HeartPulse, iconClass: "text-rose-500", label: "Active symptoms" },
    { key: "activity", icon: Timer, iconClass: "text-sky-500", label: "Running activity", note: "With an End button" },
  ];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Kept in your phone's status bar while something's going on.</p>
      {rows.map((r) => (
        <Row key={r.key} icon={r.icon} iconClass={r.iconClass} label={r.label} note={r.note}
          checked={!!prefs[r.key]} onChange={(v) => toggle(r.key, v)} />
      ))}
    </div>
  );
}

// ── Pop-up messages (toasts) ────────────────────────────────────────
const DURATIONS = [
  { value: 2000, label: "2s" }, { value: 4000, label: "4s" },
  { value: 6000, label: "6s" }, { value: 10000, label: "10s" },
];
const POSITIONS = [
  { value: "top-left", label: "Top left" }, { value: "top-center", label: "Top" }, { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" }, { value: "bottom-center", label: "Bottom" }, { value: "bottom-right", label: "Bottom right" },
];
const chip = (on) => `text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`;

export function PopupMessagesSection() {
  const qc = useQueryClient();
  const settings = useSettingsRow();
  const prefs = readNotificationPrefs(settings);
  const save = async (patch) => {
    const next = { ...prefs, ...patch };
    try {
      if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { notification_prefs: next });
      else await base44.entities.SystemSettings.create({ notification_prefs: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) { toast.error(e?.message || "Couldn't save that"); }
  };
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Row label="Confirmations" note={'"Saved", "Plan updated"…'} checked={!!prefs.showSuccess} onChange={(v) => save({ showSuccess: v })} />
        <Row label="Info" checked={!!prefs.showInfo} onChange={(v) => save({ showInfo: v })} />
        <Row label="Warnings" checked={!!prefs.showWarning} onChange={(v) => save({ showWarning: v })} />
        <Row label="Errors" note="Always shown" checked disabled onChange={() => {}} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-16">Stay for</span>
        {DURATIONS.map((d) => (
          <button key={d.value} type="button" aria-pressed={prefs.durationMs === d.value}
            onClick={() => save({ durationMs: d.value })} className={chip(prefs.durationMs === d.value)}>{d.label}</button>
        ))}
      </div>
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground w-16 pt-1">Show at</span>
        <div className="grid grid-cols-3 gap-1.5 flex-1">
          {POSITIONS.map((p) => (
            <button key={p.value} type="button" aria-pressed={prefs.position === p.value}
              onClick={() => save({ position: p.value })} className={chip(prefs.position === p.value)}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground w-16">Try it</span>
        <button type="button" onClick={() => toast.success("Saved")} className={chip(false)}>Confirmation</button>
        <button type="button" onClick={() => toast.warning?.("Heads up")} className={chip(false)}>Warning</button>
        <button type="button" onClick={() => toast.error("Something went wrong")} className={chip(false)}>Error</button>
      </div>
    </div>
  );
}

// ── Reminders through the server (opt-in) ───────────────────────────
// On-device alarms can't survive a force-stop; the relay can hold the time
// and push it. That sends reminder times (and, only if chosen, wording) to
// the server, so it's strictly opt-in — off means nothing leaves the device.
export function ServerDeliverySection() {
  const qc = useQueryClient();
  const settings = useSettingsRow();
  const { data: identity } = useQuery({ queryKey: ["friendIdentity"], queryFn: getLocalIdentity });
  const [busy, setBusy] = useState(false);
  const on = cloudReminderDeliveryEnabled(settings, identity || null);
  const includeText = settings?.reminder_push_include_text === true;

  const write = async (patch) => {
    if (settings?.id) await base44.entities.SystemSettings.update(settings.id, patch);
    else await base44.entities.SystemSettings.create(patch);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  const toggle = async (v) => {
    setBusy(true);
    try {
      await write({ reminders_cloud_delivery: v });
      qc.invalidateQueries({ queryKey: ["friendIdentity"] });
      if (v) {
        const ok = await enableCloudReminderDelivery();
        if (ok) toast.success("Reminders will reach you even if the app is force-stopped");
        else toast.info("Turned on — allow notifications to finish setting it up");
      } else {
        await disableCloudReminderDelivery();
        toast.success("Reminders now fire from this device only");
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't change reminder delivery");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Row label="Deliver reminders through the server"
        note={on ? "Reminder times are sent to the relay so they arrive after a force-stop." : "Off — nothing about your reminders leaves this device."}
        checked={on} onChange={toggle} busy={busy} />
      {on && (
        <Row label="Include the reminder's wording"
          note={includeText ? 'Notifications show what the reminder says.' : 'The server only sends "You have a reminder".'}
          checked={includeText}
          onChange={async (v) => { try { await write({ reminder_push_include_text: v }); } catch (e) { toast.error(e?.message || "Couldn't save that"); } }} />
      )}
    </div>
  );
}

// ── Tests & diagnostics ─────────────────────────────────────────────
// What used to sit on the Reminders card: push subscription (web) and the
// tests that say WHICH link is broken when a reminder doesn't arrive.
export function NotificationTests() {
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState(null);
  const vapidMissing = !NATIVE && !import.meta.env.VITE_VAPID_PUBLIC_KEY;
  useEffect(() => { isPushEnabled().then(setPushOn).catch(() => {}); }, []);

  const togglePush = async (v) => {
    setBusy(true);
    try {
      if (v) { await registerPush(); setPushOn(true); }
      else { await unregisterPush(); setPushOn(false); }
    } catch (e) { toast.error(e?.message || "Couldn't change push"); }
    setBusy(false);
  };
  const runDiag = async (fn) => { setBusy(true); try { setDiag(await fn()); } finally { setBusy(false); } };
  const link = "text-xs text-primary hover:underline disabled:opacity-50";

  return (
    <div className="space-y-2">
      {!NATIVE && !vapidMissing && (
        <Row label="Push notifications in this browser" note="Needed for reminders while the tab is closed."
          checked={pushOn} onChange={togglePush} busy={busy} />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" disabled={busy} onClick={() => runDiag(pushDiagnostics)} className={link}>Test push</button>
        <button type="button" disabled={busy} onClick={() => runDiag(scheduledAlertsDiagnostics)} className={link}>Check scheduled alerts</button>
        <button type="button" onClick={async () => {
          const r = await showLocalTestNotification();
          if (r.ok) toast.success(r.detail); else toast.error(r.detail);
        }} className={link}>Show a test notification</button>
        {!NATIVE && !vapidMissing && (
          <button type="button" onClick={async () => {
            toast.info("Sending a test push (up to 30s)…");
            const r = await pushDeepDiagnostic();
            if (r.result === "delivered") toast.success(r.detail);
            else toast.error(`${r.result.toUpperCase()}: ${r.detail}`, { duration: 12_000 });
          }} className={link}>Deep push test</button>
        )}
      </div>
      {diag && (
        <ul className="space-y-1 text-xs">
          {diag.map((c, i) => (
            <li key={i} className={c.ok ? "text-emerald-500" : "text-amber-500"}>
              <span className="font-mono mr-1">{c.ok ? "✓" : "✗"}</span>{c.label}
              {c.detail && <div className="pl-4 text-muted-foreground">{c.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PopupMessagesSection;
