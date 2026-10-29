// The Guide — first-run walkthrough AND replay-from-Dashboard reference.
// Per owner feedback (v0.84.6), the setup steps that used to live in a
// separate wizard are now INTEGRATED into this Guide as inline pages, so
// there's one flow the user sees on first launch and can replay any time.
//
// Three phases:
//   • Welcome (1 page): what the app is + the medical acknowledgement.
//   • Setup (2 pages): terminology, then the setup checklist hub.
//   • About the app (v0.316.0 rewrite): a "You're all set!" transition, then
//     one short page per area of the app as it's grouped today (profiles,
//     home screen, logging, your day, writing, support, looking back,
//     privacy). Details live in each page's "Show me around" walk-through,
//     so these pages stay short and current instead of listing every control.
//
// Interactive slides render via the shared SetupWizardShell's `render`
// prop; passive slides are declared with body/features/tip.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { isNative } from "@/lib/platform";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, BarChart2, Shield, Sparkles, CheckSquare,
  MessageSquare, Zap, Bell, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { withBatch } from "@/lib/localDb";
import { useTerms } from "@/lib/useTerms";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import SetupWizardShell from "@/components/onboarding/SetupWizardShell";
import {
  TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS, itemToSymptomFields,
} from "@/lib/trackingPresets";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { markBundlesChosen } from "@/utils/symptomDefaults";
import { symptomDuplicateKey } from "@/lib/symptomDuplicates";
import { TermsSetupContent } from "@/components/onboarding/TermsSetupModal";
import { DISCLAIMER_ACK_KEY } from "@/components/onboarding/DisclaimerModal";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import SetupChecklist from "@/components/onboarding/SetupChecklist";

// Near-duplicate aware ("Energy level" already covers the "Energy" preset)
// so a pack never adds a second copy of something already in the list.
const labelKey = (label, category) => symptomDuplicateKey(label, category);

function bundleKeyForSymptom(sym, terms) {
  for (const bundle of TRACKING_BUNDLES) {
    for (let i = 0; i < bundle.items.length; i++) {
      const item = bundle.items[i];
      const resolvedLabel = applyTerms(item.label, terms);
      const category = item.kind === "behaviour" ? "habit" : "symptom";
      if (labelKey(resolvedLabel, category) === labelKey(sym.label, sym.category || "symptom")) {
        return `${bundle.id}:${i}`;
      }
    }
  }
  return null;
}

function defaultBundleKeys() {
  const keys = new Set();
  for (const id of DEFAULT_ON_BUNDLE_IDS) {
    const b = TRACKING_BUNDLES.find((x) => x.id === id);
    b?.items.forEach((_, i) => keys.add(`${id}:${i}`));
  }
  return keys;
}

