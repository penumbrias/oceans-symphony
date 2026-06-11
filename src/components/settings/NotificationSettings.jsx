import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Info, AlertTriangle, XCircle, Users, HeartPulse, Timer, Pin } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { readNotificationPrefs } from "@/lib/notificationPrefs";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { SubSection } from "@/components/settings/SettingsUI";
import { getAllPersistNotifPrefs, setPersistNotifPref } from "@/lib/persistentNotifPrefs";

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
        Note: on newer Android you can still swipe these away — they'll reappear next time you open the app. (Truly un-swipeable notifications need a foreground service, which is on the roadmap.)
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
