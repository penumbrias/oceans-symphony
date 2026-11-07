// The welcome steps (v0.370.0) — first run, "Start over", and the door
// from the home screen's ⚙ menu. Five counted steps, each reusing the real
// thing (SetupFlowSteps.jsx): 1 Keep it safe · 2 One thing first (the
// not-medical notice) · 3 Your words · 4 How are you right now? (one
// feeling + what check-ins track) · 5 Who's here? Then an optional "About
// the app" run of short pages.
//
// Exits are always open. Close (X, Escape) leaves without recording
// anything, and the steps resume where they stopped next time. "Skip
// setup" and finishing step 5 record setup as done (onboardingState.js).
// On a first run, step 1 already happened on the storage screen, so the
// steps open at the first one not yet done.
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
  MessageSquare, Zap, ShieldCheck, Heart, Languages, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { withBatch } from "@/lib/localDb";
import { useTerms } from "@/lib/useTerms";
import SetupWizardShell from "@/components/onboarding/SetupWizardShell";
import {
  TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS, itemToSymptomFields,
} from "@/lib/trackingPresets";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { APP_VERSION } from "@/lib/appVersion";
import { markBundlesChosen } from "@/utils/symptomDefaults";
import { markPacks, markOnboardingDone, markNoticeSeen, readOnboarding } from "@/lib/onboardingState";
import { KeepSafeStep, NoticeStep, FeelingStep, WhoStep, addAlterByName } from "@/components/onboarding/SetupFlowSteps";
import { symptomDuplicateKey } from "@/lib/symptomDuplicates";
import { TermsSetupContent } from "@/components/onboarding/TermsSetupModal";
import { DISCLAIMER_ACK_KEY } from "@/components/onboarding/DisclaimerModal";
import { an } from "@/lib/articles";

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

const WHATS_NEW_SEEN_KEY = "symphony_whats_new_seen_version"; // NewFeaturesBar's

// Where the steps open: "start" (Start over) is step 1; otherwise the first
// step not yet done. Step 1 is skipped on a first run (the storage screen
// just asked it).
function resumeIndex(onboarding) {
  let ack = !!onboarding.notice_seen_at;
  try { ack = ack || !!localStorage.getItem(DISCLAIMER_ACK_KEY); } catch { /* storage off */ }
  if (!ack) return 1;
  if (!onboarding.wordsChosen) return 2;
  if (!onboarding.first_entry_at && !onboarding.packs) return 3;
  return 4;
}

