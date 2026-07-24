// Preset tracking catalogue — 9 opt-in bundles of things some people track.
// (Phase B of the onboarding/customization initiative; replaces the flat
// 32-item list transcribed from a paper journal. Grounded in the domain
// structure of validated instruments + community vocabulary — see
// docs/onboarding-customization-knowledge-base.md Part 2.)
//
// Framing rule: these are OFFERED, never asserted — "things some people
// track", not "your symptoms". The app never implies a diagnosis. Wording
// is plain and neutral so it fits many system types; anything the user's
// custom terms cover is phrased to survive substitution.
//
// Each item: { label, kind, type, direction, scale?, color }
//   kind      → trackingModel TRACKING_KINDS (state/event/behaviour/context)
//   type      → Symptom.type ("rating" | "boolean")
//   direction → trackingModel TRACKING_DIRECTIONS
//   scale     → SCALE_BIPOLAR for two-ended constructs (default unipolar)
//
// Safety notes (Part D of the research):
//   - The safety bundle is opt-in, never gamified, and phrased per
//     safe-messaging guidance (no method detail, no means fields).
//   - Eating is tracked behaviourally and gently — never calories/weight.
//   - No fine-grained compulsion counters (tracking can feed OCD loops);
//     anything in that space stays coarse.
//   - "Functional seizure" is the community/clinical term — never the
//     outdated pejoratives.

import { SCALE_BIPOLAR } from "./trackingModel.js";

export const DEFAULT_ON_BUNDLE_IDS = ["mood", "dissociation", "daily_care"];

