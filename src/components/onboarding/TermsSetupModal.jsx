import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Pencil, Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { NEW_SYSTEM_FRONT_LEVELS } from "@/lib/frontLevels";
import { useQueryClient } from "@tanstack/react-query";
import { pluralize, gerund, agent } from "@/lib/useTerms";

// Small tap-to-edit span used inside the preview panel. Renders as plain
// text out-of-edit-mode and when edit mode is off; in edit mode it
// highlights + gets a border and becomes clickable. Clicking swaps in an
// inline input; blur / Enter saves; Escape cancels. Empty save clears the
// override (falls back to the auto-derived form).
function InlineEditable({ value, autoValue, editable, editMode, onChange, ariaLabel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || autoValue || "");
  const inputRef = useRef(null);
  useEffect(() => { setDraft(value || autoValue || ""); }, [value, autoValue]);
  useEffect(() => { if (editing) inputRef.current?.focus?.(); }, [editing]);
  const display = value || autoValue || "";
  const commit = () => {
    const trimmed = draft.trim();
    // Empty draft → clear override so we fall back to auto-derived.
    // Draft equal to auto-derived → also clear (nothing to persist).
    if (!trimmed || trimmed === (autoValue || "")) onChange?.("");
    else onChange?.(trimmed);
    setEditing(false);
  };
  if (editable && editMode && editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value || autoValue || ""); setEditing(false); }
        }}
        className="inline-block w-24 px-1 py-0 h-5 text-xs bg-background border border-primary rounded outline-none"
        aria-label={ariaLabel}
      />
    );
  }
  if (editable && editMode) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Tap to edit"
        aria-label={`Edit ${ariaLabel || display}`}
        className="inline text-foreground font-medium underline decoration-dotted decoration-primary/60 underline-offset-2 hover:decoration-primary hover:decoration-solid transition-colors"
      >
        {display}
      </button>
    );
  }
  return <span className={editable ? "text-foreground font-medium" : "text-foreground font-medium opacity-70"}>{display}</span>;
}

