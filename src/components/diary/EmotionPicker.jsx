import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const PRESET_EMOTIONS = [
  "Happy", "Sad", "Angry", "Anxious", "Calm", "Excited",
  "Confused", "Grateful", "Frustrated", "Hopeful", "Neutral", "Overwhelmed"
];

// Legacy export for any existing imports
export const EMOTIONS = PRESET_EMOTIONS.map(label => ({ label, emoji: "" }));

export default function EmotionPicker({ selected, onChange }) {
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const allEmotions = useMemo(() => {
    const customLabels = customEmotions.map(e => e.label);
    return [...PRESET_EMOTIONS, ...customLabels];
  }, [customEmotions]);

  const toggle = (label) => {
    onChange(
      selected.includes(label)
        ? selected.filter(e => e !== label)
        : [...selected, label]
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allEmotions.map((label) => (
        <button
          key={label}
          onClick={() => toggle(label)}
          className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
            selected.includes(label)
              ? "border-primary/60 bg-primary/10 text-primary font-medium"
              : "border-border text-muted-foreground hover:border-border/80"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}