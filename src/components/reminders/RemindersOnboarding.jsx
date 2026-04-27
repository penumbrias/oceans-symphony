import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { useTerms } from "@/lib/useTerms";
import { toast } from "sonner";
import ReminderEditorModal from "./ReminderEditorModal";

const SEEDS = [
  {
    title: "How's today been?",
    body: "A few minutes to reflect on the day.",
    category: "check_in",
    trigger_type: "scheduled",
    trigger_config: { times: ["20:00"], days: [0,1,2,3,4,5,6] },
    delivery_channels: ["in_app"],
    inline_actions: [
      { label: "Check in now", action_type: "open_check_in", payload: {} },
      { label: "Tomorrow", action_type: "dismiss", payload: {} },
    ],
    quiet_hours_respect: true,
    is_active: true,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
    title: "Good morning 🤍",
    body: "How are you landing into today?",
    category: "check_in",
    trigger_type: "contextual",
    trigger_config: { on: "sleep_ended", delay_minutes: 15 },
    delivery_channels: ["in_app"],
    inline_actions: [
      { label: "Check in", action_type: "open_check_in", payload: {} },
    ],
    quiet_hours_respect: true,
    is_active: true,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
    title: "Noticed something heavy",
    body: "Would a grounding exercise help?",
    category: "grounding",
    trigger_type: "contextual",
    trigger_config: { on: "emotion_logged", matches: ["anxious", "overwhelmed", "panic", "scared", "dissociated", "numb"], delay_minutes: 30 },
    delivery_channels: ["in_app"],
    inline_actions: [
      { label: "Try grounding", action_type: "open_grounding", payload: {} },
      { label: "I'm okay", action_type: "dismiss", payload: {} },
    ],
    quiet_hours_respect: true,
    is_active: true,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
     title: "SEED_CHECKIN_SYSTEM_TITLE",
     body: "SEED_CHECKIN_SYSTEM_BODY",
     category: "check_in",
     trigger_type: "contextual",
     trigger_config: { on: "no_front_update", threshold_minutes: 360 },
     delivery_channels: ["in_app"],
     inline_actions: [
       { label: "Update front", action_type: "open_set_front", payload: {} },
     ],
     quiet_hours_respect: true,
     is_active: true,
     snooze_options: [10, 60, 240, "tomorrow"],
   },
  {
    title: "Water break",
    body: "Have a sip, friend.",
    category: "habit",
    trigger_type: "interval",
    trigger_config: { every_minutes: 180, active_window: { start: "09:00", end: "21:00" } },
    delivery_channels: ["in_app"],
    inline_actions: [],
    quiet_hours_respect: true,
    is_active: false,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
    title: "Did that help?",
    body: "Quick check: how are you feeling now?",
    category: "meds",
    trigger_type: "contextual",
    trigger_config: { on: "symptom_logged", symptom_ids: [], delay_minutes: 30 },
    delivery_channels: ["in_app"],
    inline_actions: [
      { label: "Log symptom check-in", action_type: "open_symptom_check_in", payload: {} },
      { label: "All good", action_type: "dismiss", payload: {} },
    ],
    quiet_hours_respect: true,
    is_active: false,
    snooze_options: [10, 60, 240, "tomorrow"],
  },
  {
     title: "SEED_ALTER_GREETING_TITLE",
     body: "Anything you want to note for later?",
     category: "check_in",
     trigger_type: "contextual",
     trigger_config: { on: "alter_fronts", alter_id: "" },
     delivery_channels: ["in_app"],
     inline_actions: [
       { label: "Quick check-in", action_type: "open_check_in", payload: {} },
     ],
     quiet_hours_respect: true,
     is_active: false,
     snooze_options: [10, 60, 240, "tomorrow"],
   },
];

// Seeds that require setup before enabling (open editor pre-filled)
const NEEDS_SETUP = new Set([5, 6]);

const SEED_SUBTITLES_BASE = [
  "Daily at 8pm",
  "15 min after sleep ends",
  "30 min after distress emotion",
  "When {front} not updated for 6h",
  "Every 3h (off by default)",
  "30 min after symptom logged — pick which symptoms first",
  "When a specific {alter} takes {front} — pick {alter} first",
];

