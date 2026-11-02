import React, { useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { Check, X, Plus } from "lucide-react";
import {
  PLAN_TAG_PRESETS, normalizeHex, readSavedTagColors, saveTagColor, deleteSavedTagColor,
} from "@/lib/planTagColor";

// Color tag for a plan — separate from the activity's own color. Presets,
// your saved colors (tap × to remove one), and any hex via the field or the
// system color picker.
export default function PlanColorTagPicker({ value, onChange }) {
  const [saved, setSaved] = useState(() => readSavedTagColors());
  const [hexDraft, setHexDraft] = useState("");
  const current = normalizeHex(value || "");

  const pick = (hex) => onChange(normalizeHex(hex));
  const Swatch = ({ hex, removable }) => (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => pick(hex)}
        aria-label={`Color ${hex}`}
        className={`w-7 h-7 rounded-full border flex items-center justify-center ${current === hex ? "ring-2 ring-offset-1 ring-primary" : "border-border/60"}`}
        style={{ backgroundColor: hex }}
      >
        {current === hex ? <Check className="w-3.5 h-3.5 text-white mix-blend-difference" /> : null}
      </button>
      {removable && (
        <button
          type="button"
          onClick={async () => {
            if (!(await confirm({ title: "Delete this saved color?", body: `${hex} will be removed from your saved colors. Plans already using it keep their color.`, confirmLabel: "Delete", destructive: true }))) return;
            setSaved(deleteSavedTagColor(hex));
          }}
          aria-label={`Delete saved color ${hex}`}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-border text-muted-foreground flex items-center justify-center"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );

  const applyHex = () => {
    const h = normalizeHex(hexDraft);
    if (h) { pick(h); setHexDraft(""); }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`h-7 px-2.5 rounded-full border text-xs ${!current ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}
        >
          None
        </button>
        {PLAN_TAG_PRESETS.map((h) => <Swatch key={h} hex={h} />)}
      </div>
      {saved.length > 0 && (
        <div>
          <p className="text-[0.6875rem] text-muted-foreground mb-1">Saved colors</p>
          <div className="flex flex-wrap items-center gap-2">
            {saved.map((h) => <Swatch key={h} hex={h} removable />)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={current || "#8b5cf6"}
          onChange={(e) => pick(e.target.value)}
          aria-label="Pick any color"
          className="w-9 h-9 shrink-0 rounded-lg border border-input bg-background p-0.5"
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyHex(); } }}
          placeholder={current || "#hex"}
          maxLength={7}
          aria-label="Hex color"
          className="flex-1 min-w-[5rem] h-9 px-3 rounded-lg border border-input bg-background text-sm"
        />
        <button type="button" onClick={applyHex} className="h-9 shrink-0 whitespace-nowrap px-2.5 rounded-lg border border-border/60 text-xs">Use</button>
        <button
          type="button"
          disabled={!current}
          onClick={() => setSaved(saveTagColor(current))}
          className="h-9 shrink-0 whitespace-nowrap px-2.5 rounded-lg border border-border/60 text-xs inline-flex items-center gap-1 disabled:opacity-40"
        >
          <Plus className="w-3 h-3" /> Save
        </button>
      </div>
    </div>
  );
}
