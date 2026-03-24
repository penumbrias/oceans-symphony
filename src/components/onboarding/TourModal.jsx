import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, X, Users, Bell, BookOpen, BarChart2, CheckSquare, Moon, Activity, Heart, MessageSquare, Map } from "lucide-react";

const SIMPLE_STEPS = [
  {
    icon: Users,
    color: "#8b5cf6",
    title: "Welcome to Innerworld 💜",
    body: "This is your system's private hub — a place to track fronting, communicate between alters, log activities, and reflect on your inner world. Let's take a quick look at what's here.",
  },
  {
    icon: Users,
    color: "#8b5cf6",
    title: "Alters & Fronting",
    body: "Add all your system members under the Alters section. Tap 'Set Front' on the dashboard to log who's currently fronting. The system tracks front history automatically.",
  },
  {
    icon: MessageSquare,
    color: "#a855f7",
    title: "Bulletin Board",
    body: "Use the Bulletin Board to leave notes for the whole system. You can @mention specific alters, pin important posts, add polls, and react with emojis. Alters get notified when they're mentioned.",
  },
  {
    icon: Bell,
    color: "#ec4899",
    title: "Notifications",
    body: "The bell icon in the top right shows your notification history. When a fronting alter is mentioned anywhere in the app, a pop-up appears so nothing gets missed.",
  },
  {
    icon: Heart,
    color: "#f43f5e",
    title: "Check-Ins & Diary Cards",
    body: "Use Quick Check-In for a fast emotion snapshot. Diary Cards give you a fuller DBT-style daily log including urges, skills practiced, and more.",
  },
  {
    icon: Activity,
    color: "#10b981",
    title: "Activities & Journals",
    body: "Log activities with categories, duration, and emotions. Write journal entries with privacy controls — limit visibility to specific alters or groups.",
  },
  {
    icon: BarChart2,
    color: "#3b82f6",
    title: "Analytics",
    body: "Explore the Analytics section to see fronting patterns, activity trends, co-fronting data, and more — all visualized over time.",
  },
  {
    icon: CheckSquare,
    color: "#f59e0b",
    title: "You're all set!",
    body: "That's the quick tour! Head to Settings to sync with Simply Plural, manage custom fields, and personalize your experience. The in-depth tour covers each feature in detail.",
  },
];

