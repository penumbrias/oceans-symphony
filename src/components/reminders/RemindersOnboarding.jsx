import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { toast } from "sonner";

const SUGGESTED = [
  {
    title: "Morning check-in",
    body: "Start the day with a quick emotional check-in.",
    category: "check_in",
    trigger_type: "scheduled",
    trigger_config: { times: ["09:00"], days: [0,1,2,3,4,5,6] },
    delivery_channels: ["in_app"],
    quiet_hours_respect: true,
    inline_actions: [{ label: "Check in now", action_type: "open_check_in", payload: {} }],
    is_active: true,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
    title: "Meds reminder",
    body: "Time to take your medication.",
    category: "meds",
    trigger_type: "scheduled",
    trigger_config: { times: ["08:00", "20:00"], days: [0,1,2,3,4,5,6] },
    delivery_channels: ["in_app"],
    quiet_hours_respect: true,
    inline_actions: [{ label: "Taken ✓", action_type: "dismiss", payload: {} }],
    is_active: true,
    snooze_options: [10, 60, "tomorrow"],
  },
  {
    title: "Grounding break",
    body: "Pause and ground yourself for a moment.",
    category: "grounding",
    trigger_type: "interval",
    trigger_config: { every_minutes: 240, active_window: { start: "09:00", end: "21:00" }, after_last: "fire" },
    delivery_channels: ["in_app"],
    quiet_hours_respect: true,
    inline_actions: [{ label: "Open grounding", action_type: "open_grounding", payload: {} }],
    is_active: true,
    snooze_options: [10, 60, 240],
  },
  {
    title: "Front update reminder",
    body: "It's been a while — who's fronting right now?",
    category: "check_in",
    trigger_type: "contextual",
    trigger_config: { on: "no_front_update", threshold_minutes: 180 },
    delivery_channels: ["in_app"],
    quiet_hours_respect: true,
    inline_actions: [],
    auto_resolve_rule: { on: "front_update" },
    is_active: true,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
    title: "Evening wind-down",
    body: "How did today go? A moment to reflect.",
    category: "habit",
    trigger_type: "scheduled",
    trigger_config: { times: ["21:00"], days: [0,1,2,3,4,5,6] },
    delivery_channels: ["in_app"],
    quiet_hours_respect: true,
    inline_actions: [{ label: "Journal", action_type: "open_route", payload: { path: "/journals" } }],
    is_active: true,
    snooze_options: [10, 60, "tomorrow"],
  },
];

export default function RemindersOnboarding({ onDone }) {
  const [enabled, setEnabled] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (i) => {
    setEnabled(prev => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  };

  const handleEnable = async () => {
    const toCreate = SUGGESTED.filter((_, i) => enabled.has(i));
    if (!toCreate.length) { toast.error("Select at least one reminder"); return; }
    setSaving(true);
    await base44.entities.Reminder.bulkCreate(toCreate);
    setSaving(false);
    toast.success(`${toCreate.length} reminder${toCreate.length > 1 ? "s" : ""} enabled!`);
    onDone?.();
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
        <p className="text-lg font-semibold text-foreground mb-1">Welcome to Reminders 🔔</p>
        <p className="text-sm text-muted-foreground">Select some starters to enable with one tap — you can customize or delete them anytime.</p>
      </div>

      <div className="space-y-3">
        {SUGGESTED.map((s, i) => {
          const Icon = CATEGORY_ICONS[s.category];
          return (
            <div key={i}
              onClick={() => toggle(i)}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                enabled.has(i) ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/40"
              }`}>
              <span className="text-2xl flex-shrink-0">{Icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                enabled.has(i) ? "bg-primary border-primary" : "border-border"
              }`}>
                {enabled.has(i) && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => onDone?.()}>Skip for now</Button>
        <Button className="flex-1" onClick={handleEnable} disabled={saving || enabled.size === 0}>
          {saving ? "Enabling…" : `Enable ${enabled.size > 0 ? enabled.size : ""} reminder${enabled.size !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}