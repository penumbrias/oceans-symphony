import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Info, AlertTriangle, XCircle, Users, HeartPulse, Timer, Pin, Cloud, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { readNotificationPrefs } from "@/lib/notificationPrefs";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { SubSection } from "@/components/settings/SettingsUI";
import { getAllPersistNotifPrefs, setPersistNotifPref } from "@/lib/persistentNotifPrefs";
import { getLocalIdentity } from "@/lib/friendsApi";
import {
  cloudReminderDeliveryEnabled,
  enableCloudReminderDelivery,
  disableCloudReminderDelivery,
} from "@/lib/serverReminderSync";

// Opt-in cloud-backed reminder delivery. On-device OS alarms can't survive a
// force-stop (Samsung et al. cancel them); the relay can, by holding the clock
// and pushing via FCM / Web Push. But that means sending reminder times to the
// server, so it's strictly opt-in: OFF by default → the app contacts no server
// and reminders stay fully local. Visible on all platforms (web can't fire
// closed-tab reminders at all without it).
function CloudReminderDeliverySection() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0] || null;
  const { data: identity } = useQuery({ queryKey: ["friendIdentity"], queryFn: getLocalIdentity });
  const [busy, setBusy] = useState(false);

  const on = cloudReminderDeliveryEnabled(settings, !!identity);

  const toggle = async (v) => {
    setBusy(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { reminders_cloud_delivery: v });
      } else {
        await base44.entities.SystemSettings.create({ reminders_cloud_delivery: v });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      qc.invalidateQueries({ queryKey: ["friendIdentity"] });
      if (v) {
        const ok = await enableCloudReminderDelivery();
        if (ok) {
          toast.success("Cloud-backed reminders are on — they'll reach you even if the app is force-stopped.");
        } else {
          toast.info("Turned on, but push delivery isn't confirmed yet. Make sure notifications are allowed, then send a test from the reminder settings.");
        }
      } else {
        await disableCloudReminderDelivery();
        toast.success("Off — reminders are delivered fully on-device and nothing is sent to the server.");
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't change reminder delivery");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubSection title="Reliable reminders (force-stop-proof)" icon={Cloud} defaultOpen={false}>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Reminders are always handed to your device first, which works fully offline. But if your phone <strong className="text-foreground">force-stops</strong> the app (swiped away, or aggressive battery saving), those on-device alarms can be cancelled and the reminder never fires.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Turning this on lets a small relay hold your reminder times and <strong className="text-foreground">push them to you even when the app is fully closed</strong>{isNative() ? "" : " — the only way the web app can remind you with the tab closed"}. It's the durable path several testers were missing.
      </p>
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
        <Cloud className="w-4 h-4 mt-0.5 flex-shrink-0 text-sky-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Cloud-backed delivery</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            When on, your <strong className="text-foreground">reminder times</strong> (and their text, unless you turn that off below the reminders list) are sent to the relay so a push can reach you after a force-stop. When off, the app <strong className="text-foreground">contacts no server</strong> and reminders stay entirely on your device.
          </p>
        </div>
        {busy ? (
          <Loader2 className="w-4 h-4 mt-1 animate-spin text-muted-foreground flex-shrink-0" />
        ) : (
          <Switch checked={on} onCheckedChange={toggle} aria-label={`Cloud-backed reminder delivery: ${on ? "on" : "off"}`} />
        )}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/15 p-2.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
        <p className="text-[0.7rem] text-muted-foreground leading-relaxed">
          This is independent of the Friends feature — turning it on doesn't add you to anyone's friends or share anything but your reminders. The app stays fully local-first; this is the one optional piece that needs the relay.
        </p>
      </div>
    </SubSection>
  );
}

// User-facing settings for the in-app toast surface. Persists to
// SystemSettings.notification_prefs which Sonner's Toaster wrapper
// reads on every render.

const DURATIONS = [
  { value: 2000,  label: "2 seconds",  hint: "Quick — flashes by." },
  { value: 4000,  label: "4 seconds",  hint: "Default." },
  { value: 6000,  label: "6 seconds",  hint: "Lingering. Easier to read." },
  { value: 10000, label: "10 seconds", hint: "Sticks around." },
];

const POSITIONS = [
  { value: "top-center",    label: "Top center" },
  { value: "top-right",     label: "Top right" },
  { value: "top-left",      label: "Top left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right",  label: "Bottom right" },
  { value: "bottom-left",   label: "Bottom left" },
];

const TYPE_ROWS = [
  {
    key: "showSuccess",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    label: "Success messages",
    description: "Green confirmation toasts — \"Saved!\", \"Plan updated!\", \"Bulletin posted!\", etc.",
  },
  {
    key: "showInfo",
    icon: Info,
    iconClass: "text-sky-500",
    label: "Info messages",
    description: "Neutral notices, like background sync results or non-critical hints.",
  },
  {
    key: "showWarning",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    label: "Warnings",
    description: "Yellow heads-up notices about partial saves, things needing review, etc.",
  },
  {
    key: "showError",
    icon: XCircle,
    iconClass: "text-destructive",
    label: "Errors",
    description: "Errors stay on — if something fails, the app needs to tell you.",
    locked: true,
  },
];

