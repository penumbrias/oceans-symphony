import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Pencil, Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
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
  // Preview panel has an ✏️ toggle — off by default, on when the user
  // already has overrides so returning to the step surfaces them as
  // tap-to-edit. Replaces the old "Advanced word forms" collapsible.
  const [editMode, setEditMode] = useState(
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
                Tap the <span className="underline decoration-dotted decoration-primary/60">highlighted</span> words to change how they're spelled. Grey ones are edited in Custom terms above.
              </p>
            )}
            <p>
              <span className="font-medium">System:</span>{" "}
              <InlineEditable value={terms.system} autoValue={terms.system} editable={false} editMode={editMode} ariaLabel="system" />
              {" · "}
              <InlineEditable value={pluralize(terms.system)} autoValue={pluralize(terms.system)} editable={false} editMode={editMode} ariaLabel="systems" />
            </p>
            <p>
              <span className="font-medium">Alter:</span>{" "}
              <InlineEditable value={terms.alter} autoValue={terms.alter} editable={false} editMode={editMode} ariaLabel="alter" />
              {" · "}
              <InlineEditable value={pluralize(terms.alter)} autoValue={pluralize(terms.alter)} editable={false} editMode={editMode} ariaLabel="alters" />
            </p>
            <p>
              <span className="font-medium">Switch:</span>{" "}
              <InlineEditable value={terms.switch} autoValue={terms.switch} editable={false} editMode={editMode} ariaLabel="switch" />
              {" · "}
              <InlineEditable value={pluralize(terms.switch)} autoValue={pluralize(terms.switch)} editable={false} editMode={editMode} ariaLabel="switches" />
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
              <InlineEditable value={terms.front} autoValue={terms.front} editable={false} editMode={editMode} ariaLabel="front" />
              {" · "}
              <InlineEditable value={pluralize(terms.front)} autoValue={pluralize(terms.front)} editable={false} editMode={editMode} ariaLabel="fronts" />
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