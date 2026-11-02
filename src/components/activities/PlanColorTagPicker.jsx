import React, { useState } from "react";
import { Check } from "lucide-react";
import { ColourRow } from "@/components/shared/SettingRows";
import { useT } from "@/lib/i18n";
import {
  PLAN_TAG_PRESETS, normalizeHex, readSavedTagColors, saveTagColor, deleteSavedTagColor,
} from "@/lib/planTagColor";

// Color tag for a plan — separate from the activity's own color.
//
// One colour, one control (owner report, 2026-11-02): the row is the shared
// ColourRow, so the swatch opens the app's one ColorPicker (wheel + hex
// field) and an unset tag shows dashed with no ×, like every other colour
// setting. It used to hand-roll its own picker — a bare system colour input,
// a second hex box with "Use", and a tiny × on every saved swatch that
// removed it on one tap. Presets and the person's saved colours stay as
// one-tap swatches below; saving or forgetting one lives in the picker.
export default function PlanColorTagPicker({ value, onChange, hint }) {
  const tr = useT();
  const [saved, setSaved] = useState(() => readSavedTagColors());
  const current = normalizeHex(value || "");
  const isSaved = !!current && saved.includes(current);

  const pick = (hex) => onChange(normalizeHex(hex));
  const Swatch = ({ hex }) => (
    <button
      type="button"
      onClick={() => pick(hex)}
      aria-label={tr("tagColor.swatch", { hex })}
      aria-pressed={current === hex}
      className={`w-8 h-8 rounded-full border flex items-center justify-center ${
        current === hex ? "ring-2 ring-offset-1 ring-offset-background ring-[var(--v2-accent)]" : "border-border/60"
      }`}
      style={{ backgroundColor: hex }}
    >
      {current === hex ? <Check className="w-3.5 h-3.5 text-white mix-blend-difference" /> : null}
    </button>
  );

  return (
    <div className="space-y-2">
      <ColourRow
        label={tr("planner.colorTag")}
        hint={hint}
        value={current}
        fallback="#8b5cf6"
        onChange={pick}
        onClear={current ? () => onChange(null) : undefined}
        extraAction={current ? {
          label: isSaved ? tr("tagColor.forget") : tr("tagColor.save"),
          onClick: () => setSaved(isSaved ? deleteSavedTagColor(current) : saveTagColor(current)),
        } : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        {PLAN_TAG_PRESETS.map((h) => <Swatch key={h} hex={h} />)}
      </div>
      {saved.length > 0 && (
        <div>
          <p className="text-[0.6875rem] text-muted-foreground mb-1">{tr("tagColor.saved")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {saved.map((h) => <Swatch key={h} hex={h} />)}
          </div>
        </div>
      )}
    </div>
  );
}