// `onClose`: leave without recording anything. `onDone`: setup is finished
// or skipped (recorded here first).
export default function TourModal({ open, onClose, onDone = null, openAt = null }) {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ─── Interactive state ─────────────────────────────────────────────────
  // Bundle-diff state powers the "Choose what to track" step; the
  // disclaimer checkbox gates the very first Welcome page; termsSaved
  // relaxes the "Save terms" call-to-action once the user has saved.
  const [selected, setSelected] = useState(() => new Set());
  const [initialized, setInitialized] = useState(false);
  // Step 4's tracking choice ("express" | "custom" | "later" | null) and
  // step 5's typed name, kept here so Next can act on them.
  const [trackingChoice, setTrackingChoice] = useState(null);
  const [whoName, setWhoName] = useState("");
  const [whoAdded, setWhoAdded] = useState([]);
  const [termsSaved, setTermsSaved] = useState(false);
  // The terminology step hides its own Save button and hands us its
  // save function via this ref — the shell's Next button then either
  // saves + advances (if not saved yet) or just advances.
  const termsSaveRef = useRef(null);

  const { data: settingsList = [], isSuccess: settingsLoaded } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: !!open,
  });
  const settingsRow = pickPrimarySystemSettings(settingsList) || settingsList[0] || null;

  // Fixed when the steps open, so saving a step (which changes the
  // record) never makes the shell jump.
  const [startAt, setStartAt] = useState(null);
  useEffect(() => {
    if (!open) {
      setTermsSaved(false); setStartAt(null); setTrackingChoice(null); setWhoName(""); setWhoAdded([]);
      return;
    }
    if (startAt != null || !settingsLoaded) return;
    setStartAt(openAt === "start" ? 0 : resumeIndex(readOnboarding(settingsRow)));
  }, [open, settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: symptoms = [], isSuccess: symptomsLoaded } = useQuery({
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

  // Whether the person changed the tracking selection on this visit. The
  // Guide's Next ("Complete setup!") applies the selection only when they
  // did; an untouched list writes nothing (v0.368.1 — it used to add the
  // starter packs, or archive ones it thought were unticked).
  const [selectionTouched, setSelectionTouched] = useState(false);

  useEffect(() => {
    // Build the starting selection only once the person's symptoms have
    // loaded. Built from a not-yet-loaded (empty) list, it looked like a
    // fresh install and pre-ticked every starter pack.
    if (open && !initialized && symptomsLoaded) {
      const start = new Set(symptomByBundleKey.keys());
      if (symptomByBundleKey.size === 0) {
        defaultBundleKeys().forEach((k) => start.add(k));
      }
      setSelected(start);
      setInitialized(true);
    } else if (!open && initialized) {
      setInitialized(false);
      setSelected(new Set());
      setSelectionTouched(false);
    }
  }, [open, initialized, symptomsLoaded, symptomByBundleKey]);

  const toggleItem = (key) => {
    setSelectionTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleBundle = (_id, keys, select) => {
    setSelectionTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (select ? next.add(k) : next.delete(k)));
      return next;
    });
  };

  // `sel`: the bundle items to have. `archive`: also archive starter rows
  // not in `sel` (only for a hand-made selection). `packs`: the choice to
  // record; worked out from `sel` when not given.
  const applyBundlesDiff = async (sel = selected, { archive = true, packs = null } = {}) => {
    // Never diff against a list that hasn't loaded: every real row would
    // look unticked.
    if (!symptomsLoaded || !initialized) return;
    let created = 0, removed = 0;
    // One disk write for the whole choice, not one per item.
    await withBatch(async () => {
    for (const key of sel) {
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
      if (!archive || sel.has(key)) continue;
      await base44.entities.Symptom.update(row.id, { is_archived: true });
      removed++;
    }
    });
    markBundlesChosen();
    // The tracking choice, on the system's own record (onboardingState.js).
    if (packs) markPacks(packs);
    else {
      const def = new Set(defaultBundleKeys());
      const same = sel.size === def.size && [...sel].every((k) => def.has(k));
      markPacks(sel.size === 0 ? "none" : same ? "express" : "custom");
    }
    setSelectionTouched(false);
    qc.invalidateQueries({ queryKey: ["symptoms"] });
    if (created || removed) {
      const parts = [];
      if (created) parts.push(`added ${created}`);
      if (removed) parts.push(`removed ${removed}`);
      toast.success(`Tracking updated (${parts.join(", ")})`);
    }
  };

  const hasSymptoms = symptoms.some((s) => !s.is_archived);

  // Step 4's Next: act on the tracking choice. Nothing chosen writes nothing.
  const applyTracking = async () => {
    if (trackingChoice === "express") {
      // Adds the starter packs to whatever is there; never archives.
      return applyBundlesDiff(new Set([...symptomByBundleKey.keys(), ...defaultBundleKeys()]), { archive: false, packs: "express" });
    }
    if (trackingChoice === "custom") {
      // A hand-made list applies when touched, or when there's nothing yet
      // to archive (the pre-ticked packs on a fresh system).
      if (selectionTouched || symptomByBundleKey.size === 0) return applyBundlesDiff(selected, { packs: "custom" });
      return undefined;
    }
    if (trackingChoice === "later" && !hasSymptoms) {
      // The catalogue stays empty and the starter seed stands down.
      markBundlesChosen();
      await markPacks("none");
    }
    return undefined;
  };

  // Setup is done (finished step 5, or skipped): record it, mark the
  // current release notes as read, then hand back.
  const finishSetup = async () => {
    await markOnboardingDone();
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, APP_VERSION); } catch { /* storage off */ }
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const handleSkip = async () => { await finishSetup(); (onDone || onClose)?.(); };
  const handleFinish = () => { (onDone || onClose)?.(); };

  // ─── Step declarations ─────────────────────────────────────────────────
  const steps = [
    {
      phase: "Setup",
      title: "Keep it safe",
      subtitle: "Where your data lives",
      icon: <ShieldCheck className="w-8 h-8" />,
      color: "from-sky-500/20 to-emerald-500/20",
      render: () => <KeepSafeStep />,
    },
    {
      phase: "Setup",
      title: "One thing first",
      subtitle: "What this app is, and isn't",
      icon: <Heart className="w-8 h-8" />,
      color: "from-violet-500/20 to-purple-500/20",
      render: () => <NoticeStep />,
      // The one honest button: going forward means "I understand". Close
      // always leaves without recording it (asked again next time).
      nextLabel: "I understand",
      onNext: () => markNoticeSeen(),
    },
    {
      phase: "Setup",
      title: "Your words",
      subtitle: "Change them any time",
      icon: <Languages className="w-8 h-8" />,
      color: "from-violet-500/20 to-fuchsia-500/20",
      // The words step reads the saved words once, when it mounts. Mounted
      // before settings load, it showed (and Next saved) the default
      // preset over someone's own words, so it waits (v0.368.3).
      render: () => (!settingsLoaded ? (
        <p className="text-sm text-muted-foreground" role="status">Loading your words…</p>
      ) : (
        <TermsSetupContent
          existingSettingsId={settingsRow?.id || null}
          existingSettings={settingsRow || null}
          onSaved={() => setTermsSaved(true)}
          hideHeader
          hideSaveButton
          saveRef={termsSaveRef}
          lead="The words the app uses for you. Pick the closest, or make your own. Settings → Terminology changes them later."
        />
      )),
      // Always saves: Next on a return visit must keep an edit (tester
      // report v0.87.4). Saving unchanged words writes nothing new.
      nextLabel: "Save & continue",
      onNext: async () => {
        if (termsSaveRef.current) await termsSaveRef.current();
      },
    },
    {
      phase: "Setup",
      title: "How are you right now?",
      subtitle: "One tap is enough",
      icon: "🌊",
      color: "from-emerald-500/20 to-teal-500/20",
      render: () => (
        <FeelingStep tracking={{
          choice: trackingChoice, setChoice: setTrackingChoice, hasSymptoms,
          existingKeys, selected, onToggleItem: toggleItem, onToggleBundle: toggleBundle,
        }} />
      ),
      onNext: applyTracking,
    },
    {
      phase: "Setup",
      title: `Who's here?`,
      subtitle: `Your ${t.system}, as much or as little as you like`,
      icon: <UserPlus className="w-8 h-8" />,
      color: "from-purple-500/20 to-pink-500/20",
      render: () => (
        <WhoStep name={whoName} setName={setWhoName} added={whoAdded}
          onAdded={(n) => setWhoAdded((prev) => [...prev, n])} />
      ),
      nextLabel: "Finish",
      // A typed name nobody pressed Add for is still added. Then setup is
      // recorded as done; the "About the app" pages after are optional.
      onNext: async () => {
        if (whoName.trim()) {
          try {
            const created = await addAlterByName(whoName, qc);
            if (created) { setWhoAdded((prev) => [...prev, created.name || whoName.trim()]); setWhoName(""); }
          } catch (e) { toast.error(e?.message || `Couldn't add that ${t.alter}.`); }
        }
        await finishSetup();
      },
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
    // ─── About the app (v0.317.0) ────────────────────────────────────────
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
        "Routines and a to-do list",
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
      tip: `Anywhere you write, @name mentions ${an(t.alter)} and ~therapy saves a note for your next report.`,
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
      body: `Explore at your own pace. Each page's "Show me around" walks you through it one step at a time. Settings → Setup shows what's set up so far, and Start over runs these steps again.`,
      tip: "For the whole app, choose Take the tour in Settings → Setup.",
      nextLabel: "Start exploring 💜",
      onNext: handleFinish,
    },
  ];

  return (
    <SetupWizardShell
      // Opens once it knows where to start, so it never flashes step 1.
      open={open && startAt != null}
      onClose={onClose}
      onSkip={handleSkip}
      onFinish={handleFinish}
      steps={steps}
      ariaLabel="Welcome steps"
      countedPhases={["Setup"]}
      finishLabel="Start exploring 💜"
      skipLabel="Skip setup"
      initialStep={startAt ?? 0}
      // The support door never waits for setup or the notice.
      footerLink={{ label: "Need support right now?", onClick: () => { onClose?.(); navigate("/grounding"); } }}
    />
  );
}
