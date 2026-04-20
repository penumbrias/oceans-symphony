import { useState, useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Bell, BellOff, X, Plus } from "lucide-react";
import { registerPush, unregisterPush, isPushEnabled } from "@/lib/pushRegistration";
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
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {pushEnabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div>
            <p className="font-semibold text-sm">Browser push notifications</p>
            <p className="text-xs text-muted-foreground">{pushEnabled ? "Enabled — you'll get push alerts even when the app is closed" : "Disabled"}</p>
          </div>
        </div>
        <Button size="sm" variant={pushEnabled ? "outline" : "default"} onClick={handleTogglePush} disabled={pushLoading}>
          {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : pushEnabled ? "Disable" : "Enable"}
        </Button>
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