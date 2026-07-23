// The Guide — first-run walkthrough AND replay-from-Dashboard reference.
// Per owner feedback (v0.84.6), the setup steps that used to live in a
// separate wizard are now INTEGRATED into this Guide as inline pages, so
// there's one flow the user sees on first launch and can replay any time.
//
// Three phases (v0.84.8) so the honest "Setup · 3/3" only starts at the
// actual setup pages, not the whole 20:
//   • Welcome (4 pages): Welcome / This app is your home / Your Alters /
//     The Quick Check-In. Informational orientation.
//   • Setup (3 pages): Choose what to track / Emotions / Backups. The
//     only actually-interactive setup portion.
//   • About the app (13 pages): a "You're all set!" transition landing
//     page with buttons to jump straight to the Alters page or the
//     check-in manager, followed by the classic feature-intro slides
//     (Check-In Log, Symptom Tracking, Journals, Timeline, Tasks &
//     Habits, Bulletin, Reminders, Analytics, Support & Learn, Therapy
//     Report, Privacy & Data, You're all set).
//
// The prior "Fronting Tracker" and "System Map" slides are gone; the
// System Map slot became the minimal Quick Check-In overview inside the
// Welcome phase.
//
// Interactive slides render via the shared SetupWizardShell's `render`
// prop; passive slides are declared with body/features/tip.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, Heart, BookOpen, BarChart2, Shield,
  FileText, Sparkles, Clock, CheckSquare, Activity,
  MessageSquare, Zap, Package, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import SetupWizardShell from "@/components/onboarding/SetupWizardShell";
import { BundleList } from "@/components/symptoms/BundlePicker";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import {
  TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS, itemToSymptomFields,
} from "@/lib/trackingPresets";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { markBundlesChosen } from "@/utils/symptomDefaults";

const labelKey = (label, category) =>
  `${String(label || "").trim().toLowerCase()}::${category}`;

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

