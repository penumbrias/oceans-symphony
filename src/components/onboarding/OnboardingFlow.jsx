// Guided first-run onboarding (Phase C of the onboarding/customization
// initiative — docs/onboarding-customization-design.md).
//
// Replaces the old Dashboard modal chain (Disclaimer → TermsSetup → auto
// TourModal) with one skip-safe, replayable flow:
//   welcome+trust → quick check-in intro → terminology →
//   configure check-in (Express | Customize → bundles → emotions) →
//   the alters page → fronting is optional → backups (last).
//
// Design rules baked in (from the research):
// - One idea per screen, plain literal language, every step skippable
//   (except the medical-disclaimer acknowledgement — required, as today).
// - Skipping is SAFE: defaults make the app fully usable, and everything
//   here is re-editable in Settings (each step says where).
// - Steps after the terminology step use the just-chosen terms live —
//   personalization that demonstrates itself.
// - Replayable: "Re-run setup" in Settings → About reopens this flow
//   (different alters may want to re-do setup). Finishing re-writes the
//   gate keys; existing data is never overwritten (terms step updates the
//   existing settings row).
//
// Legacy compatibility: existing users have `terms_setup_done` and never
// see this flow. Finishing writes the legacy keys (disclaimer ack,
// terms_setup_done, tour_seen) plus ONBOARDING_DONE_KEY.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Shield, Sparkles, Compass, Users, Package, Heart, CloudOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { DISCLAIMER_ACK_KEY } from "@/components/onboarding/DisclaimerModal";
import { TermsSetupContent } from "@/components/onboarding/TermsSetupModal";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import { BundleList } from "@/components/symptoms/BundlePicker";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import { TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS } from "@/lib/trackingPresets";
import { seedBundles, createPresetItems, markBundlesChosen } from "@/utils/symptomDefaults";
import { toast } from "sonner";

export const ONBOARDING_DONE_KEY = "symphony_onboarding_done_v1";

// Pre-selected picker keys for the recommended (default-on) bundles.
function defaultBundleKeys() {
  const keys = new Set();
  for (const id of DEFAULT_ON_BUNDLE_IDS) {
    const bundle = TRACKING_BUNDLES.find((b) => b.id === id);
    bundle?.items.forEach((_, i) => keys.add(`${id}:${i}`));
  }
  return keys;
}

