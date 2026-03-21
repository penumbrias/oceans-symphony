import React from "react";

const EMOTIONS = [
  { label: "Happy", emoji: "😊" },
  { label: "Sad", emoji: "😢" },
  { label: "Angry", emoji: "😡" },
  { label: "Anxious", emoji: "😰" },
  { label: "Calm", emoji: "😌" },
  { label: "Tired", emoji: "😴" },
  { label: "Stressed", emoji: "😣" },
  { label: "Loved", emoji: "💙" },
  { label: "Numb", emoji: "😶" },
  { label: "Confused", emoji: "😕" },
  { label: "Hopeful", emoji: "🌱" },
  { label: "Overwhelmed", emoji: "🌊" },
];

export default function EmotionPicker({ selected, onChange }) {
  const toggle = (label) => {
    onChange(
      selected.includes(label)
        ? selected.filter((e) => e !== label)
        : [...selected, label]
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {EMOTIONS.map(({ label, emoji }) => (
        <button
          key={label}
          onClick={() => toggle(label)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all ${
            selected.includes(label)
              ? "border-primary/60 bg-primary/10 text-primary font-medium"
              : "border-border text-muted-foreground hover:border-border/80"
          }`}
        >
          <span>{emoji}</span> {label}
        </button>
      ))}
    </div>
  );
}