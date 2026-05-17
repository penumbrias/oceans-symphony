import { useState, useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Bell, BellOff, X, Plus } from "lucide-react";
import { registerPush, unregisterPush, isPushEnabled, pushDiagnostics, showLocalTestNotification, pushDeepDiagnostic } from "@/lib/pushRegistration";
import { isNative } from "@/lib/platform";
import { formatSnoozeLabel, DEFAULT_SNOOZE_OPTIONS } from "@/components/reminders/snoozeHelpers";
import TimezoneSettings from "@/components/settings/TimezoneSettings";
import {
  UNRESOLVED_NAG_KEY,
  isUnresolvedNagEnabled,
} from "@/components/dashboard/UnresolvedPlansCard";
import {
  PLAN_REMINDER_OFFSETS,
  readPlanRemindersEnabled,
  writePlanRemindersEnabled,
  readPlanRemindersDefaultOffset,
  writePlanRemindersDefaultOffset,
} from "@/lib/planReminderScheduler";

const NATIVE_MODE = isNative();

export default function RemindersSettings() {
  const queryClient = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [paused, setPaused] = useState(false);
  const [defaultSnooze, setDefaultSnooze] = useState(DEFAULT_SNOOZE_OPTIONS);
  const [snoozeAddValue, setSnoozeAddValue] = useState("");
  const [snoozeAddUnit, setSnoozeAddUnit] = useState("minutes");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushDiag, setPushDiag] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  // Dashboard "unresolved plans" reminder card toggle. Stored in
  // localStorage rather than SystemSettings because the card itself
  // reads localStorage directly (no React Query round-trip on every
  // render). Default ON — see UnresolvedPlansCard.
  const [unresolvedNagOn, setUnresolvedNagOn] = useState(isUnresolvedNagEnabled);
  // Upcoming-plan reminders. Stored in localStorage (device-specific —
  // intentionally not in SystemSettings, like the unresolved nag
  // above). Writes dispatch a custom event so usePlanReminderSync
  // notices and re-reconciles immediately.
  const [planRemindersOn, setPlanRemindersOn] = useState(readPlanRemindersEnabled);
  const [planRemindersOffset, setPlanRemindersOffset] = useState(readPlanRemindersDefaultOffset);

  useEffect(() => {
    isPushEnabled().then(setPushEnabled).catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings) return;
    const qh = settings.quiet_hours || {};
    setQuietEnabled(!!qh.enabled);
    setQuietStart(qh.start || "22:00");
    setQuietEnd(qh.end || "08:00");
    setPaused(!!settings.reminders_paused);
    setDefaultSnooze(settings.default_snooze_options || DEFAULT_SNOOZE_OPTIONS);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    const data = {
      quiet_hours: { enabled: quietEnabled, start: quietStart, end: quietEnd },
      reminders_paused: paused,
      default_snooze_options: defaultSnooze,
    };
    if (settings?.id) {
      await base44.entities.SystemSettings.update(settings.id, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
    setSaved(true);
    toast.success("Reminder settings saved");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unregisterPush();
        setPushEnabled(false);
        toast.success("Push notifications disabled.");
      } else {
        await registerPush();
        setPushEnabled(true);
        toast.success("Push notifications enabled!");
      }
    } catch (err) {
      toast.error(err.message || "Could not toggle push notifications.");
    }
    setPushLoading(false);
  };

  return (
    <div className="space-y-5">
      {/* Timezone */}
      <TimezoneSettings />

      {/* Browser push */}
      <div className="p-3 bg-muted/20 rounded-xl border border-border/40 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              {pushEnabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div>
              <p className="font-semibold text-sm">Push notifications</p>
              <p className="text-xs text-muted-foreground">{pushEnabled ? "Enabled — reminders appear as native notifications even when the app is in the background" : "Disabled — reminders only show while the app is open"}</p>
            </div>
          </div>
          <Button size="sm" variant={pushEnabled ? "outline" : "default"} onClick={handleTogglePush} disabled={pushLoading || (!NATIVE_MODE && !import.meta.env.VITE_VAPID_PUBLIC_KEY)}>
            {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : pushEnabled ? "Disable" : "Enable"}
          </Button>
        </div>
        {!NATIVE_MODE && !import.meta.env.VITE_VAPID_PUBLIC_KEY && (
          <p className="text-xs text-amber-500 dark:text-amber-400 pl-12">
            Push not configured — add <code className="font-mono bg-muted px-1 rounded">VITE_VAPID_PUBLIC_KEY</code>, <code className="font-mono bg-muted px-1 rounded">VAPID_PUBLIC_KEY</code>, and <code className="font-mono bg-muted px-1 rounded">VAPID_PRIVATE_KEY</code> to your Vercel environment variables. Generate keys with: <code className="font-mono bg-muted px-1 rounded">npx web-push generate-vapid-keys</code>
          </p>
        )}
        {/* Diagnostic — surfaces the specific failing check so users can
            tell *why* their reminders aren't pushing, rather than just
            toggling Enable/Disable hoping it'll work. Sends a real test
            push if everything checks out. */}
        <div className="pl-12 pt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button
            type="button"
            disabled={diagLoading}
            onClick={async () => {
              setDiagLoading(true);
              try { setPushDiag(await pushDiagnostics()); }
              finally { setDiagLoading(false); }
            }}
            className="text-primary hover:underline disabled:opacity-50"
          >
            {diagLoading ? "Testing…" : "Test push notification"}
          </button>
          {/* Bypass test — calls showNotification directly from the running
              app. If "Test push" reports everything green but no notification
              appears, this isolates whether the issue is the push pipeline
              (push send → push provider → browser) or OS-side display
              (Chrome's notification channel disabled, Do Not Disturb,
              battery optimization, etc.). */}
          <button
            type="button"
            onClick={async () => {
              const r = await showLocalTestNotification();
              if (r.ok) toast.success(r.detail);
              else toast.error(r.detail);
            }}
            className="text-primary hover:underline"
          >
            Show local test notification
          </button>
          {/* Deep diagnostic — sends a real push tagged with a unique
              diagId, listens for the SW to echo it back via postMessage.
              Distinguishes "SW received push but OS didn't display" from
              "SW never woke up". Wraps in a 30s timeout. Web-Push only —
              hide on native, where there's no SW round-trip to test. */}
          {!NATIVE_MODE && (
            <button
              type="button"
              onClick={async () => {
                toast("Sending push + listening for SW receipt (up to 30s)…");
                const r = await pushDeepDiagnostic();
                if (r.result === "delivered") toast.success(r.detail);
                else toast.error(`${r.result.toUpperCase()}: ${r.detail}`, { duration: 12_000 });
              }}
              className="text-primary hover:underline"
            >
              Deep push test (30s)
            </button>
          )}
        </div>
        {pushDiag && (
          <ul className="pl-12 mt-2 space-y-1 text-xs">
            {pushDiag.map((c, i) => (
              <li key={i} className={c.ok ? "text-emerald-500" : "text-amber-500 dark:text-amber-400"}>
                <span className="font-mono mr-1">{c.ok ? "✓" : "✗"}</span>
                {c.label}
                {c.detail && <div className="pl-4 text-muted-foreground">{c.detail}</div>}
              </li>
            ))}
            <li className="text-muted-foreground pt-1 leading-relaxed">
              If the push test reports all green but nothing appears in your tray, try the
              "Show local test notification" button — it bypasses the push pipeline. If even
              that doesn't show, the issue is OS-side: check Chrome's per-site notification
              permission for this app, your phone's Do-Not-Disturb / Focus mode, and battery
              optimization for Chrome. TWA / app-store status shouldn't matter.
            </li>
          </ul>
        )}
      </div>

      {/* Pause all */}
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
        <div>
          <p className="font-semibold text-sm">Pause all reminders</p>
          <p className="text-xs text-muted-foreground">Temporarily silence every reminder</p>
        </div>
        <Switch checked={paused} onCheckedChange={v => { setPaused(v); toast(v ? "All reminders paused" : "Reminders resumed"); }} />
      </div>

      {/* Activity reminders — Dashboard nag for past-time plans that
          haven't been resolved yet. Stored in localStorage; the card
          listens for the custom event so it hides / reappears
          immediately. */}
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
        <div>
          <p className="font-semibold text-sm">Remind me about unresolved plans</p>
          <p className="text-xs text-muted-foreground">Show the "Plans needing review" card on the Dashboard when past-time plans are still scheduled.</p>
        </div>
        <Switch
          checked={unresolvedNagOn}
          onCheckedChange={(v) => {
            setUnresolvedNagOn(v);
            try { localStorage.setItem(UNRESOLVED_NAG_KEY, v ? "1" : "0"); } catch {}
            try { window.dispatchEvent(new Event("activity-unresolved-nag-changed")); } catch {}
            toast(v ? "Unresolved-plan reminder enabled" : "Unresolved-plan reminder disabled");
          }}
        />
      </div>

      {/* Upcoming-plan reminders — fires before a scheduled plan starts. */}
      <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Remind me before upcoming plans</p>
            <p className="text-xs text-muted-foreground">
              {NATIVE_MODE
                ? "Fires an OS notification a few minutes before each scheduled plan. Works even when the app is closed."
                : "Best-effort browser notification while the app is open. For reliable background alerts, install the native build."}
            </p>
          </div>
          <Switch
            checked={planRemindersOn}
            onCheckedChange={(v) => {
              setPlanRemindersOn(v);
              writePlanRemindersEnabled(v);
              toast(v ? "Plan reminders enabled" : "Plan reminders disabled");
            }}
          />
        </div>
        {planRemindersOn && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Default lead time (each plan can override):</p>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_REMINDER_OFFSETS.map((opt) => {
                const active = planRemindersOffset === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPlanRemindersOffset(opt.value);
                      writePlanRemindersDefaultOffset(opt.value);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quiet hours */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Quiet hours</p>
            <p className="text-xs text-muted-foreground">Reminders that respect quiet hours won't fire during this window</p>
          </div>
          <Switch checked={quietEnabled} onCheckedChange={setQuietEnabled} />
        </div>
        {quietEnabled && (
          <>
            <div className="flex items-center gap-3 pl-1">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)} className="h-8 text-sm w-32 mt-1" />
              </div>
              <span className="text-sm text-muted-foreground mt-4">to</span>
              <div>
                <Label className="text-xs text-muted-foreground">Until</Label>
                <Input type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)} className="h-8 text-sm w-32 mt-1" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pl-1">Quiet hours can cross midnight. A window of 10:00 PM → 8:00 AM covers overnight.</p>
          </>
        )}
      </div>

      {/* Default snooze options */}
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">Default snooze options</p>
          <p className="text-xs text-muted-foreground mt-0.5">Applied to new reminders. Each reminder can override these.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {defaultSnooze.map((opt, i) => (
            <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-xs">
              {formatSnoozeLabel(opt)}
              <button type="button" onClick={() => setDefaultSnooze(prev => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="number" min={1} value={snoozeAddValue} onChange={e => setSnoozeAddValue(e.target.value)}
            placeholder="Amount" className="h-7 text-xs w-20" />
          <select value={snoozeAddUnit} onChange={e => setSnoozeAddUnit(e.target.value)}
            className="h-7 text-xs border border-border/50 rounded-lg px-2 bg-background">
            <option value="minutes">min</option>
            <option value="hours">hours</option>
          </select>
          <button type="button" onClick={() => {
            const num = parseInt(snoozeAddValue);
            if (!num || num < 1) return;
            const mins = snoozeAddUnit === "hours" ? num * 60 : num;
            if (!defaultSnooze.includes(mins)) setDefaultSnooze(prev => [...prev, mins]);
            setSnoozeAddValue("");
          }} className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
          <button type="button" onClick={() => { if (!defaultSnooze.includes("tomorrow")) setDefaultSnooze(p => [...p, "tomorrow"]); }}
            disabled={defaultSnooze.includes("tomorrow")}
            className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40">
            + Tomorrow
          </button>
          <button type="button" onClick={() => { if (!defaultSnooze.includes("next_week")) setDefaultSnooze(p => [...p, "next_week"]); }}
            disabled={defaultSnooze.includes("next_week")}
            className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40">
            + Next week
          </button>
        </div>
      </div>

      <Button size="sm" onClick={save} disabled={saving || saved}
        className={saved ? "bg-green-600 hover:bg-green-600 text-white" : ""}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <Check className="w-4 h-4 mr-2" /> : null}
        {saved ? "Saved!" : "Save Reminder Settings"}
      </Button>
    </div>
  );
}