export default function RemindersOnboarding({ onDone }) {
  const terms = useTerms();
  const [enabled, setEnabled] = useState(new Set([0, 1, 2, 3]));
  const [saving, setSaving] = useState(false);
  const [setupSeed, setSetupSeed] = useState(null); // open editor for seeds needing setup

  // Build seeds with terminology interpolation
  const getSeedsWithTerms = () => {
    const interpolate = (str) =>
      str.replace("{system}", terms.system)
        .replace("{alter}", terms.alter)
        .replace("{alters}", terms.alters)
        .replace("{front}", terms.front)
        .replace("{fronting}", terms.fronting);

    return SEEDS.map((seed, i) => {
      let title = seed.title;
      let body = seed.body;

      if (seed.title === "SEED_CHECKIN_SYSTEM_TITLE") {
        title = `Checking in on the ${terms.system}`;
      }
      if (seed.body === "SEED_CHECKIN_SYSTEM_BODY") {
        body = `It's been a while since the ${terms.front} last updated. Who's here right now?`;
      }
      if (seed.title === "SEED_ALTER_GREETING_TITLE") {
        title = `Hi [{terms.alter} name] 🤍`;
      }

      return { ...seed, title, body };
    });
  };

  const seedsWithTerms = getSeedsWithTerms();

  const toggle = (i) => {
    setEnabled(prev => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  };

  const handleEnable = async () => {
    setSaving(true);
    // Only create seeds that DON'T need setup
    const toCreate = seedsWithTerms
      .map((seed, i) => ({ ...seed, is_active: enabled.has(i) ? seed.is_active !== false : false }))
      .filter((_, i) => enabled.has(i) && !NEEDS_SETUP.has(i));

    if (toCreate.length) {
      await base44.entities.Reminder.bulkCreate(toCreate);
    }
    setSaving(false);

    // For seeds needing setup that are enabled, open editor for first one
    const setupQueue = [...enabled].filter(i => NEEDS_SETUP.has(i));
    if (setupQueue.length) {
      setSetupSeed(seedsWithTerms[setupQueue[0]]);
      return;
    }

    if (toCreate.length) toast.success(`${toCreate.length} reminder${toCreate.length !== 1 ? "s" : ""} created!`);
    onDone?.();
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
        <p className="text-lg font-semibold text-foreground mb-1">Welcome to Reminders 🔔</p>
        <p className="text-sm text-muted-foreground">
          Here are some gentle starters. Toggle any you'd like — you can customize or delete them anytime from the Manage tab.
        </p>
      </div>

      <div className="space-y-2">
         {seedsWithTerms.map((seed, i) => {
           const Icon = CATEGORY_ICONS[seed.category];
           const on = enabled.has(i);
           const needsSetup = NEEDS_SETUP.has(i);
           const subtitle = SEED_SUBTITLES_BASE[i]
             .replace("{system}", terms.system)
             .replace("{alter}", terms.alter)
             .replace("{alters}", terms.alters)
             .replace("{front}", terms.front)
             .replace("{fronting}", terms.fronting);
           return (
             <button
               key={i}
               type="button"
               onClick={() => toggle(i)}
               className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                 on ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/30"
               }`}
             >
               <span className="text-2xl flex-shrink-0">{Icon}</span>
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2">
                   <p className="font-semibold text-sm text-foreground leading-tight">{seed.title}</p>
                   {needsSetup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">Setup required</span>}
                 </div>
                 <p className="text-xs text-muted-foreground mt-0.5">{seed.body}</p>
                 <p className="text-xs text-primary/70 mt-1">{subtitle}</p>
               </div>
               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                 on ? "bg-primary border-primary" : "border-muted-foreground/40"
               }`}>
                 {on && <div className="w-2 h-2 rounded-full bg-white" />}
               </div>
             </button>
           );
         })}
       </div>

      <div className="flex gap-3 pt-1">
        <Button variant="outline" className="flex-1" onClick={() => onDone?.()}>Skip for now</Button>
        <Button className="flex-1" onClick={handleEnable} disabled={saving}>
          {saving ? "Setting up…" : `Enable ${enabled.size} reminder${enabled.size !== 1 ? "s" : ""}`}
        </Button>
      </div>

      {/* Pre-filled editor for seeds that need setup */}
      {setupSeed && (
        <ReminderEditorModal
          isOpen={true}
          existing={setupSeed}
          onClose={() => { setSetupSeed(null); onDone?.(); }}
          onSaved={() => { setSetupSeed(null); toast.success("Reminder created!"); onDone?.(); }}
        />
      )}
    </div>
  );
}