const DEEP_STEPS = [
  {
    icon: Users,
    color: "#8b5cf6",
    title: "Setting Up Your System",
    body: "Go to Settings → Simply Plural to sync your existing alters automatically, or add them manually. Each alter can have a name, alias (for @mentions), pronouns, color, avatar, role, and custom fields. Groups let you organize alters by subsystem or function.",
  },
  {
    icon: Users,
    color: "#7c3aed",
    title: "Fronting Sessions",
    body: "Tap 'Set Front' on the dashboard to record who is fronting. You can designate a primary fronter and co-fronters. Add a status note to communicate context to the rest of the system. The History tab on any alter profile shows their full front history.",
  },
  {
    icon: MessageSquare,
    color: "#a855f7",
    title: "Bulletin Board — In Depth",
    body: "Posts support rich @mention tagging (type @ to see a list). You can attach polls so the system can vote, or create to-do checklists inside a bulletin. Pin critical posts so they always appear at the top. Anyone can react with emoji or leave threaded comments.",
  },
  {
    icon: Bell,
    color: "#ec4899",
    title: "Mentions & Notifications",
    body: "@Mentions work in bulletins, journal entries, task descriptions, alter messages, activity notes, diary card notes, and check-in notes. When a fronting alter is mentioned, a pop-up notification appears. All mentions are stored in the notification history and on each alter's Board tab.",
  },
  {
    icon: Heart,
    color: "#f43f5e",
    title: "Emotion Check-Ins",
    body: "Quick Check-In lets you log current emotions, note which alters are present, and add a brief note or activity. Notes over 500 words auto-save as a journal entry. The Emotion Analytics section shows patterns over time.",
  },
  {
    icon: BookOpen,
    color: "#0ea5e9",
    title: "Journal",
    body: "Journal entries support Markdown formatting. Set visibility per entry — restrict to specific alters or groups for private entries. Entries can be linked to a fronting session. Optional encryption adds a password layer for sensitive entries.",
  },
  {
    icon: CheckSquare,
    color: "#f59e0b",
    title: "Diary Cards",
    body: "Diary Cards follow a DBT format: emotions, urge ratings, body/mind scores, skills practiced, and medication safety. Add custom symptoms and habits in Settings → Diary Card Presets. The analytics tab shows trends across all your entries.",
  },
  {
    icon: Activity,
    color: "#10b981",
    title: "Activity Tracker",
    body: "Build a custom category tree for your activities. Log duration, emotions, notes, and which alters were fronting. Set activity goals and track progress. The Timeline view gives a visual hour-by-hour picture of your day.",
  },
  {
    icon: Moon,
    color: "#6366f1",
    title: "Sleep Tracker",
    body: "Log bedtime and wake time with a quality rating. Sleep data appears in the Timeline and contributes to your overall activity analytics picture.",
  },
  {
    icon: BarChart2,
    color: "#3b82f6",
    title: "Analytics Suite",
    body: "Explore: Fronting history charts, co-fronting patterns, activity frequency heatmaps, time-of-day trends, alter activity deep dives, and diary card analytics. Use the date range picker to zoom into any time window.",
  },
  {
    icon: Map,
    color: "#8b5cf6",
    title: "System Map",
    body: "The System Map provides a visual overview of all your alters and their group memberships — a bird's eye view of your system structure.",
  },
  {
    icon: CheckSquare,
    color: "#22c55e",
    title: "Ready to Explore!",
    body: "You now know everything Innerworld has to offer. Remember: this is your safe space. Customize it to fit your system's needs, and use only what feels helpful. 💜",
  },
];

export default function TourModal({ open, onClose }) {
  const [mode, setMode] = useState(null); // null | "simple" | "deep"
  const [step, setStep] = useState(0);

  const steps = mode === "simple" ? SIMPLE_STEPS : DEEP_STEPS;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleClose = () => {
    setMode(null);
    setStep(0);
    onClose();
  };

  const Icon = current?.icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {!mode ? (
          // Landing screen
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <span className="text-3xl">💜</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Welcome to Innerworld</h2>
              <p className="text-sm text-muted-foreground">Choose how you'd like to get started:</p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { setMode("simple"); setStep(0); }}
                className="w-full rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 p-4 text-left transition-colors"
              >
                <p className="font-semibold text-sm text-foreground">⚡ Quick Tour</p>
                <p className="text-xs text-muted-foreground mt-0.5">8 slides — a fast overview of all major features</p>
              </button>
              <button
                onClick={() => { setMode("deep"); setStep(0); }}
                className="w-full rounded-xl border border-border hover:bg-muted/30 p-4 text-left transition-colors"
              >
                <p className="font-semibold text-sm text-foreground">📖 In-Depth Guide</p>
                <p className="text-xs text-muted-foreground mt-0.5">12 slides — detailed walkthrough of every feature</p>
              </button>
            </div>
            <button onClick={handleClose} className="text-xs text-muted-foreground hover:text-foreground underline">
              Skip for now
            </button>
          </div>
        ) : (
          // Step screen
          <div>
            {/* Progress bar */}
            <div className="h-1 bg-muted w-full">
              <div
                className="h-1 bg-primary transition-all duration-300"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${current.color}20` }}
                >
                  <Icon className="w-6 h-6" style={{ color: current.color }} />
                </div>
                <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{current.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1.5">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setStep(step - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  )}
                  {isLast ? (
                    <Button size="sm" onClick={handleClose}>Done 💜</Button>
                  ) : (
                    <Button size="sm" onClick={() => setStep(step + 1)}>
                      Next <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}