export default function TourModal({ open, onClose }) {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ─── Interactive setup state (bundle diff) ────────────────────────────
  // The alters "take me there" and check-in-manager choices used to live
  // as an inline checkbox on the Alters step; they moved to the "You're
  // all set!" transition page (v0.84.8), where inline buttons close the
  // guide and navigate directly.
  const [selected, setSelected] = useState(() => new Set());
  const [initialized, setInitialized] = useState(false);

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
      title: "Welcome to Oceans Symphony 💜",
      subtitle: "A companion app built for dissociative systems",
      icon: "🌊",
      color: "from-violet-500/20 to-purple-500/20",
      body:
        `Symphony is built intentionally for DID, OSDD, and other dissociative systems, and is free for anyone to use for any purpose. It is designed specifically to help track and manage dissociative and PTSD symptoms, help your ${t.system} stay connected, track experiences, and bridge the gaps that amnesia creates.\n\n` +
        `The following pages will help you set up and learn about OS' features!`,
    },
    {
      phase: "Welcome",
      title: "This app is your home",
      subtitle: `There's no "right" way to use it`,
      icon: "🏡",
      color: "from-amber-500/20 to-rose-500/20",
      body: `This is your space — use it however feels right for your ${t.system}. There aren't any rules to follow and nothing is being submitted anywhere; everything you log stays on your device as your own private record.\n\nExperiment with what you track. Skip what doesn't help. Come back to features later if they don't click yet. The app is meant to fit around your ${t.system} — not the other way around.`,
      tip: `Custom terminology lives in Settings → Profile → Terminology. Every word the app uses — "${t.system}", "${t.alter}", "${t.fronting}", "${t.switch}" — can be changed to match how your ${t.system} talks about itself.`,
    },
    {
      phase: "Welcome",
      title: `Your ${t.Alters}`,
      subtitle: `Every part of the ${t.system}, all in one place`,
      icon: <Users className="w-8 h-8" />,
      color: "from-purple-500/20 to-pink-500/20",
      body: `Create profiles for each ${t.alter} with their own name, pronouns, color, avatar, role, and bio. ${t.Alters} can have custom fields, notes from other ${t.alters}, and their own journal entries. Add them one by one, or import from Simply Plural, PluralKit, and other apps (Settings → Data & Privacy → Import).`,
      tip: `Press the thunder/active icon next to an ${t.alter} card to set their ${t.front} status; long press to set/remove as primary.`,
      features: [
        "Custom profiles with avatars",
        "Pronouns and roles",
        `Private ${t.alter} notes`,
        "Custom fields",
        "Import from other apps",
      ],
    },
    // Was System Map slot — now a minimal Quick Check-In overview.
    {
      phase: "Welcome",
      title: "The Quick Check-In",
      subtitle: "The fastest way to log anything",
      icon: <Sparkles className="w-8 h-8" />,
      color: "from-amber-500/20 to-yellow-500/20",
      body: `Open Quick Check-In from the dashboard any time and enter as much or as little as you'd like. It's built around several optional sections you can turn on/off from Settings → Tracking setup → Check-in manager.`,
      features: [
        "Feeling — emotions with a general → specific wheel",
        `${t.Fronting} — set or change who's ${t.fronting}`,
        "Activity — what you're doing",
        "Symptoms / Habits / Context — tracked items",
        "Diary — daily rating fields",
        "Note — a free-text note (long ones become journals)",
        "Company, Location — who's with you and where",
      ],
      tip: "Every section is customizable — the next few pages walk you through choosing what to track, tuning emotions, and setting up backups.",
    },
    {
      phase: "Setup",
      title: "Choose what to track",
      subtitle: "Packs of things some systems keep an eye on",
      icon: <Package className="w-8 h-8" />,
      color: "from-violet-500/20 to-indigo-500/20",
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recommended packs are pre-checked. Untick anything you don't want, open the other packs
            (Trauma responses, Focus, Sensory, Body &amp; sleep, Context, Safety…) to add more.
            Nothing here is a diagnosis — it's just what you'd like to keep an eye on.
          </p>
          <BundleList
            existingKeys={existingKeys}
            selected={selected}
            onToggleItem={toggleItem}
            onToggleBundle={toggleBundle}
            terms={t}
          />
          <p className="text-xs text-muted-foreground">
            Need something not on the list? You can add your own custom symptoms, habits, and
            context items from Settings → Tracking setup → Check-in manager any time.
          </p>
        </div>
      ),
      nextLabel: "Save & continue",
      onNext: applyBundlesDiff,
    },
    {
      phase: "Setup",
      title: "Emotions",
      subtitle: "Distress-toggle, rename groups, add your own",
      icon: <Heart className="w-8 h-8" />,
      color: "from-rose-500/20 to-pink-500/20",
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            When you log a <strong>distressing</strong> emotion, the app offers a quick support
            prompt — one tap opens a grounding exercise, never automatic. Tap any emotion below
            to change whether it's distressing, rename the four groups, or add your own emotion
            with a category in one go.
          </p>
          <CustomEmotionsManager />
        </div>
      ),
    },
    {
      phase: "Setup",
      title: "Backups",
      subtitle: "The one thing to know about local-only",
      icon: <CloudOff className="w-8 h-8" />,
      color: "from-slate-500/20 to-gray-500/20",
      body: `Local also means no cloud copy. If this device's data is lost, it's lost for good — so export backups, especially before switching devices. Automatic backups can save a copy on a schedule.`,
      render: () => (
        <div className="pt-1">
          <AutoBackupSettings />
        </div>
      ),
    },
    // Transition — setup is done; user picks where to go next.
    {
      phase: "About the app",
      title: "You're all set! 🎉",
      subtitle: "Setup is done",
      icon: "✨",
      color: "from-violet-500/20 to-emerald-500/20",
      body:
        `The following pages give a brief written introduction to Oceans Symphony's various features. For an in-depth walk-through, view the in-app "Tour" or click the "Show me around" banner at the top of each page.`,
      render: () => (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => { onClose?.(); navigate("/Home"); }}
            className="w-full text-left rounded-xl border border-border/60 p-3 hover:bg-muted/40 transition-colors"
          >
            <p className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Go to the {t.Alters} page
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Add your first {t.alters}, or import from another app.</p>
          </button>
          <button
            type="button"
            onClick={() => { onClose?.(); navigate("/manage-checkin"); }}
            className="w-full text-left rounded-xl border border-border/60 p-3 hover:bg-muted/40 transition-colors"
          >
            <p className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Open the check-in manager
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Add or edit custom symptoms, habits, and diary fields.</p>
          </button>
          <p className="text-xs text-muted-foreground text-center pt-1">
            Or hit <span className="font-medium text-foreground">Next</span> below to keep browsing the guide.
          </p>
        </div>
      ),
    },
    // ─── Rest of the classic guide, unchanged ────────────────────────────
    {
      phase: "About the app",
      title: "Check-In Log",
      subtitle: `Track how the ${t.system} is doing day to day`,
      icon: <Sparkles className="w-8 h-8" />,
      color: "from-amber-500/20 to-yellow-500/20",
      body: `Quick check-ins let any part log emotions, symptoms, activities, diary entries, and notes in one place. Everything is timestamped and tied to who was ${t.fronting}.`,
      tip: "The Quick Check-In button on the home screen is the fastest way to log anything.",
      features: [
        "Emotion check-ins",
        "Symptom and habit tracking",
        "Activity logging",
        "Diary cards",
        "Sleep tracking",
      ],
    },
    {
      phase: "About the app",
      title: "Symptom Tracking",
      subtitle: "Log and monitor symptoms over time",
      icon: <Activity className="w-8 h-8" />,
      color: "from-red-500/20 to-rose-500/20",
      body: `Track dissociation, anxiety, flashbacks, and any custom symptoms. Active symptoms show on the dashboard. The timeline shows severity changes as a visual bar.`,
      tip: "Long press an active symptom chip to adjust severity or end the session.",
      features: [
        "Custom symptoms and habits",
        "Severity tracking over time",
        "Timeline visualization",
        "Active symptom display",
        "Analytics charts",
      ],
    },
    {
      phase: "About the app",
      title: "Journals",
      subtitle: `Write, remember, and share across the ${t.system}`,
      icon: <BookOpen className="w-8 h-8" />,
      color: "from-green-500/20 to-teal-500/20",
      body: `Journal entries can be written by specific ${t.alters} and shared with the ${t.system}. Mention other ${t.alters} with @ to send them notifications. The bulletin board is for ${t.system}-wide messages.`,
      tip: `Use @ mentions in journals and bulletins to notify specific ${t.alters}.`,
      features: [
        "Private and shared entries",
        "@ mentions with notifications",
        "Bulletin board",
        "Threaded comments",
        "Rich text blocks",
      ],
    },
    {
      phase: "About the app",
      title: "Timeline",
      subtitle: `Your ${t.system}'s history, all in one view`,
      icon: <Clock className="w-8 h-8" />,
      color: "from-indigo-500/20 to-blue-500/20",
      body: `The infinite timeline shows everything — ${t.fronting} sessions, emotions, activities, symptoms, journal entries, and tasks — laid out chronologically by day. Zoom in and out to explore.`,
      tip: `Press and hold anywhere on the timeline to retroactively add a ${t.fronting} session or quick check-in at that time.`,
      features: [
        `${t.Fronting} session bars`,
        "Emotion and symptom events",
        "Activity tracking",
        "Zoom and scroll",
        "Daily tally view",
        "Retroactive entry via long press",
      ],
    },
    {
      phase: "About the app",
      title: "Tasks & Habits",
      subtitle: "Daily, weekly, monthly, and yearly tracking",
      icon: <CheckSquare className="w-8 h-8" />,
      color: "from-teal-500/20 to-emerald-500/20",
      body: `Build task lists for any time scale — daily routines, weekly goals, monthly intentions, or yearly milestones. Track streaks and habit completion over time.`,
      tip: "Tasks repeat on their schedule and track streaks automatically.",
      features: [
        "Daily, weekly, monthly, yearly tasks",
        "Completion streaks",
        "Historical review",
        "Manual check-off",
        "System-wide task sharing",
      ],
    },
    {
      phase: "About the app",
      title: "Bulletin Board",
      subtitle: "System-wide announcements and messages",
      icon: <MessageSquare className="w-8 h-8" />,
      color: "from-orange-500/20 to-amber-500/20",
      body: `Post messages that any part of the ${t.system} can see. Great for leaving notes between ${t.alters}, announcements, or anything the whole ${t.system} should know.`,
      tip: "Pin important bulletins so they always appear at the top of the board.",
      features: [
        "System-wide messages",
        "@ mention notifications",
        "Comments and replies",
        "Pin important posts",
        "Timestamped for reference",
      ],
    },
    {
      phase: "About the app",
      title: "Reminders & Notifications",
      subtitle: "Stay on track between sessions",
      icon: <Zap className="w-8 h-8" />,
      color: "from-yellow-500/20 to-orange-500/20",
      body: `Set scheduled reminders to log fronting, check in, or take care of yourself. Reminders can link directly to any part of the app — tap a notification and it opens the right thing instantly.`,
      tip: "Reminders are delivered even when the app is closed, as long as you grant notification permission.",
      features: [
        "Scheduled reminders",
        "Deep-link to any feature",
        "Custom messages",
        "Repeating or one-time",
        "Notification history",
      ],
    },
    {
      phase: "About the app",
      title: "Analytics",
      subtitle: `Understand your ${t.system}'s patterns`,
      icon: <BarChart2 className="w-8 h-8" />,
      color: "from-violet-500/20 to-indigo-500/20",
      body: `See which ${t.alters} ${t.front} most, when ${t.switching} happens, emotion patterns, symptom trends, and more. Analytics draw from all your logged data automatically.`,
      tip: "The more you log, the more meaningful your analytics become.",
      features: [
        `${t.Fronting} distribution`,
        `${t.Cofronting} patterns`,
        "Emotion trends",
        "Symptom analytics",
        "Activity summaries",
      ],
    },
    {
      phase: "About the app",
      title: "Support & Learn",
      subtitle: "Grounding tools and trauma-informed skills",
      icon: <Shield className="w-8 h-8" />,
      color: "from-pink-500/20 to-rose-500/20",
      body: `Access breathing exercises, imagery techniques, and grounding tools instantly. The Learn section is a full 13-module curriculum of trauma-informed coping skills you can work through at your own pace, drawing primarily from the Finding Solid Ground workbook — a validated, clinician-authored source. The app itself is not a substitute for professional care.`,
      tip: "The floating bubble button gives instant access to support from anywhere in the app.",
      features: [
        "9 breathing techniques",
        "Imagery grounding",
        "13-module curriculum",
        "Interactive exercises",
        "Personal coping cards",
        "Resources page with validated sources",
      ],
    },
    {
      phase: "About the app",
      title: "Therapy Report",
      subtitle: "Bridge the amnesia gap in therapy",
      icon: <FileText className="w-8 h-8" />,
      color: "from-teal-500/20 to-green-500/20",
      body: `Generate a structured PDF report of your ${t.system}'s activity over any time period. Bring it to therapy so your therapist can see what happened between sessions — even across amnesia barriers.`,
      tip: "Reports are generated entirely on your device — nothing is ever sent to a server.",
      features: [
        "PDF and plain text export",
        "Smart highlights mode",
        `${t.Alter} anonymization option`,
        "Customizable sections",
        "Personal note to therapist",
      ],
    },
    {
      phase: "About the app",
      title: "Privacy & Data",
      subtitle: "Your data, your control",
      icon: "🔒",
      color: "from-slate-500/20 to-gray-500/20",
      body: `Oceans Symphony is private by design — by default, your data stays on this device only. Nothing is uploaded, synced, or sent to any server; records live in this browser's IndexedDB and only leave the device if you export a backup yourself, or if you opt in to Friends mode. (Friends mode only ever transmits your ${t.system} name, display name, and current ${t.front} status — at the granularity you pick — and never any of your other local data.) By default records are stored unencrypted, so anyone with access to the device could read them. For even greater security, turn on password encryption under Settings → Data & Privacy: that adds AES-256-GCM encryption at rest on top (on-device only — not end-to-end). The app is free and open source, built by a dissociative ${t.system}, and is in active development — bugs may be encountered. Regular backups are recommended.`,
      tip: "Privacy & Data Notice lives at the top of Settings — tap to expand for details.",
      features: [
        "Unencrypted by default",
        "Optional on-device encryption at rest",
        "Plain JSON backups",
        "No ads, no tracking",
        "Active development — bugs may be encountered",
      ],
    },
    {
      phase: "About the app",
      title: "You're all set 🎉",
      subtitle: `Welcome to the ${t.system}`,
      icon: "💜",
      color: "from-violet-500/20 to-purple-500/20",
      body: `Explore at your own pace. Every feature is designed with dissociative ${t.systems} in mind. You can reopen this guide anytime from the Guide button on the home screen.`,
      tip: "Want a hands-on walkthrough of the UI itself? Tap the Tour ✨ button on the home screen for an interactive step-by-step tour that spotlights the actual UI.",
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
    />
  );
}