export const TRACKING_BUNDLES = [
  {
    id: "mood",
    label: "Mood & feelings",
    emoji: "💜",
    defaultOn: true,
    description: "The everyday emotional weather — mood, energy, and the feelings that colour a day.",
    items: [
      { label: "Overall mood", kind: "state", type: "rating", direction: "bipolar", scale: SCALE_BIPOLAR, color: "#8B5CF6" },
      { label: "Energy", kind: "state", type: "rating", direction: "bipolar", scale: SCALE_BIPOLAR, color: "#F59E0B" },
      { label: "Anxious / on edge", kind: "state", type: "rating", direction: "higher_worse", color: "#EF4444" },
      { label: "Low / depressed", kind: "state", type: "rating", direction: "higher_worse", color: "#6366F1" },
      { label: "Irritable", kind: "state", type: "rating", direction: "higher_worse", color: "#F97316" },
      { label: "Overwhelmed", kind: "state", type: "rating", direction: "higher_worse", color: "#DC2626" },
      { label: "Emotionally numb / flat", kind: "state", type: "rating", direction: "higher_worse", color: "#64748B" },
      { label: "Wired / elevated", kind: "state", type: "rating", direction: "higher_worse", color: "#EC4899" },
      { label: "Shame / self-critical", kind: "state", type: "rating", direction: "higher_worse", color: "#B45309" },
      { label: "Calm / settled", kind: "state", type: "rating", direction: "higher_better", color: "#10B981" },
      { label: "Self esteem", kind: "state", type: "rating", direction: "higher_better", color: "#A78BFA" },
    ],
  },
  {
    id: "dissociation",
    label: "Dissociation",
    emoji: "🌫️",
    defaultOn: true,
    description: "Dissociative experiences — detachment, memory, blending, and how the inner world feels.",
    items: [
      { label: "Detached from myself", kind: "state", type: "rating", direction: "higher_worse", color: "#7C3AED" },
      { label: "World feels unreal or foggy", kind: "state", type: "rating", direction: "higher_worse", color: "#6366F1" },
      { label: "Lost time", kind: "event", type: "boolean", direction: "higher_worse", color: "#3B82F6" },
      { label: "Memory gaps today", kind: "state", type: "rating", direction: "higher_worse", color: "#2563EB" },
      { label: "Spacey / zoned out", kind: "state", type: "rating", direction: "higher_worse", color: "#94A3B8" },
      { label: "Blending / blurry", kind: "state", type: "rating", direction: "neutral", color: "#A855F7" },
      { label: "Co-conscious", kind: "state", type: "boolean", direction: "neutral", color: "#0EA5E9" },
      { label: "Thoughts or urges that don't feel like mine", kind: "state", type: "rating", direction: "higher_worse", color: "#DB2777" },
      { label: "Loud inner world", kind: "state", type: "rating", direction: "higher_worse", color: "#C2410C" },
      { label: "{{Fronting}} feels exhausting", kind: "state", type: "rating", direction: "higher_worse", color: "#D97706" },
      { label: "Not sure who I am today", kind: "state", type: "rating", direction: "higher_worse", color: "#9333EA" },
    ],
  },
  {
    id: "trauma",
    label: "Trauma responses",
    emoji: "🛡️",
    defaultOn: false,
    description: "Trauma-related experiences — being on guard, flashbacks, nightmares, and shutdown.",
    items: [
      { label: "On guard / hypervigilant", kind: "state", type: "rating", direction: "higher_worse", color: "#DC2626" },
      { label: "Easily startled", kind: "state", type: "rating", direction: "higher_worse", color: "#F97316" },
      { label: "Emotional flashback (a wave of old feelings)", kind: "event", type: "boolean", direction: "higher_worse", color: "#B91C1C" },
      { label: "Vivid flashback (images or sensations)", kind: "event", type: "boolean", direction: "higher_worse", color: "#991B1B" },
      { label: "Nightmares", kind: "event", type: "boolean", direction: "higher_worse", color: "#1D4ED8" },
      { label: "Avoided something out of fear", kind: "behaviour", type: "boolean", direction: "higher_worse", color: "#7C3AED" },
      { label: "Shut down / frozen", kind: "state", type: "rating", direction: "higher_worse", color: "#60A5FA" },
      { label: "Disconnected from people", kind: "state", type: "rating", direction: "higher_worse", color: "#64748B" },
    ],
  },
  {
    id: "focus",
    label: "Focus & getting things done",
    emoji: "🎯",
    defaultOn: false,
    description: "Executive function — starting, focusing, time, and how the day's demands landed.",
    items: [
      { label: "Hard to get started", kind: "state", type: "rating", direction: "higher_worse", color: "#F59E0B" },
      { label: "Lost track of time", kind: "state", type: "rating", direction: "higher_worse", color: "#FBBF24" },
      { label: "Couldn't hold a train of thought", kind: "state", type: "rating", direction: "higher_worse", color: "#FB923C" },
      { label: "Hyperfocused (lost hours in one thing)", kind: "event", type: "boolean", direction: "neutral", color: "#8B5CF6" },
      { label: "Restless / fidgety", kind: "state", type: "rating", direction: "neutral", color: "#EC4899" },
      { label: "Criticism or rejection hit hard", kind: "event", type: "boolean", direction: "higher_worse", color: "#EF4444" },
      { label: "Motivation", kind: "state", type: "rating", direction: "higher_better", color: "#16A34A" },
    ],
  },
  {
    id: "sensory",
    label: "Sensory & environment",
    emoji: "🎧",
    defaultOn: false,
    description: "Sensory experience and social energy — overload, masking, meltdowns, shutdowns, burnout.",
    items: [
      { label: "Sensory overload", kind: "state", type: "rating", direction: "higher_worse", color: "#F97316" },
      { label: "Needed strong input (sensory seeking)", kind: "state", type: "rating", direction: "neutral", color: "#FB923C" },
      { label: "Masking / performing today", kind: "state", type: "rating", direction: "higher_worse", color: "#94A3B8" },
      { label: "Meltdown", kind: "event", type: "boolean", direction: "higher_worse", color: "#DC2626" },
      { label: "Shutdown", kind: "event", type: "boolean", direction: "higher_worse", color: "#60A5FA" },
      { label: "Running on empty (burnout)", kind: "state", type: "rating", direction: "higher_worse", color: "#78716C" },
      { label: "Social battery", kind: "state", type: "rating", direction: "higher_better", color: "#22C55E" },
      { label: "Routine held together today", kind: "context", type: "boolean", direction: "higher_better", color: "#0D9488" },
      { label: "Hard to tell what I'm feeling", kind: "state", type: "rating", direction: "higher_worse", color: "#A8A29E" },
    ],
  },
  {
    id: "body",
    label: "Body, sleep & energy",
    emoji: "🌙",
    defaultOn: false,
    description: "The body's side of things — sleep, pain, fatigue, crashes, and daily body care.",
    items: [
      { label: "Sleep quality", kind: "state", type: "rating", direction: "higher_better", color: "#0EA5E9" },
      { label: "Trouble sleeping", kind: "state", type: "rating", direction: "higher_worse", color: "#1D4ED8" },
      { label: "Fatigue", kind: "state", type: "rating", direction: "higher_worse", color: "#6B7280" },
      { label: "Crashed after overdoing it", kind: "event", type: "boolean", direction: "higher_worse", color: "#B45309" },
      { label: "Pain", kind: "state", type: "rating", direction: "higher_worse", color: "#DC2626" },
      { label: "Headache / migraine", kind: "state", type: "rating", direction: "higher_worse", color: "#9333EA" },
      { label: "Functional seizure", kind: "event", type: "boolean", direction: "higher_worse", color: "#7C3AED" },
      { label: "Tremor / weakness / movement symptoms", kind: "state", type: "rating", direction: "higher_worse", color: "#8B5CF6" },
      { label: "Ate regularly today", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#22C55E" },
      { label: "Drank enough water", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#06B6D4" },
      { label: "Took meds as planned", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#10B981" },
    ],
  },
  {
    id: "daily_care",
    label: "Daily care & coping",
    emoji: "🌱",
    defaultOn: true,
    description: "Protective things you did — care, coping, connection. Never scored like symptoms.",
    items: [
      { label: "Used a coping skill", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#06B6D4" },
      { label: "Did something grounding", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#14B8A6" },
      { label: "Moved my body", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#16A34A" },
      { label: "Attended therapy", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#0891B2" },
      { label: "Talked to someone I trust", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#0D9488" },
      { label: "Spent time with people", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#15803D" },
      { label: "Took care of a chore", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#4D7C0F" },
      { label: "Rested on purpose", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#4ADE80" },
      { label: "Time outside", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#22C55E" },
      { label: "Did something just for me", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#34D399" },
    ],
  },
  {
    id: "context",
    label: "Context & triggers",
    emoji: "🌦️",
    defaultOn: false,
    description: "What was going on around you — logged as context so patterns can be spotted, never scored as symptoms.",
    items: [
      { label: "Work / school stress", kind: "context", type: "boolean", direction: "higher_worse", color: "#0EA5E9" },
      { label: "Conflict with someone", kind: "context", type: "boolean", direction: "higher_worse", color: "#7C3AED" },
      { label: "Money / logistics stress", kind: "context", type: "boolean", direction: "higher_worse", color: "#2563EB" },
      { label: "Schedule change / routine break", kind: "context", type: "boolean", direction: "higher_worse", color: "#F59E0B" },
      { label: "Poor sleep last night", kind: "context", type: "boolean", direction: "higher_worse", color: "#1D4ED8" },
      { label: "Anniversary or hard date", kind: "context", type: "boolean", direction: "higher_worse", color: "#B91C1C" },
      { label: "Loud / busy environment", kind: "context", type: "boolean", direction: "higher_worse", color: "#F97316" },
    ],
  },
  {
    id: "safety",
    label: "Safety check-ins",
    emoji: "🤍",
    defaultOn: false,
    safetySensitive: true,
    description:
      "For keeping an honest, gentle eye on hard moments. Naming an urge can be protective — and logging one offers the quick support prompt. Entirely optional.",
    items: [
      { label: "Self-harm urges", kind: "state", type: "rating", direction: "higher_worse", color: "#DC2626", safetySensitive: true },
      { label: "Thoughts of not wanting to be here", kind: "state", type: "rating", direction: "higher_worse", color: "#991B1B", safetySensitive: true },
      { label: "Did something to keep myself safe", kind: "behaviour", type: "boolean", direction: "higher_better", color: "#10B981" },
      { label: "Alcohol / substance use", kind: "event", type: "boolean", direction: "neutral", color: "#6B7280" },
      { label: "Skipped meals", kind: "event", type: "boolean", direction: "higher_worse", color: "#B45309" },
    ],
  },
];

export const bundleById = (id) => TRACKING_BUNDLES.find((b) => b.id === id) || null;

// The Symptom.create payload for one preset item. `is_positive` stays
// stamped for legacy report logic; `category` keeps the existing
// symptom/habit tab split (behaviours land on the Habits tab).
export function itemToSymptomFields(item, bundleId, order = 999) {
  return {
    label: item.label,
    category: item.kind === "behaviour" ? "habit" : "symptom",
    type: item.type,
    kind: item.kind,
    direction: item.direction,
    ...(item.scale ? { scale: item.scale } : {}),
    is_positive: item.direction === "higher_better",
    color: item.color,
    order,
    is_default: true,
    is_archived: false,
    bundle_id: bundleId,
    ...(item.safetySensitive ? { safety_sensitive: true } : {}),
  };
}
