// The bodies of the five welcome steps (v0.370.0), rendered inside the
// Guide's SetupWizardShell (TourModal). Each one reuses the real thing:
// the backup choice (BackupDecisionStep), the check-in's feeling picker
// (EmotionWheelPicker, saved through logEmotionCheckIn), the tracking packs
// (BundleList) and the new-alter writer (createAlter). Nothing here writes
// except on a tap the person makes.

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { getBackupDecision, BACKUP_DECISIONS } from "@/lib/autoBackup";
import { logEmotionCheckIn } from "@/lib/checkinEntry";
import { createAlter } from "@/lib/alterEntry";
import { markFirstEntry } from "@/lib/onboardingState";
import BackupDecisionStep from "@/components/onboarding/BackupDecisionStep";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import { BundleList } from "@/components/symptoms/BundlePicker";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";

const ImportAltersModal = React.lazy(() => import("@/components/alters/ImportAltersModal"));

// One choice among a few, as full-width rows (no pill tabs).
function ChoiceList({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`w-full text-left rounded-lg border px-3 py-2.5 min-h-[44px] transition-colors ${on ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${on ? "border-primary bg-primary" : "border-border"}`}>
                {on && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className="text-sm font-medium">{o.label}</span>
            </span>
            {o.hint && <span className="block text-xs text-muted-foreground mt-0.5 pl-6">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Step 1: Keep it safe ─────────────────────────────────────────────
const DECISION_WORDS = {
  [BACKUP_DECISIONS.AUTO]: "Automatic backups are on.",
  [BACKUP_DECISIONS.REMINDER]: "You'll get a reminder to save a backup.",
  [BACKUP_DECISIONS.DECLINED]: "No backups for now.",
};

export function KeepSafeStep() {
  const t = useTerms();
  const [decision, setDecision] = useState(() => getBackupDecision());
  const [changing, setChanging] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Everything about your {t.system} stays on this device. There's no account and no cloud copy, so a backup file is what keeps it safe if the phone is lost or its storage is cleared.
      </p>
      {!changing ? (
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-sm">{DECISION_WORDS[decision] || "You haven't chosen how to back up yet."}</p>
          <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
            {decision ? "Change" : "Choose"}
          </Button>
        </div>
      ) : (
        <BackupDecisionStep compact onDone={(choice) => { setDecision(choice || getBackupDecision()); setChanging(false); }} />
      )}
    </div>
  );
}

// ── Step 2: One thing first ──────────────────────────────────────────
export function NoticeStep() {
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 text-sm text-foreground list-disc pl-5">
        <li>This app is for keeping track, together. It is not a medical product.</li>
        <li>It doesn't diagnose or treat anything, and it doesn't replace care from a professional.</li>
        <li>If you're in danger, contact your local emergency services.</li>
      </ul>
      <details className="rounded-lg border border-border/60">
        <summary className="px-3 py-2.5 cursor-pointer text-sm font-medium text-primary">Read the full notice</summary>
        <div className="px-3 pb-3"><MedicalDisclaimer compact /></div>
      </details>
    </div>
  );
}

// ── Step 4: How are you right now? ───────────────────────────────────
// `tracking`: { choice, setChoice, existingKeys, selected, onToggleItem,
// onToggleBundle, hasSymptoms } from TourModal, which applies the choice
// on Next.
export function FeelingStep({ tracking }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"], queryFn: () => base44.entities.CustomEmotion.list(),
  });

  // The same "add your own feeling" the check-in does: reuse a match,
  // otherwise one new CustomEmotion, ticked.
  const addCustom = async (label, category = "custom", color) => {
    try {
      const existing = customEmotions.find((e) => String(e.label).toLowerCase() === String(label).toLowerCase());
      const emotion = existing || await base44.entities.CustomEmotion.create({ label, category, ...(color ? { color } : {}) });
      setSelected((prev) => (prev.includes(emotion.label) ? prev : [...prev, emotion.label]));
      qc.invalidateQueries({ queryKey: ["customEmotions"] });
    } catch (e) { toast.error(e?.message || "Couldn't add that feeling."); }
  };

  const save = async () => {
    if (!selected.length || saving) return;
    setSaving(true);
    try {
      await logEmotionCheckIn({ emotions: selected, customEmotions });
      await markFirstEntry();
      qc.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      setSavedCount((n) => n + 1);
      setSelected([]);
    } catch (e) {
      toast.error(e?.message || "Couldn't save that feeling.");
    } finally { setSaving(false); }
  };

  const options = [
    { value: "express", label: "Use the starter packs", hint: "Mood, dissociation and daily care. Change them any time." },
    { value: "custom", label: "Choose my own", hint: "Pick from the packs, one thing at a time." },
    { value: "later", label: tracking.hasSymptoms ? "Keep what I have" : "Later", hint: tracking.hasSymptoms ? "Nothing changes." : "Nothing is added. Settings → Check-in manager has it all when you're ready." },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Tap one or more, then save. This is your first check-in; you can skip it.</p>
        <EmotionWheelPicker
          selectedEmotions={selected}
          onToggle={(label) => setSelected((prev) => (prev.includes(label) ? prev.filter((e) => e !== label) : [...prev, label]))}
          customEmotions={customEmotions}
          onAddCustom={addCustom}
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={!selected.length || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Save this feeling
          </Button>
          <span className="text-xs text-primary" aria-live="polite">{savedCount > 0 ? "Saved 💜" : ""}</span>
        </div>
      </div>
      <div className="space-y-2 pt-1 border-t border-border/40">
        <p className="text-sm font-medium pt-3">What should check-ins ask about?</p>
        <p className="text-xs text-muted-foreground">Beyond feelings, a check-in can track things like dissociation, sleep or pain for your {t.system}.</p>
        <ChoiceList label="What check-ins track" options={options} value={tracking.choice} onChange={tracking.setChoice} />
        {tracking.choice === "custom" && (
          <BundleList existingKeys={tracking.existingKeys} selected={tracking.selected}
            onToggleItem={tracking.onToggleItem} onToggleBundle={tracking.onToggleBundle} terms={t} />
        )}
      </div>
    </div>
  );
}