// Callers wanting to jump straight to the Setup Checklist step (e.g. the
// dashboard's "Continue setup" chip) pass openAt="checklist".
const STEP_ID_INDEX = { checklist: 2 };
export default function TourModal({ open, onClose, openAt = null }) {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ─── Interactive state ─────────────────────────────────────────────────
  // Bundle-diff state powers the "Choose what to track" step; the
  // disclaimer checkbox gates the very first Welcome page; termsSaved
  // relaxes the "Save terms" call-to-action once the user has saved.
  const [selected, setSelected] = useState(() => new Set());
  const [initialized, setInitialized] = useState(false);
  const [ackChecked, setAckChecked] = useState(() => {
    try { return !!localStorage.getItem(DISCLAIMER_ACK_KEY); } catch { return false; }
  });
  const [termsSaved, setTermsSaved] = useState(false);
  // The terminology step hides its own Save button and hands us its
  // save function via this ref — the shell's Next button then either
  // saves + advances (if not saved yet) or just advances.
  const termsSaveRef = useRef(null);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: !!open,
  });
  const settingsRow = pickPrimarySystemSettings(settingsList) || settingsList[0] || null;
  const uiV2On = UI_V2_ENABLED && settingsRow?.ui_v2?.enabled === true;

  useEffect(() => {
    if (!open) setTermsSaved(false);
  }, [open]);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    enabled: !!open,
  });

  const symptomByBundleKey = useMemo(() => {
    const map = new Map();
    for (const s of symptoms) {
      if (s.is_archived) continue;
      const k = bundleKeyForSymptom(s, t);
      if (k) map.set(k, s);
    }
    return map;
  }, [symptoms, t]);

  const existingKeys = useMemo(
    () => new Set(symptoms.map((s) => labelKey(s.label, s.category || "symptom"))),
    [symptoms]
  );

  useEffect(() => {
    if (open && !initialized) {
      const start = new Set(symptomByBundleKey.keys());
      if (symptomByBundleKey.size === 0) {
        defaultBundleKeys().forEach((k) => start.add(k));
      }
      setSelected(start);
      setInitialized(true);
    } else if (!open && initialized) {
      setInitialized(false);
      setSelected(new Set());
    }
  }, [open, initialized, symptomByBundleKey]);

  const toggleItem = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const toggleBundle = (_id, keys, select) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (select ? next.add(k) : next.delete(k)));
      return next;
    });

  const applyBundlesDiff = async () => {
    let created = 0, removed = 0;
    // One disk write for the whole choice, not one per item.
    await withBatch(async () => {
    for (const key of selected) {
      if (symptomByBundleKey.has(key)) continue;
      const [bundleId, idxStr] = key.split(":");
      const bundle = TRACKING_BUNDLES.find((b) => b.id === bundleId);
      const item = bundle?.items[Number(idxStr)];
      if (!item) continue;
      const fields = itemToSymptomFields(item, bundleId, Number(idxStr));
      fields.label = applyTerms(fields.label, t);
      if (existingKeys.has(labelKey(fields.label, fields.category))) continue;
      await base44.entities.Symptom.create(fields);
      created++;
    }
    for (const [key, row] of symptomByBundleKey.entries()) {
      if (selected.has(key)) continue;
      await base44.entities.Symptom.update(row.id, { is_archived: true });
      removed++;
    }
    });
    markBundlesChosen();
    qc.invalidateQueries({ queryKey: ["symptoms"] });
    if (created || removed) {
      const parts = [];
      if (created) parts.push(`added ${created}`);
      if (removed) parts.push(`removed ${removed}`);
      toast.success(`Tracking updated (${parts.join(", ")})`);
    }
  };

  const handleFinish = () => {
    onClose?.();
  };

  // ─── Step declarations ─────────────────────────────────────────────────
  const steps = [
    {
      phase: "Welcome",
      title: "Welcome to Oceans Symphony",
      subtitle: `A companion app built for dissociative ${t.systems}`,
      icon: <Bell className="w-8 h-8" />,
      color: "from-violet-500/20 to-purple-500/20",
      body:
        `Oceans Symphony is built by and for dissociative ${t.systems}, and it's free for anyone. It helps you track experiences, stay connected across the ${t.system} and bridge the gaps amnesia leaves, privately, on your own device.\n\n` +
        `The next pages help you set it up the way you want.`,
      render: () => (
        <div className="space-y-3 pt-1 border-t border-border/40">
          <MedicalDisclaimer compact />
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-border/60 p-3">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-[var(--color-primary)]"
              checked={ackChecked}
              onChange={(e) => setAckChecked(e.target.checked)}
            />
            <span>
              I understand Oceans Symphony is <strong>not a medical product</strong> — it doesn't
              diagnose, treat, or replace care from a professional.
            </span>
          </label>
        </div>
      ),
      nextDisabled: !ackChecked,
      // The medical acknowledgement is the one thing the guide won't let
      // you walk past — Skip, the X, Escape and outside taps all wait for
      // the tick (owner spec). Anyone who acknowledged on a previous run
      // starts checked, so reopening the guide is never a trap.
      dismissLocked: !ackChecked,
      lockedHint: "Tick the box above to continue or skip.",
      onNext: () => {
        try {
          if (ackChecked && !localStorage.getItem(DISCLAIMER_ACK_KEY)) {
            localStorage.setItem(DISCLAIMER_ACK_KEY, new Date().toISOString());
          }
        } catch { /* storage off */ }
      },
    },
    {
      phase: "Setup",
      title: "Set up your terminology",
      subtitle: "Everything else can be edited later, too",
      icon: "🗣️",
      color: "from-violet-500/20 to-fuchsia-500/20",
      render: () => (
        <TermsSetupContent
          existingSettingsId={settingsRow?.id || null}
          existingSettings={settingsRow || null}
          onSaved={() => setTermsSaved(true)}
          hideHeader
          hideSaveButton
          saveRef={termsSaveRef}
          lead="First, select the in-app terminology. Pick a preset or define your own. You can change this any time in Settings → Profile → Terminology."
        />
      ),
      // Always "Save & continue" — labelling it "Continue" after the first
      // save (v0.86.x) was misleading because users editing terms on a
      // return visit expected their edit to save when they hit Continue.
      // Combined with the onNext short-circuit that skipped the save when
      // termsSaved was already true, this made second-visit edits silently
      // discarded (tester report v0.87.4). handleSave is a no-op write when
      // nothing changed, so there's no cost to always calling it.
      nextLabel: "Save & continue",
      onNext: async () => {
        if (termsSaveRef.current) await termsSaveRef.current();
      },
    },
    {
      phase: "Setup",
      title: "Setup",
      subtitle: "Pick what fits — leave and come back any time",
      icon: <ClipboardList className="w-8 h-8" />,
      color: "from-emerald-500/20 to-teal-500/20",
      render: () => (
        <SetupChecklist
          onCloseGuide={onClose}
          uiV2On={uiV2On}
          bundleProps={{
            existingKeys, selected, onToggleItem: toggleItem, onToggleBundle: toggleBundle,
            terms: t, applyBundlesDiff,
          }}
        />
      ),
      // Auto-save the bundle diff on advance too, in case the user
      // adjusted tracking selection but didn't click the section's own
      // "Save tracking selection" button.
      onNext: applyBundlesDiff,
      nextLabel: "Complete setup!",
    },
    // Transition — setup is done. "Dive in" is the recommended path; "Read
    // more" walks the short "About the app" pages below.
    {
      phase: "About the app",
      title: "You're all set! 🎉",
      subtitle: "",
      icon: "✨",
      color: "from-violet-500/20 to-emerald-500/20",
      body:
        `Dive in, or tap "Read more" for a quick look at what's here. Each page also has a "Show me around" banner that walks you through it one step at a time.`,
      nextLabel: "Read more",
      skipHidden: false,
      extraAction: { label: "Dive in", onClick: () => onClose?.() },
      extraActionPrimary: true,
    },
    // ─── About the app (v0.316.0) ────────────────────────────────────────
    // One page per area of the app, the way the app itself is now grouped
    // — short, current, and pointing at the "Show me around" walk-throughs
    // for the details rather than explaining every control here.
    {
      phase: "About the app",
      title: "This app is your home",
      subtitle: `There's no "right" way to use it`,
      icon: "🏡",
      color: "from-amber-500/20 to-rose-500/20",
      body: `Use it however fits your ${t.system}. Track what helps, skip what doesn't, and come back to things later. Nothing you log leaves this device unless you send it.`,
      tip: `Every word the app uses for your ${t.system} — "${t.alter}", "${t.fronting}", "${t.switch}" — can be changed in Settings → Profile → Terminology.`,
    },
    {
      phase: "About the app",
      title: `Your ${t.alters}`,
      subtitle: "Every profile is a page you arrange",
      icon: <Users className="w-8 h-8" />,
      color: "from-purple-500/20 to-pink-500/20",
      body: `Each ${t.alter} has a profile made of widgets, like the home screen. What's on it is up to you.`,
      features: [
        "Info holds everything about them, and saves as you type",
        "The pencil (Edit page) moves, resizes and adds widgets",
        "Custom fields for anything else you want to keep",
        "Groups, contacts and inner-world places work the same way",
      ],
      tip: `The ${t.Front} button on a profile puts them in ${t.front}; hold it for the levels.`,
    },
    {
      phase: "About the app",
      title: "Your home screen",
      subtitle: "Built from widgets",
      icon: <Sparkles className="w-8 h-8" />,
      color: "from-sky-500/20 to-indigo-500/20",
      body: `The home screen is made of widgets. Each one shows or does one thing: who's ${t.fronting}, today's plans, a journal, a breathing circle.`,
      features: [
        "Hold an empty spot to move, resize or add widgets",
        "Each widget's gear changes what it shows and how it looks",
        "Build more pages and swipe between them",
        "Any widget can go on a profile too",
      ],
      tip: "Display options → Bars sets up every bar in the app in one place.",
    },
    {
      phase: "About the app",
      title: "Logging in a tap",
      subtitle: "Catch it while it's happening",
      icon: <Zap className="w-8 h-8" />,
      color: "from-amber-500/20 to-yellow-500/20",
      body: `Quick Check-In takes as much or as little as you like. The quick actions bar is always one tap away.`,
      features: [
        `Feelings, who's ${t.fronting}, activity, symptoms, a note`,
        "Statuses, places, sleep and diary cards",
        "Shortcuts you build yourself",
        "Everything is timestamped",
      ],
      tip: "Missed something? Press and hold a day on the timeline to add it afterwards.",
    },
    {
      phase: "About the app",
      title: "Your day",
      subtitle: "Plans, routines and nudges",
      icon: <CheckSquare className="w-8 h-8" />,
      color: "from-teal-500/20 to-emerald-500/20",
      body: `The planner holds what you did and what you mean to do. Plans stay until you say how they went, so nothing quietly disappears.`,
      features: [
        "Planner: drag on the week to log or plan",
        "Daily tasks with streaks, and a to-do list",
        "Reminders that open the right thing",
      ],
      tip: isNative()
        ? "Reminders arrive even with the app closed, once notifications are allowed."
        : "In the web app, reminders arrive while it's open; turn on \"Reliable reminders\" in Settings → Notifications for when it's closed.",
    },
    {
      phase: "About the app",
      title: "Writing and talking",
      subtitle: `Bridging the gaps across the ${t.system}`,
      icon: <MessageSquare className="w-8 h-8" />,
      color: "from-green-500/20 to-teal-500/20",
      body: `Leave words for each other, however you talk best.`,
      features: [
        "Journals, with folders and private entries",
        `${t.System} chat with channels`,
        `Bulletin board for the whole ${t.system}`,
        "@ mentions notify, whispers stay private",
      ],
      tip: `Anywhere you write, @name mentions an ${t.alter} and ~therapy saves a note for your next report.`,
    },
    {
      phase: "About the app",
      title: "Support & Learn",
      subtitle: "Grounding when you need it",
      icon: <Shield className="w-8 h-8" />,
      color: "from-pink-500/20 to-rose-500/20",
      body: `Grounding techniques, breathing, sounds and a 13-module course of coping skills drawn mainly from the Finding Solid Ground workbook. The app isn't a substitute for professional care.`,
      features: [
        "Help me figure out what I need",
        "Guided breathing and soundscapes",
        "A safety plan you build over time",
      ],
      tip: "The 🫧 bubble on every screen opens Support.",
    },
    {
      phase: "About the app",
      title: "Looking back",
      subtitle: "See the patterns, bring them to therapy",
      icon: <BarChart2 className="w-8 h-8" />,
      color: "from-violet-500/20 to-indigo-500/20",
      body: `Everything you log comes together, so you can see what happened even across amnesia.`,
      features: [
        "Timeline: every day, everything in it",
        `Analytics: ${t.fronting}, feelings, symptoms, activities`,
        "Therapy report: a summary to share, made on your device",
      ],
      tip: "The more you log, the more the analytics can show.",
    },
    {
      phase: "About the app",
      title: "Privacy & your data",
      subtitle: "Your data, your control",
      icon: "🔒",
      color: "from-slate-500/20 to-gray-500/20",
      body: `Everything stays on this device, and there's no account. It only leaves when you choose: a backup, Friends, cloud reminders or device sync. There's no cloud copy, so please keep backups.`,
      features: [
        "Automatic backups, password-locked if you like",
        "Optional password lock for everything on this device",
        "Deleted things wait in the trash for 30 days",
        "No ads, no tracking, free and open source",
      ],
      tip: "Settings → Data & privacy has it all, including \"See your data\".",
    },
    {
      phase: "About the app",
      title: "You're all set 💜",
      subtitle: `Welcome to the ${t.system}`,
      icon: "💜",
      color: "from-violet-500/20 to-purple-500/20",
      body: `Explore at your own pace. Each page's "Show me around" walks you through it one step at a time. Reopen this guide any time from the ⚙ menu on the home screen, or Settings → About & help.`,
      tip: "For a tour of the whole app, choose Feature tour from the ⚙ menu on the home screen.",
      nextLabel: "Start exploring 💜",
      onNext: handleFinish,
    },
  ];

  return (
    <SetupWizardShell
      open={open}
      onClose={onClose}
      onFinish={handleFinish}
      steps={steps}
      ariaLabel="Oceans Symphony guide"
      finishLabel="Start exploring 💜"
      skipLabel="Skip guide"
      initialStep={openAt && STEP_ID_INDEX[openAt] != null ? STEP_ID_INDEX[openAt] : 0}
    />
  );
}
