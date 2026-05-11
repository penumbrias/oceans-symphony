import { useState, useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Bell, BellOff, X, Plus } from "lucide-react";
import { registerPush, unregisterPush, isPushEnabled, pushDiagnostics, showLocalTestNotification } from "@/lib/pushRegistration";
import { formatSnoozeLabel, DEFAULT_SNOOZE_OPTIONS } from "@/components/reminders/snoozeHelpers";
import TimezoneSettings from "@/components/settings/TimezoneSettings";

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
          <Button size="sm" variant={pushEnabled ? "outline" : "default"} onClick={handleTogglePush} disabled={pushLoading || !import.meta.env.VITE_VAPID_PUBLIC_KEY}>
            {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : pushEnabled ? "Disable" : "Enable"}
          </Button>
        </div>
        {!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
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