// ── Step 5: Who's here? ──────────────────────────────────────────────
// `name` / `setName` live in TourModal so Finish can add a typed name the
// person didn't press Add for.
export async function addAlterByName(name, qc) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const created = await createAlter({ name: clean });
  qc.invalidateQueries({ queryKey: ["alters"] });
  return created;
}

export function WhoStep({ name, setName, added, onAdded }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await addAlterByName(name, qc);
      if (created) { onAdded(created.name || name.trim()); setName(""); }
    } catch (e) {
      toast.error(e?.message || `Couldn't add that ${t.alter}.`);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Add one {t.alter} by name</span>
        <span className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A name, or a nickname"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button onClick={add} disabled={!name.trim() || busy} className="flex-shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
        </span>
      </label>
      {added.length > 0 && (
        <p className="text-sm" aria-live="polite">Added: {added.join(", ")}</p>
      )}
      <Button variant="outline" className="w-full justify-start" onClick={() => setShowImport(true)}>
        <Upload className="w-4 h-4 mr-2" /> Bring them in from another app
      </Button>
      <p className="text-xs text-muted-foreground leading-relaxed">
        You can add more any time from the {t.Alters} page. Tracking who's {t.fronting} is optional, and anything anyone writes belongs to whoever writes it.
      </p>
      {showImport && (
        <React.Suspense fallback={null}>
          <ImportAltersModal open={showImport} onClose={() => { setShowImport(false); qc.invalidateQueries({ queryKey: ["alters"] }); }} contentClassName="z-[130]" />
        </React.Suspense>
      )}
    </div>
  );
}