const PRESETS = [
  { label: "DID / OSDD (default)", system: "system", alter: "alter", switch: "switch", front: "front" },
  { label: "Headmates", system: "system", alter: "headmate", switch: "switch", front: "front" },
  // "influence" — gerund()/agent() drop the silent e correctly
  // (influencing / influencer), so no truncated-root hack needed.
  { label: "Parts (IFS)", system: "system", alter: "part", switch: "shift", front: "influence" },
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
    // v0.87.2 plural overrides — for irregular plurals like child/children.
    systems: existingSettings.term_systems || "",
    alters: existingSettings.term_alters || "",
    switches: existingSettings.term_switches || "",
    fronts: existingSettings.term_fronts || "",
  } : { fronting: "", fronter: "", switching: "", systems: "", alters: "", switches: "", fronts: "" };
  const [overrides, setOverrides] = useState(initialOverrides);
  // Preview panel has an ✏️ toggle — off by default, on when the user
  // already has overrides so returning to the step surfaces them as
  // tap-to-edit. Replaces the old "Advanced word forms" collapsible.
  const [editMode, setEditMode] = useState(
    !!(initialOverrides.fronting || initialOverrides.fronter || initialOverrides.switching || initialOverrides.systems || initialOverrides.alters || initialOverrides.switches || initialOverrides.fronts)
  );
  const [saving, setSaving] = useState(false);

  const terms = useCustom ? custom : PRESETS[selected];
  const autoFronting = gerund(terms.front || "front");
  const autoFronter = agent(terms.front || "front");
  const autoSwitching = gerund(terms.switch || "switch");

  // Seed the custom object from whatever's currently VISIBLE before a
  // preview base-term edit flips useCustom on. The naive spread
  // ({ ...terms, ...p }) let p's EMPTY strings clobber the preset values
  // — editing "front" while on the Parts preset blanked System/Alter/
  // Switch entirely (tester screenshot, v0.88.8). Only take p's fields
  // when they actually hold text.
  const seedCustomFrom = (p) => ({
    system: p.system.trim() ? p.system : terms.system,
    alter: p.alter.trim() ? p.alter : terms.alter,
    switch: p.switch.trim() ? p.switch : terms.switch,
    front: p.front.trim() ? p.front : terms.front,
  });

  // Preview base-term edits are SURGICAL — changing "abc" → "bca" in the
  // preview must leave the current plural "abcs" alone (don't regenerate
  // to "bcas"). Do this by snapshotting the current auto-derived forms
  // into overrides BEFORE flipping the base. Only the top-four Custom
  // terms inputs regenerate downstream forms (that's the source-of-truth
  // path). Tester rule, v0.87.3.
  const snapshotDerivationsFor = (baseKey) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (baseKey === "system") {
        if (!next.systems.trim()) next.systems = pluralize(terms.system || "system");
      } else if (baseKey === "alter") {
        if (!next.alters.trim()) next.alters = pluralize(terms.alter || "alter");
      } else if (baseKey === "switch") {
        if (!next.switches.trim()) next.switches = pluralize(terms.switch || "switch");
        if (!next.switching.trim()) next.switching = autoSwitching;
      } else if (baseKey === "front") {
        if (!next.fronts.trim()) next.fronts = pluralize(terms.front || "front");
        if (!next.fronting.trim()) next.fronting = autoFronting;
        if (!next.fronter.trim()) next.fronter = autoFronter;
      }
      return next;
    });
  };

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
      // Plural overrides — only persist when the user typed something
      // different from the default pluralize() rule (append "s").
      term_systems: overrides.systems.trim() && overrides.systems.trim() !== pluralize(terms.system || "system") ? overrides.systems.trim() : "",
      term_alters: overrides.alters.trim() && overrides.alters.trim() !== pluralize(terms.alter || "alter") ? overrides.alters.trim() : "",
      term_switches: overrides.switches.trim() && overrides.switches.trim() !== pluralize(terms.switch || "switch") ? overrides.switches.trim() : "",
      term_fronts: overrides.fronts.trim() && overrides.fronts.trim() !== pluralize(terms.front || "front") ? overrides.fronts.trim() : "",
    };
    try {
      if (existingSettingsId) {
        await base44.entities.SystemSettings.update(existingSettingsId, data);
      } else {
        // A brand-new system starts on the three-level spectrum. Only here:
        // an existing system's saved (or defaulted) levels are never
        // rewritten, because their sessions may reference the old ids.
        await base44.entities.SystemSettings.create({
          ...data,
          front_levels: { levels: NEW_SYSTEM_FRONT_LEVELS },
        });
      }
      try { localStorage.setItem("terms_setup_done", "1"); } catch { /* storage off */ }
      // Await the refetch (not just invalidate) so the next Guide step
      // renders with the new terms already in the react-query cache.
      // Previously the shell advanced synchronously and the checklist
      // read STALE terms until an async refetch caught up — on native
      // that lag was visible as "Headmates setup" (the pre-existing
      // preset) when the user had just typed custom terms (tester
      // screenshot v0.86.9).
      await qc.invalidateQueries({ queryKey: ["systemSettings"] });
      await qc.refetchQueries({ queryKey: ["systemSettings"], type: "active" });
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
                {/* gerund(), not naive +"ing" — "influence" must read
                    "influencing", not "influenceing". */}
                <p className="text-[0.6875rem] opacity-70">{p.alter} · {gerund(p.front)}</p>
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
                    onChange={(e) => {
                      setCustom((p) => ({ ...p, [key]: e.target.value }));
                      // Top-four inputs ARE the source of truth: typing
                      // here clears the corresponding derivation overrides
                      // so pluralize() / gerund() / agent() regenerate from
                      // the new base. (Preview base-term taps use a
                      // different path that PRESERVES current derivations —
                      // see snapshotDerivationsFor.)
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (key === "system") next.systems = "";
                        if (key === "alter") next.alters = "";
                        if (key === "switch") { next.switches = ""; next.switching = ""; }
                        if (key === "front") { next.fronts = ""; next.fronting = ""; next.fronter = ""; }
                        return next;
                      });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Preview — tap ✏️ to enter edit mode, then tap any highlighted
              form to override the auto-derived plural/gerund/agent. Base
              terms and their plurals are dimmed (edit those in Custom
              terms above); the three overridable forms (switching,
              fronting, fronter) are highlighted with a dotted primary
              underline so it's clear what's tap-editable. */}
          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground space-y-0.5 relative">
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? "Done editing" : "Edit word forms"}
              aria-label={editMode ? "Finish editing word forms" : "Edit word forms"}
              className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                editMode
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
            {editMode && (
              <p className="text-[0.6875rem] text-primary mb-1 pr-8">
                Tap any <span className="underline decoration-dotted decoration-primary/60">highlighted</span> word to spell it exactly how you want it — including irregular plurals like child → children.
              </p>
            )}
            <p>
              <span className="font-medium">System:</span>{" "}
              <InlineEditable
                value={terms.system}
                autoValue={terms.system}
                editable={true}
                editMode={editMode}
                onChange={(v) => { snapshotDerivationsFor("system"); setCustom((p) => ({ ...seedCustomFrom(p), system: v || terms.system })); setUseCustom(true); }}
                ariaLabel="system"
              />
              {" · "}
              <InlineEditable
                value={overrides.systems}
                autoValue={pluralize(terms.system)}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, systems: v }))}
                ariaLabel="systems (plural)"
              />
            </p>
            <p>
              <span className="font-medium">Alter:</span>{" "}
              <InlineEditable
                value={terms.alter}
                autoValue={terms.alter}
                editable={true}
                editMode={editMode}
                onChange={(v) => { snapshotDerivationsFor("alter"); setCustom((p) => ({ ...seedCustomFrom(p), alter: v || terms.alter })); setUseCustom(true); }}
                ariaLabel="alter"
              />
              {" · "}
              <InlineEditable
                value={overrides.alters}
                autoValue={pluralize(terms.alter)}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, alters: v }))}
                ariaLabel="alters (plural)"
              />
            </p>
            <p>
              <span className="font-medium">Switch:</span>{" "}
              <InlineEditable
                value={terms.switch}
                autoValue={terms.switch}
                editable={true}
                editMode={editMode}
                onChange={(v) => { snapshotDerivationsFor("switch"); setCustom((p) => ({ ...seedCustomFrom(p), switch: v || terms.switch })); setUseCustom(true); }}
                ariaLabel="switch"
              />
              {" · "}
              <InlineEditable
                value={overrides.switches}
                autoValue={pluralize(terms.switch)}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, switches: v }))}
                ariaLabel="switches (plural)"
              />
              {" · "}
              <InlineEditable
                value={overrides.switching}
                autoValue={autoSwitching}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, switching: v }))}
                ariaLabel="switching form"
              />
            </p>
            <p>
              <span className="font-medium">Front:</span>{" "}
              <InlineEditable
                value={terms.front}
                autoValue={terms.front}
                editable={true}
                editMode={editMode}
                onChange={(v) => { snapshotDerivationsFor("front"); setCustom((p) => ({ ...seedCustomFrom(p), front: v || terms.front })); setUseCustom(true); }}
                ariaLabel="front"
              />
              {" · "}
              <InlineEditable
                value={overrides.fronts}
                autoValue={pluralize(terms.front)}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, fronts: v }))}
                ariaLabel="fronts (plural)"
              />
              {" · "}
              <InlineEditable
                value={overrides.fronting}
                autoValue={autoFronting}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, fronting: v }))}
                ariaLabel="fronting form"
              />
              {" · "}
              <InlineEditable
                value={overrides.fronter}
                autoValue={autoFronter}
                editable={true}
                editMode={editMode}
                onChange={(v) => setOverrides((p) => ({ ...p, fronter: v }))}
                ariaLabel="fronter form"
              />
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