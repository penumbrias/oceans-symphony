// The optional guided setup — TourModal-styled wizard launched from the
// dashboard's SetupHintCard (or Settings → About → Re-run setup). Owner-
// specified step order (v0.84.5):
//   1. Configure check-in (intro + explains customization)
//   2. Bundles (interactive picker — customs supported)
//   3. Emotions (interactive — inline custom + category)
//   4. Backups
//   5. Alters + fronting merged (LAST, after backups)
//   6. Done
//
// The bundle step uses the picker's new "desired final state" semantics
// (v0.84.5 fix): existing catalog items are pre-checked, unticking them
// archives. Nothing commits until the user hits Next on that step.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Heart, CloudOff, Users, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import SetupWizardShell from "@/components/onboarding/SetupWizardShell";
import { BundleList } from "@/components/symptoms/BundlePicker";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import { TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS, itemToSymptomFields } from "@/lib/trackingPresets";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { markBundlesChosen } from "@/utils/symptomDefaults";

export const ONBOARDING_DONE_KEY = "symphony_onboarding_done_v1";

const labelKey = (label, category) =>
  `${String(label || "").trim().toLowerCase()}::${category}`;

// Same bundle-key resolver BundlePicker uses — kept local so we don't have
// to widen its exports.
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

export default function GuidedSetupModal({ open, onFinish }) {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [initialized, setInitialized] = useState(false);
  const [goToAlters, setGoToAlters] = useState(false);

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

  // Pre-populate selection: existing preset items + defaults for keys not
  // yet in the catalogue at all. Users can uncheck anything.
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

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_DONE_KEY, "1"); } catch { /* storage off */ }
    onFinish?.();
    if (goToAlters) navigate("/Home");
  };

  // ── Step definitions ────────────────────────────────────────────────────
  const steps = [
    {
      title: "The Quick Check-In",
      subtitle: "Any data is useful data",
      icon: <Sparkles className="w-8 h-8" />,
      color: "from-amber-500/20 to-yellow-500/20",
      body:
        `The Quick Check-In is the fastest way to log anything — open it any time and enter as much or as little as you'd like.\n\n` +
        `The emotions section works from general to specific ("Bad" → "Fearful" → "Anxious"), which helps when feelings are hard to name. There's also a Body & Nervous System section for physical states.\n\n` +
        `Every section is customizable, including what symptoms and habits you track, which emotions the app knows, and which count as distressing — those trigger a gentle support prompt.`,
      tip: "Everything you set here is editable later from Settings → Tracking setup.",
    },
    {
      title: "Pick what to track",
      subtitle: "Packs of things some systems track",
      icon: <Package className="w-8 h-8" />,
      color: "from-violet-500/20 to-indigo-500/20",
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recommended packs are pre-checked. Untick anything you don't want, open the other packs
            (Trauma responses, Focus, Sensory, Body &amp; sleep, Context, Safety…) to add more. Nothing
            here is a diagnosis — think of it as "things some {t.systems} keep an eye on."
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
            context items from Settings → Tracking setup → Check-in manager after finishing setup.
          </p>
        </div>
      ),
      nextLabel: "Save & continue",
      onNext: applyBundlesDiff,
    },
    {
      title: "Emotions",
      subtitle: "Set which ones count as distressing",
      icon: <Heart className="w-8 h-8" />,
      color: "from-rose-500/20 to-pink-500/20",
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            When you log a <strong>distressing</strong> emotion, the app offers a quick support
            prompt — one tap opens a grounding exercise, never automatic. Tap any emotion below to
            change whether it's distressing, rename the four groups, or add your own emotion with a
            category all in one go.
          </p>
          <CustomEmotionsManager />
        </div>
      ),
    },
    {
      title: "Backups",
      subtitle: "The one thing to know about local-only",
      icon: <CloudOff className="w-8 h-8" />,
      color: "from-slate-500/20 to-gray-500/20",
      body:
        `Local also means no cloud copy. If this device's data is lost, it's lost for good — so export backups, especially before switching devices.\n\n` +
        `Automatic backups can save a copy on a schedule.`,
      render: () => (
        <div className="pt-1">
          <AutoBackupSettings />
        </div>
      ),
    },
    {
      title: `Your ${t.Alters} & ${t.fronting}`,
      subtitle: `Where the ${t.system} lives`,
      icon: <Users className="w-8 h-8" />,
      color: "from-purple-500/20 to-pink-500/20",
      body:
        `The ${t.Alters} page is the ${t.system} directory — every ${t.alter} gets a profile with a name, pronouns, colour, and a page you can decorate. Add them one by one, or import from Simply Plural, PluralKit, and other apps (Settings → Data & Privacy → Import).\n\n` +
        `${t.Fronting} tracking is entirely optional. If you don't track it, analytics still work — the app associates check-ins and journal entries with ${t.alters} based on who authored them. Just write as yourself and patterns still build.`,
      tip: `The ${t.fronting} widget on the dashboard can be hidden if you don't use it (Settings → Appearance → Layout → Dashboard).`,
      render: () => (
        <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-border/60 p-3">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[var(--color-primary)]"
            checked={goToAlters}
            onChange={(e) => setGoToAlters(e.target.checked)}
          />
          <span>Take me to the {t.Alters} page when setup finishes</span>
        </label>
      ),
      nextLabel: "Done 💜",
      onNext: finish,
    },
  ];

  return (
    <SetupWizardShell
      open={open}
      onClose={onFinish /* dismissing counts as "skip the rest" */}
      onFinish={finish}
      steps={steps}
      ariaLabel="Guided setup"
      finishLabel="Done 💜"
      skipLabel="Skip the rest"
    />
  );
}