export default function OnboardingFlow({ onDone, replay = false }) {
  const t = useTerms();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [ackChecked, setAckChecked] = useState(() => {
    try { return !!localStorage.getItem(DISCLAIMER_ACK_KEY); } catch { return false; }
  });
  const [mode, setMode] = useState(null); // null | "express" | "customize"
  const [selectedKeys, setSelectedKeys] = useState(defaultBundleKeys);
  const [goToAlters, setGoToAlters] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = settingsList[0] || null;

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const existingKeys = useMemo(
    () => new Set(symptoms.map((s) => `${String(s.label || "").trim().toLowerCase()}::${s.category || "symptom"}`)),
    [symptoms]
  );

  // Step list — the two Customize sub-steps exist only on that path.
  const steps = useMemo(() => {
    const base = ["welcome", "checkin", "terms", "configure"];
    if (mode === "customize") base.push("bundles", "emotions");
    base.push("alters", "fronting", "backups");
    return base;
  }, [mode]);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const writeGateKeys = () => {
    try {
      if (ackChecked && !localStorage.getItem(DISCLAIMER_ACK_KEY)) {
        localStorage.setItem(DISCLAIMER_ACK_KEY, new Date().toISOString());
      }
      localStorage.setItem("terms_setup_done", "1");
      localStorage.setItem("tour_seen", "1"); // the Guide is pull, not push
      localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    } catch { /* storage off — flow still closes; boot guards handle it */ }
  };

  const finish = ({ openGuide = false } = {}) => {
    writeGateKeys();
    onDone?.({ openGuide });
    if (goToAlters) navigate("/Home");
  };

  const next = () => (isLast ? finish() : setStepIndex((i) => i + 1));
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  const chooseExpress = async () => {
    setBusy(true);
    try {
      await seedBundles(DEFAULT_ON_BUNDLE_IDS);
      markBundlesChosen();
      setMode("express");
      setStepIndex((i) => i + 1); // steps list has no sub-steps on this path
    } catch (e) {
      toast.error(e?.message || "Couldn't set up the defaults");
    } finally {
      setBusy(false);
    }
  };

  const applyCustomBundles = async () => {
    setBusy(true);
    try {
      const created = await createPresetItems([...selectedKeys]);
      markBundlesChosen();
      if (created > 0) toast.success(`Added ${created} item${created === 1 ? "" : "s"}`);
      setStepIndex((i) => i + 1);
    } catch (e) {
      toast.error(e?.message || "Couldn't add the selected items");
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = (key) =>
    setSelectedKeys((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(key)) nextSet.delete(key); else nextSet.add(key);
      return nextSet;
    });
  const toggleBundle = (_id, keys, select) =>
    setSelectedKeys((prev) => {
      const nextSet = new Set(prev);
      keys.forEach((k) => (select ? nextSet.add(k) : nextSet.delete(k)));
      return nextSet;
    });

  // ── Step contents ───────────────────────────────────────────────────────
  const stepBody = () => {
    switch (step) {
      case "welcome":
        return (
          <StepShell icon={<Shield className="w-6 h-6" />} title="Welcome to Oceans Symphony 💜">
            <p>
              Oceans Symphony is a <strong>local, private</strong> journaling, tracking, and life app
              designed for dissociative systems.
            </p>
            <ul className="space-y-1.5 text-sm">
              <li>🔒 <strong>Local</strong> means no servers and no online syncing — your data can't be sold or leaked, because it never leaves this device.</li>
              <li>📶 The app works fully offline, even with zero network connection.</li>
              <li>🗝️ No account, no sign-in. Optional password encryption lives in Settings.</li>
            </ul>
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
          </StepShell>
        );

      case "checkin":
        return (
          <StepShell icon={<Sparkles className="w-6 h-6" />} title="The Quick Check-In">
            <p>
              The Quick Check-In is one of the app's main tools. Open it any time and enter{" "}
              <strong>as much or as little as you'd like</strong>.
            </p>
            <p>
              Any data is useful data. The more you record, the more you have to look back on — to
              learn from, or to help bridge gaps left by amnesia.
            </p>
            <p>
              The emotions section works from <strong>general to specific</strong> ("Bad" → "Fearful" →
              "Anxious") — helpful when feelings are hard to name. There's also a Body &amp; Nervous
              System section for physical states.
            </p>
            <p className="text-muted-foreground text-sm">
              The entire Quick Check-In can be customized — which sections show, what you track, and
              what the words are. That's the next couple of steps.
            </p>
          </StepShell>
        );

      case "terms":
        return (
          <div className="max-w-md mx-auto">
            <TermsSetupContent
              existingSettingsId={settingsRow?.id || null}
              onSaved={next}
              saveLabel="Save & Continue"
            />
            <p className="text-xs text-muted-foreground text-center mt-3">
              Changeable any time in Settings → Profile → Terminology.
            </p>
          </div>
        );

      case "configure":
        return (
          <StepShell icon={<Package className="w-6 h-6" />} title="Set up your check-in">
            <p className="text-sm">
              The check-in tracks whatever you choose — organised as packs of{" "}
              <strong>things some {t.systems} track</strong>. Offered, never required.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={chooseExpress}
                disabled={busy}
                className="text-left rounded-xl border-2 border-primary/60 bg-primary/5 p-4 hover:bg-primary/10 transition-colors disabled:opacity-60"
              >
                <p className="font-semibold text-sm">⚡ Express (recommended)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start with the three core packs — Mood &amp; feelings, Dissociation, and Daily care —
                  plus the standard emotions. Adjust anything later.
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setMode("customize"); setStepIndex((i) => i + 1); }}
                disabled={busy}
                className="text-left rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors disabled:opacity-60"
              >
                <p className="font-semibold text-sm">🎛️ Customize</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Browse every pack (Trauma responses, Focus, Sensory, Body &amp; sleep, Context,
                  Safety…) and pick exactly what fits, then tune the emotions list.
                </p>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Either way: everything stays editable in Settings → Tracking setup → Check-in manager.
            </p>
          </StepShell>
        );

      case "bundles":
        return (
          <StepShell icon={<Package className="w-6 h-6" />} title="Pick what to track">
            <p className="text-sm text-muted-foreground">
              The recommended packs are pre-selected — untick anything, or open the other packs and
              add more. Nothing here is a diagnosis; it's just what you'd like to keep an eye on.
            </p>
            <BundleList
              existingKeys={existingKeys}
              selected={selectedKeys}
              onToggleItem={toggleItem}
              onToggleBundle={toggleBundle}
              terms={t}
            />
            <Button onClick={applyCustomBundles} disabled={busy} className="w-full">
              {busy ? "Adding…" : `Add ${selectedKeys.size} selected & continue`}
            </Button>
          </StepShell>
        );

      case "emotions":
        return (
          <StepShell icon={<Heart className="w-6 h-6" />} title="Emotions & the support prompt">
            <p className="text-sm text-muted-foreground">
              Some emotions are marked <strong>distressing</strong>. When you log one, the app offers a
              quick support prompt that can open a grounding exercise — one tap, never automatic. Tap
              emotions below to change which ones count, rename the four groups, or add your own.
            </p>
            <CustomEmotionsManager />
          </StepShell>
        );

      case "alters":
        return (
          <StepShell icon={<Users className="w-6 h-6" />} title={`Your ${t.alters}`}>
            <p>
              The <strong>{t.Alters}</strong> page is the {t.system} directory — every {t.alter} gets a
              profile with a name, pronouns, colours, and a page you can decorate and make theirs.
            </p>
            <p className="text-sm text-muted-foreground">
              You can add {t.alters} one by one, or import from Simply Plural, PluralKit, and other
              apps (Settings → Data &amp; privacy → Import).
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-border/60 p-3">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[var(--color-primary)]"
                checked={goToAlters}
                onChange={(e) => setGoToAlters(e.target.checked)}
              />
              <span>Take me to the {t.Alters} page when setup finishes</span>
            </label>
          </StepShell>
        );

      case "fronting":
        return (
          <StepShell icon={<Compass className="w-6 h-6" />} title={`${t.Fronting} tracking is optional`}>
            <p>
              Tracking who's {t.fronting} powers some features — but it's <strong>entirely optional</strong>,
              and plenty of {t.systems} don't do it.
            </p>
            <p className="text-sm">
              If you skip it, analytics still work: the app can associate check-ins, emotions, and
              symptoms with {t.alters} based on <strong>who authored things nearby</strong> — write as
              yourself, and patterns still build.
            </p>
            <p className="text-xs text-muted-foreground">
              That inference is on by default; the toggle and its time window live in Settings →
              Tracking setup ("Infer presence"). {t.Fronting} widgets can be hidden from the dashboard
              layout too.
            </p>
          </StepShell>
        );

      case "backups":
        return (
          <StepShell icon={<CloudOff className="w-6 h-6" />} title="One important thing: backups">
            <p>
              Local also means <strong>no cloud copy</strong>. If this device's data is lost, it's lost
            {" "}for good — so export backups, especially before switching devices.
            </p>
            <p className="text-sm text-muted-foreground">
              Automatic backups can save a copy on a schedule:
            </p>
            <AutoBackupSettings />
          </StepShell>
        );

      default:
        return null;
    }
  };

  // Steps where the primary Next button is hidden (they advance themselves).
  const selfAdvancing = step === "terms" || step === "configure" || step === "bundles";
  const nextDisabled = step === "welcome" && !ackChecked;

  return (
    <div className="fixed inset-0 z-[95] bg-background flex flex-col" role="dialog" aria-modal="true" aria-label="Oceans Symphony setup">
      {/* Header: back + progress + set-up-later */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 flex-shrink-0">
        {stepIndex > 0 ? (
          <button type="button" onClick={back} aria-label="Back" className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-7" />
        )}
        <div className="flex-1 flex items-center justify-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span
              key={s}
              className={`rounded-full transition-all ${i === stepIndex ? "w-4 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/30"}`}
              aria-hidden
            />
          ))}
        </div>
        {step !== "welcome" && !isLast ? (
          <button
            type="button"
            onClick={() => finish()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Set up later
          </button>
        ) : (
          <span className="w-7" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-6">
        <div className="max-w-md mx-auto">{stepBody()}</div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/50 flex-shrink-0">
        <div className="max-w-md mx-auto flex gap-2">
          {!selfAdvancing && !isLast && (
            <Button onClick={next} disabled={nextDisabled} className="flex-1">
              Continue
            </Button>
          )}
          {selfAdvancing && (
            <Button variant="outline" onClick={next} className="flex-1">
              Skip this step
            </Button>
          )}
          {isLast && (
            <>
              <Button variant="outline" onClick={() => finish({ openGuide: true })} className="flex-1">
                Finish &amp; open the Guide
              </Button>
              <Button onClick={() => finish()} className="flex-1">
                Done 💜
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepShell({ icon, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 text-[0.9375rem] leading-relaxed">{children}</div>
    </div>
  );
}
