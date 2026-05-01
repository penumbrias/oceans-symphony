import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

function buildSteps(t) {
  return [
    {
      title: "Welcome to the interactive tour!",
      body: `This tour will walk you through every major feature. We'll navigate to each one together — you can tap and explore as we go.`,
      route: "/",
      target: null,
      look: null,
      emoji: "🌊",
    },
    {
      title: "Quick Check-In",
      body: `The Quick Check-In button lets any part of the ${t.system} log emotions, symptoms, activities, and notes in seconds. It's the fastest way to capture a moment.`,
      route: "/",
      target: "quick-checkin",
      look: `the red/pink "Quick Check-In" button below the fronting bar`,
      emoji: "💜",
    },
    {
      title: "Set Front",
      body: `Tap "Set Front" to log who is currently ${t.fronting}. You can set a primary ${t.fronter} and any co-${t.fronters}. ${t.Fronting} history feeds your timeline and analytics automatically.`,
      route: "/",
      target: "set-front",
      look: `the "Set Front" button in the top bar`,
      emoji: "⭐",
    },
    {
      title: `${t.Alters} Page`,
      body: `Every member of the ${t.system} gets their own profile — name, pronouns, color, avatar, role, bio, and custom fields. ${t.Alters} can have private notes from other parts.`,
      route: "/alters",
      target: "alters-grid",
      look: `the grid of ${t.alter} cards`,
      emoji: "👥",
    },
    {
      title: "Timeline",
      body: `The infinite timeline shows everything day by day — ${t.fronting} sessions, emotions, activities, symptoms, and entries. Tap "Tally" on any day for a category-organized summary. Long-press anywhere to add a retroactive entry.`,
      route: "/timeline",
      target: "timeline-container",
      look: `the day-by-day timeline below`,
      emoji: "📅",
    },
    {
      title: "Activities",
      body: `Log activities with category, duration, and notes. Activities appear on the timeline and feed into your therapy report.`,
      route: "/activities",
      target: "activities-log",
      look: `the activity list and log button`,
      emoji: "🏃",
    },
    {
      title: "Journals",
      body: `Write journal entries as any ${t.alter}. Use @ mentions to notify specific ${t.alters}. Quick check-in notes over 50 words automatically become journal entries.`,
      route: "/journals",
      target: "journals-list",
      look: `the journal entries list`,
      emoji: "📖",
    },
    {
      title: "Bulletin Board",
      body: `Post system-wide messages that any part can see — announcements, reminders, or notes between ${t.alters}. Supports @ mentions and comments.`,
      route: "/",
      target: "bulletin-list",
      look: `the Bulletin Board section — scroll down on the home screen`,
      emoji: "📋",
    },
    {
      title: "Tasks & Habits",
      body: `Daily, weekly, monthly, and yearly task lists with streak tracking. Retroactively review and check off tasks from past periods via the timeline tally.`,
      route: "/todo",
      target: "tasks-list",
      look: `the task list and frequency tabs at the top`,
      emoji: "✅",
    },
    {
      title: `${t.System} Map`,
      body: `The inner world canvas lets you position ${t.alters} freely and draw relationship lines between them. Tap an ${t.alter} to explore their connections. The analytics view shows ${t.fronting} overlap.`,
      route: "/system-map",
      target: "system-map-canvas",
      look: `the map canvas — try tapping an ${t.alter}`,
      emoji: "🗺️",
    },
    {
      title: "Analytics",
      body: `Charts and breakdowns of ${t.fronting} distribution, emotion trends, symptom patterns, and activity summaries. The more you log, the more meaningful these become.`,
      route: "/analytics",
      target: "analytics-charts",
      look: `the analytics charts and tabs`,
      emoji: "📊",
    },
    {
      title: "Reminders",
      body: `Set scheduled reminders to check in, log front, or do anything else. Tap a notification and it opens the right part of the app directly.`,
      route: "/reminders",
      target: "reminders-list",
      look: `the reminder list and the "Add reminder" button`,
      emoji: "🔔",
    },
    {
      title: "Support & Grounding",
      body: `Breathing exercises, imagery grounding, and a 10-module trauma-informed curriculum. The 🫧 bubble button gives instant access from anywhere in the app — even during a crisis.`,
      route: "/grounding",
      target: "grounding-content",
      look: `the grounding tools — or the 🫧 button floating in the corner`,
      emoji: "🫧",
    },
    {
      title: "Therapy Report",
      body: `Generate a structured PDF of your ${t.system}'s activity over any period. Bring it to therapy to bridge the amnesia gap — your therapist can see what happened even across memory barriers.`,
      route: "/therapy-report",
      target: "therapy-report-builder",
      look: `the report builder — choose a date range and tap "Download PDF"`,
      emoji: "📄",
    },
    {
      title: "Settings & Privacy",
      body: `Enable local-only mode with AES-256 encryption so your data never leaves your device. Set your system name, customize terminology, and manage data backups here.`,
      route: "/settings",
      target: "settings-content",
      look: `the settings sections — especially "Data Management" for local mode`,
      emoji: "🔒",
    },
    {
      title: "You're all set! 🎉",
      body: `You've seen everything Oceans Symphony has to offer. Explore at your own pace — every feature is designed with dissociative ${t.system}s in mind. This tour is always available from the Guide button on the home screen.`,
      route: null,
      target: null,
      look: null,
      emoji: "💜",
    },
  ];
}

