import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { pluralize, gerund, agent } from "@/lib/useTerms";

const PRESETS = [
  { label: "DID / OSDD (default)", system: "system", alter: "alter", switch: "switch", front: "front" },
  { label: "Headmates", system: "system", alter: "headmate", switch: "switch", front: "front" },
  { label: "Parts (IFS)", system: "system", alter: "part", switch: "shift", front: "influenc" },
  { label: "Collective", system: "collective", alter: "member", switch: "switch", front: "front" },
];

// The terms step body — shared between the legacy standalone modal and the
// Phase-C OnboardingFlow (which embeds it as its terminology step).
// `hideHeader` + `lead` let embedders (like the Guide) supply their own
// context copy instead of the standalone-modal defaults.
// `hideSaveButton` + `saveRef` let the Guide replace this component's
// inline "Save & Continue" button with the shell's own Next button —
// parent stashes the save handler on `saveRef.current` and invokes it
// from its own onNext, so users see one clear action instead of two.
export function TermsSetupContent({ onSaved, existingSettingsId, existingSettings = null, saveLabel = "Save & Continue", hideHeader = false, lead = null, hideSaveButton = false, saveRef = null }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(0);
  // Pre-fill from existingSettings so users returning to the terminology
  // step see what they already saved rather than a blank preset selection.
  const initialCustom = existingSettings ? {
    system: existingSettings.term_system || "",
    alter: existingSettings.term_alter || "",
    switch: existingSettings.term_switch || "",
    front: existingSettings.term_front || "",
  } : { system: "", alter: "", switch: "", front: "" };
  const initialHasBase = !!(existingSettings && (existingSettings.term_system || existingSettings.term_alter));
  const [custom, setCustom] = useState(initialCustom);
  const [useCustom, setUseCustom] = useState(initialHasBase);
  const initialOverrides = existingSettings ? {
    fronting: existingSettings.term_fronting || "",
    fronter: existingSettings.term_fronter || "",
    switching: existingSettings.term_switching || "",
  } : { fronting: "", fronter: "", switching: "" };
  const [overrides, setOverrides] = useState(initialOverrides);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(initialOverrides.fronting || initialOverrides.fronter || initialOverrides.switching)
  );
  const [saving, setSaving] = useState(false);

  const terms = useCustom ? custom : PRESETS[selected];
  const autoFronting = gerund(terms.front || "front");
  const autoFronter = agent(terms.front || "front");
  const autoSwitching = gerund(terms.switch || "switch");

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const data = {
      term_system: terms.system.trim() || "system",
      term_alter: terms.alter.trim() || "alter",
      term_switch: terms.switch.trim() || "switch",
      term_front: terms.front.trim() || "front",
      // Only persist an override when the user typed something DIFFERENT
      // from the auto-derived form — matches TermsSettings.jsx's rule so
      // the two paths agree on what's an intentional override vs
      // whitespace / accidental typing.
      term_fronting: overrides.fronting.trim() && overrides.fronting.trim() !== autoFronting ? overrides.fronting.trim() : "",
      term_fronter: overrides.fronter.trim() && overrides.fronter.trim() !== autoFronter ? overrides.fronter.trim() : "",
      term_switching: overrides.switching.trim() && overrides.switching.trim() !== autoSwitching ? overrides.switching.trim() : "",
    };
    try {
      if (existingSettingsId) {
        await base44.entities.SystemSettings.update(existingSettingsId, data);
      } else {
        await base44.entities.SystemSettings.create(data);
      }
      try { localStorage.setItem("terms_setup_done", "1"); } catch { /* storage off */ }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      onSaved?.();
    } catch (e) {
      // Silent failure here would let the guide advance while the terms
      // were never actually written — exactly the "works on dev, not on
      // phone" symptom the tester reported (native WebView storage /
      // encryption edge cases can throw where the dev preview doesn't).
      console.error("Terms save failed:", e);
      toast.error(`Couldn't save terminology: ${e?.message || "unknown error"}`);
      throw e; // re-throw so the shell keeps you on this step
    } finally {
      setSaving(false);
    }
  };

  // Expose the save handler to embedders (the Guide's Next button calls
  // this so users see one primary action, not "Save terms" + "Skip
  // terminology" side by side).
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => { if (saveRef) saveRef.current = null; };
  });

  return (
        <div className="space-y-5">
          {!hideHeader && (
            <div>
              <h2 className="text-xl font-semibold">Choose your language 💜</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {lead || "Oceans Symphony adapts to the terminology your system prefers. Pick a preset or define your own."}
              </p>
            </div>
          )}
          {hideHeader && lead && (
            <p className="text-sm text-muted-foreground">{lead}</p>
          )}

          {/* Presets */}
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelected(i); setUseCustom(false); }}
                className={`rounded-xl border p-3 text-left text-sm transition-all ${
                  !useCustom && selected === i
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <p className="font-medium text-xs mb-1">{p.label}</p>
                <p className="text-[0.6875rem] opacity-70">{p.alter} · {p.front}ing</p>
              </button>
            ))}
          </div>

          {/* Custom toggle */}
          <button
            onClick={() => setUseCustom((v) => !v)}
            className={`w-full text-sm rounded-xl border p-3 text-left transition-all ${
              useCustom ? "border-primary bg-primary/5" : "border-border/50 text-muted-foreground hover:border-primary/40"
            }`}
          >
            ✏️ Custom terms
          </button>

          {useCustom && (
            <div className="grid grid-cols-2 gap-3">
              {["system", "alter", "switch", "front"].map((key) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground capitalize mb-1 block">{key}</label>
                  <Input
                    placeholder={key}
                    value={custom[key]}
                    onChange={(e) => setCustom((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Advanced word-form overrides — only useful when the base term
              isn't a regular verb (e.g. Front = "active" auto-derives
              "activing" / "activer"; typing "activating" / "active fronter"
              here fixes it). Kept collapsed to keep the default flow
              simple; users who need it will look. Same three fields
              Settings → Terminology already exposes so the two paths
              save into identical SystemSettings columns. */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? "▾" : "▸"} Advanced word forms (override if the auto-plural looks off)
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2">
                <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
                  Auto-generation assumes the base is a regular verb — e.g. Front = "active" becomes "activing" / "activer". Type the forms you want instead. Leave blank to keep the auto-generated form.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fronting form</label>
                    <Input
                      value={overrides.fronting}
                      onChange={(e) => setOverrides((p) => ({ ...p, fronting: e.target.value }))}
                      placeholder={autoFronting}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fronter form</label>
                    <Input
                      value={overrides.fronter}
                      onChange={(e) => setOverrides((p) => ({ ...p, fronter: e.target.value }))}
                      placeholder={autoFronter}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Switching form</label>
                    <Input
                      value={overrides.switching}
                      onChange={(e) => setOverrides((p) => ({ ...p, switching: e.target.value }))}
                      placeholder={autoSwitching}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground space-y-0.5">
            <p>
              <span className="font-medium">System:</span>{" "}
              <span className="text-foreground font-medium">{terms.system}</span> · <span className="text-foreground font-medium">{pluralize(terms.system)}</span>
            </p>
            <p>
              <span className="font-medium">Alter:</span>{" "}
              <span className="text-foreground font-medium">{terms.alter}</span> · <span className="text-foreground font-medium">{pluralize(terms.alter)}</span>
            </p>
            <p>
              <span className="font-medium">Switch:</span>{" "}
              <span className="text-foreground font-medium">{terms.switch}</span> · <span className="text-foreground font-medium">{pluralize(terms.switch)}</span> · <span className="text-foreground font-medium">{overrides.switching.trim() || autoSwitching}</span>
            </p>
            <p>
              <span className="font-medium">Front:</span>{" "}
              <span className="text-foreground font-medium">{terms.front}</span> · <span className="text-foreground font-medium">{pluralize(terms.front)}</span> · <span className="text-foreground font-medium">{overrides.fronting.trim() || autoFronting}</span> · <span className="text-foreground font-medium">{overrides.fronter.trim() || autoFronter}</span>
            </p>
          </div>

          {!hideSaveButton && (
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Saving..." : saveLabel}
            </Button>
          )}
        </div>
  );
}

export default function TermsSetupModal({ open, onClose, existingSettingsId }) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} showCloseButton={false}>
        <TermsSetupContent onSaved={onClose} existingSettingsId={existingSettingsId} />
      </DialogContent>
    </Dialog>
  );
}