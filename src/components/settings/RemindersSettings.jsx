import { useState, useEffect } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { readActiveEndReminderEnabled, writeActiveEndReminderEnabled } from "@/lib/activitySession";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2, X, Plus } from "lucide-react";
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
  // Dashboard "unresolved plans" reminder card toggle. Stored in
  // localStorage rather than SystemSettings because the card itself
  // reads localStorage directly (no React Query round-trip on every
  // render). Default ON — see UnresolvedPlansCard.
  const [unresolvedNagOn, setUnresolvedNagOn] = useState(isUnresolvedNagEnabled);
  const [endCheckinOn, setEndCheckinOn] = useState(() => readActiveEndReminderEnabled());
  // Upcoming-plan reminders. Stored in localStorage (device-specific —
  // intentionally not in SystemSettings, like the unresolved nag
  // above). Writes dispatch a custom event so usePlanReminderSync
  // notices and re-reconciles immediately.
  const [planRemindersOn, setPlanRemindersOn] = useState(readPlanRemindersEnabled);
  const [planRemindersOffset, setPlanRemindersOffset] = useState(readPlanRemindersDefaultOffset);

  useEffect(() => {
    if (!settings) return;
    const qh = settings.quiet_hours || {};
    setQuietEnabled(!!qh.enabled);
    setQuietStart(qh.start || "22:00");
    setQuietEnd(qh.end || "08:00");
    setPaused(!!settings.reminders_paused);
    setDefaultSnooze(settings.default_snooze_options || DEFAULT_SNOOZE_OPTIONS);
    // Keyed on id, not the object — see DiaryCardPresetsManager; a query
    // invalidation mid-edit used to reset the whole quiet-hours form.
  }, [settings?.id]);  

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

  return (
    <div className="space-y-5">
      {/* Timezone */}
      <TimezoneSettings />

      {/* Pause all */}
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
        <div>
          <p className="font-semibold text-sm">Pause all reminders</p>
          <p className="text-xs text-muted-foreground">Silence every reminder for now</p>
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
          <p className="text-xs text-muted-foreground">A home-screen notice for plans whose time has passed</p>
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

      {/* End-of-plan check-in — a started plan that runs past its
          scheduled end asks to be wrapped up (it keeps running either
          way; the planner keeps drawing it to the now line). */}
      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
        <div>
          <p className="font-semibold text-sm">Check in when a started plan runs long</p>
          <p className="text-xs text-muted-foreground">Ask to end or extend it once its time is up</p>
        </div>
        <Switch
          checked={endCheckinOn}
          onCheckedChange={(v) => {
            setEndCheckinOn(v);
            writeActiveEndReminderEnabled(v);
            toast(v ? "End-of-plan check-in enabled" : "End-of-plan check-in disabled");
          }}
        />
      </div>

      {/* Upcoming-plan reminders — fires before a scheduled plan starts. */}
      <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Remind me before upcoming plans</p>
            <p className="text-xs text-muted-foreground">
              {NATIVE_MODE ? "A notification shortly before each plan starts" : "A notification shortly before each plan starts (while the app is open)"}
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
            <p className="text-xs text-muted-foreground">Reminders set to respect it stay silent in this window</p>
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
          </>
        )}
      </div>

      {/* Default snooze options */}
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">Default snooze options</p>
          <p className="text-xs text-muted-foreground mt-0.5">For new reminders — each can change its own</p>
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