export default function FeatureTour({ onClose }) {
  const navigate = useNavigate();
  const t = useTerms();
  const steps = buildSteps(t);
  const [step, setStep] = useState(0);
  const [highlighted, setHighlighted] = useState(null);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  const applyHighlight = useCallback((target) => {
    // Clear any previous highlights
    document.querySelectorAll("[data-tour-active]").forEach(el => {
      el.removeAttribute("data-tour-active");
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.removeProperty("border-radius");
      el.style.removeProperty("position");
      el.style.removeProperty("z-index");
    });
    if (!target) { setHighlighted(null); return; }
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) { setHighlighted(null); return; }
    el.setAttribute("data-tour-active", "1");
    el.style.outline = "3px solid hsl(var(--primary))";
    el.style.outlineOffset = "4px";
    el.style.borderRadius = "8px";
    el.style.position = "relative";
    el.style.zIndex = "49";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(target);
  }, []);

  const goTo = useCallback((newStep) => {
    const s = steps[newStep];
    if (s.route) navigate(s.route);
    // Small delay to let the page render before trying to highlight
    setTimeout(() => applyHighlight(s.target), 400);
    setStep(newStep);
  }, [steps, navigate, applyHighlight]);

  // Apply highlight on mount for step 0
  useEffect(() => {
    goTo(0);
    return () => {
      document.querySelectorAll("[data-tour-active]").forEach(el => {
        el.removeAttribute("data-tour-active");
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
        el.style.removeProperty("border-radius");
        el.style.removeProperty("position");
        el.style.removeProperty("z-index");
      });
    };
  }, []);

  return (
    <>
      {/* Dim overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 pointer-events-none" />

      {/* Tour card — sits above nav (mb-16 = bottom nav height) */}
      <div className="fixed bottom-16 left-0 right-0 z-50 px-3 pb-2">
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="px-4 pt-3 pb-1">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{current.emoji}</span>
                <div>
                  <p className="font-semibold text-sm text-foreground leading-tight">{current.title}</p>
                  <p className="text-[10px] text-muted-foreground">Step {step + 1} of {steps.length}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">{current.body}</p>

            {/* "Look for" hint */}
            {current.look && (
              <div className="flex items-start gap-1.5 bg-primary/8 border border-primary/20 rounded-lg px-2.5 py-2 mb-3">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-primary leading-snug">
                  <span className="font-semibold">Look for</span> {current.look}
                </p>
              </div>
            )}

            {/* Nav */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => goTo(step - 1)}
                disabled={isFirst}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <button
                onClick={() => isLast ? onClose() : goTo(step + 1)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {isLast ? "Done 💜" : (<>Next <ChevronRight className="w-3 h-3" /></>)}
              </button>
              {!isLast && (
                <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Skip
                </button>
              )}
            </div>
          </div>
          <div className="h-1" />
        </div>
      </div>
    </>
  );
}