// Android-only ongoing ("persistent") notifications that sit in the tray and
// update live while the app runs. Toggles are device-local (localStorage via
// persistentNotifPrefs); the usePersistentNotifications hook in AppLayout does
// the actual scheduling.
function PersistentNotificationsSection() {
  const t = useTerms();
  const [prefs, setPrefs] = useState(() => getAllPersistNotifPrefs());

  const rows = [
    {
      key: "fronters",
      icon: Users,
      iconClass: "text-violet-500",
      label: `Current ${t.fronters}`,
      description: `An always-on notification showing who's ${t.fronting} right now — updates the moment a ${t.switch} happens.`,
    },
    {
      key: "symptoms",
      icon: HeartPulse,
      iconClass: "text-rose-500",
      label: "Active symptoms",
      description: "An always-on notification listing the symptoms you've marked as currently active.",
    },
    {
      key: "activity",
      icon: Timer,
      iconClass: "text-sky-500",
      label: "Activity timer",
      description: "An always-on notification for a running activity, so you can end and log it without digging through the app.",
    },
  ];

  const toggle = (key, val) => {
    setPersistNotifPref(key, val);
    setPrefs((p) => ({ ...p, [key]: val }));
  };

  return (
    <SubSection title="Persistent status notifications" icon={Pin} defaultOpen={false}>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Silent notifications that <strong className="text-foreground">stay in your tray</strong> and refresh as things change — an at-a-glance view without opening the app. They only appear when there's something active (someone {t.fronting}, a symptom or habit running, an activity timer going), and the activity/symptom ones include an <strong className="text-foreground">End</strong> button so you can stop & log straight from the tray. Requires notifications to be allowed (see above).
      </p>
      <p className="text-[0.7rem] text-muted-foreground/80 leading-relaxed">
        Note: on newer Android you can still swipe these away — they'll reappear next time you open the app.
      </p>
      <div className="space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          const checked = !!prefs[row.key];
          return (
            <div key={row.key} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${row.iconClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{row.description}</p>
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(v) => toggle(row.key, v)}
                aria-label={`${row.label}: ${checked ? "on" : "off"}`}
              />
            </div>
          );
        })}
      </div>
    </SubSection>
  );
}

export default function NotificationSettings() {
  const qc = useQueryClient();
  const t = useTerms();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0];
  const prefs = readNotificationPrefs(settings);

  const save = async (patch) => {
    const next = { ...prefs, ...patch };
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { notification_prefs: next });
      } else {
        await base44.entities.SystemSettings.create({ notification_prefs: next });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save notification prefs");
    }
  };

  return (
    <div className="space-y-5">
      <CloudReminderDeliverySection />
      {isNative() && (
        <SubSection title="Notifications when the app is closed" icon={Info} defaultOpen={false}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Timed reminders you set are handed to Android and <strong className="text-foreground">do fire even when the app is closed</strong>.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Alerts for a friend changing who's {t.fronting} now use <strong className="text-foreground">push notifications</strong>: once you've turned on a friend's bell and allowed notifications, your phone is alerted <strong className="text-foreground">within seconds — even if the app is fully closed</strong>.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If push isn't available (notifications not allowed, or an older build), the app falls back to a background check <strong className="text-foreground">roughly every 15 minutes</strong>, which may not run at all if the app was <strong className="text-foreground">swiped away</strong> (force-stopped) or your phone is being aggressive about battery saving.
          </p>
          <div className="rounded-lg border border-border/40 bg-muted/15 p-2.5 space-y-1">
            <p className="text-xs font-medium text-foreground">To keep notifications reliable:</p>
            <ol className="text-xs text-muted-foreground leading-relaxed list-decimal pl-4 space-y-0.5">
              <li>Open Android <strong className="text-foreground">Settings → Apps → Oceans Symphony</strong>.</li>
              <li>Tap <strong className="text-foreground">Notifications</strong> and make sure they're <strong className="text-foreground">allowed</strong>.</li>
              <li>Tap <strong className="text-foreground">Battery</strong> and choose <strong className="text-foreground">Unrestricted</strong> (or turn off battery optimization for the app).</li>
            </ol>
          </div>
        </SubSection>
      )}
      {isNative() && <PersistentNotificationsSection />}
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Bell className="w-4 h-4" />
          In-app notifications
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          The small banners that pop up at the edge of the screen to confirm an action or report a problem. Errors always show; the rest you can turn on or off.
        </p>
      </div>

      <div className="space-y-2">
        {TYPE_ROWS.map((row) => {
          const Icon = row.icon;
          const checked = row.locked ? true : !!prefs[row.key];
          return (
            <div
              key={row.key}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
            >
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${row.iconClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{row.description}</p>
              </div>
              <Switch
                checked={checked}
                disabled={!!row.locked}
                onCheckedChange={(v) => save({ [row.key]: v })}
                aria-label={`${row.label}: ${checked ? "on" : "off"}`}
              />
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">How long they stick around</p>
        <div className="grid gap-1.5">
          {DURATIONS.map((opt) => {
            const isCurrent = prefs.durationMs === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => save({ durationMs: opt.value })}
                className={`text-left rounded-xl border px-3 py-2 transition-all ${
                  isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                  {isCurrent && <span className="text-[0.625rem] uppercase tracking-wider text-primary">Selected</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Where they appear</p>
        <div className="grid grid-cols-2 gap-1.5">
          {POSITIONS.map((opt) => {
            const isCurrent = prefs.position === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => save({ position: opt.value })}
                className={`text-center rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  isCurrent
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 bg-card text-foreground hover:bg-muted/30"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground mb-2">Test it:</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => toast.success("Success preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
          >Success</button>
          <button
            type="button"
            onClick={() => toast.info?.("Info preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-sky-500/40 text-sky-500 hover:bg-sky-500/10"
          >Info</button>
          <button
            type="button"
            onClick={() => toast.warning?.("Warning preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
          >Warning</button>
          <button
            type="button"
            onClick={() => toast.error("Error preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10"
          >Error</button>
        </div>
      </div>
    </div>
  );
}
