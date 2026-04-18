export const DEFAULT_TECHNIQUES = [
  // --- BREATHING ---
  {
    name: "Box breathing",
    description: "A steady, rhythmic breath pattern that calms the nervous system.",
    category: "breathing",
    steps: [
      "Find a comfortable position and gently close your eyes if that feels okay.",
      "Inhale slowly through your nose for 4 counts.",
      "Hold your breath gently for 4 counts.",
      "Exhale slowly through your mouth for 4 counts.",
      "Hold again for 4 counts.",
      "Repeat this cycle. Let each breath be a little slower than the last."
    ],
    suggested_for: ["anxiety", "dissociation", "crisis", "switching", "derealization"],
    duration_seconds: 120,
    is_default: true,
    order: 1
  },
  {
    name: "4-7-8 breathing",
    description: "A calming pattern that activates your body's rest response.",
    category: "breathing",
    steps: [
      "Sit comfortably and let your shoulders drop.",
      "Inhale quietly through your nose for 4 counts.",
      "Hold your breath for 7 counts.",
      "Exhale completely through your mouth for 8 counts — let it all go.",
      "That's one cycle. Repeat 3–4 times.",
      "Notice how your body feels a little heavier and softer with each round."
    ],
    suggested_for: ["anxiety", "overwhelm"],
    duration_seconds: 90,
    is_default: true,
    order: 2
  },
  {
    name: "Physiological sigh",
    description: "A quick, powerful reset your nervous system already knows how to do.",
    category: "breathing",
    steps: [
      "Take a deep inhale through your nose.",
      "Before you exhale — take one more short inhale on top of that, to fully fill your lungs.",
      "Now let out a long, slow exhale through your mouth. Let it take as long as it wants.",
      "Pause for a moment.",
      "Repeat 3–5 times at whatever pace feels right.",
      "You may notice your shoulders drop or a sense of release — that's your nervous system settling."
    ],
    suggested_for: ["dissociation", "stuck", "anxiety"],
    duration_seconds: 60,
    is_default: true,
    order: 3
  },

  // --- SENSORY ---
  {
    name: "5-4-3-2-1 grounding",
    description: "Use your senses to gently anchor yourself to the present moment.",
    category: "sensory",
    steps: [
      "Look around and name 5 things you can see. Say them out loud or in your head.",
      "Now notice 4 things you can physically feel — your feet on the floor, clothing on your skin, the temperature of the air.",
      "Listen for 3 things you can hear — even subtle sounds, near or far.",
      "Notice 2 things you can smell. If nothing stands out, bring something close — your hand, your sleeve.",
      "Notice 1 thing you can taste.",
      "Take a slow breath. You are here."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety", "switching"],
    duration_seconds: 180,
    is_default: true,
    order: 4
  },

  // --- BODY ---
  {
    name: "Body scan",
    description: "Gently bring your attention back into your body, one part at a time.",
    category: "body",
    steps: [
      "Close your eyes if that feels comfortable, or let your gaze go soft.",
      "Start at the very top of your head. Just notice — no need to change anything.",
      "Slowly move your attention down to your forehead, your jaw, your neck.",
      "Continue down through your shoulders, chest, arms, hands.",
      "Move down to your belly, your lower back.",
      "Continue to your hips, thighs, knees, calves, and finally your feet.",
      "Take a slow breath. Notice that you're here, in this body, in this moment."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety", "overwhelm", "stuck"],
    duration_seconds: 180,
    is_default: true,
    order: 5
  },
  {
    name: "Cold water",
    description: "Temperature is one of the fastest ways to return to your body.",
    category: "body",
    steps: [
      "Go to a sink or find cold water.",
      "Run the water over your wrists and hands.",
      "Focus entirely on the temperature sensation — cold, crisp, real.",
      "Notice how the water feels against your skin.",
      "Take slow breaths while you do this.",
      "Stay for as long as it helps — 30 seconds to a few minutes."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety"],
    duration_seconds: 60,
    is_default: true,
    order: 6
  },
  {
    name: "Bilateral tapping",
    description: "A gentle rhythmic technique to help regulate and settle the system.",
    category: "body",
    steps: [
      "Sit comfortably and cross your arms over your chest, hands resting on your shoulders.",
      "Begin to alternate — gently tap your left shoulder, then your right.",
      "Left. Right. Left. Right. Find a slow, steady rhythm.",
      "Focus on the rhythm and the sensation of each tap.",
      "Continue at whatever pace feels calming to you.",
      "You can close your eyes if that feels safe, or keep them soft and open."
    ],
    suggested_for: ["dissociation", "anxiety", "switching", "crisis"],
    duration_seconds: 120,
    is_default: true,
    order: 7
  },

  // --- VISUALIZATION ---
  {
    name: "Safe place visualization",
    description: "Visit a place — real or imagined — where you feel calm and protected.",
    category: "visualization",
    steps: [
      "Close your eyes if that feels okay, or let your gaze go soft.",
      "Picture a place that feels safe and calm. It can be real, remembered, or completely made up.",
      "What does it look like? Notice the colors, the light, the shapes around you.",
      "What sounds are there? Maybe silence, maybe water, maybe wind.",
      "What does the air feel like? The temperature?",
      "Is there a smell — fresh air, warmth, something familiar?",
      "Let yourself rest here for a few minutes. You're allowed to be here.",
      "When you're ready, gently bring your attention back to the room."
    ],
    suggested_for: ["overwhelm", "crisis", "switching", "anxiety"],
    duration_seconds: 300,
    is_default: true,
    order: 8
  },

  // --- MOVEMENT ---
  {
    name: "Gentle movement",
    description: "Small movements to remind your body that it's here and it's okay.",
    category: "movement",
    steps: [
      "Start small — wiggle your fingers and toes.",
      "Roll your shoulders slowly backward, then forward.",
      "Gently turn your head to the right, then to the left. No rush.",
      "Place both feet flat on the floor and press down — feel the ground.",
      "Take a slow breath and notice your body taking up space.",
      "You're here. Your body is with you."
    ],
    suggested_for: ["stuck", "dissociation"],
    duration_seconds: 120,
    is_default: true,
    order: 9
  },

  // --- AFFIRMATION ---
  {
    name: "Grounding affirmations",
    description: "Words that gently remind you of what's true right now.",
    category: "affirmation",
    steps: [
      "Read each of these slowly. Pause between each one.",
      "\"I am safe right now.\"",
      "\"This feeling will pass.\"",
      "\"I am allowed to take up space.\"",
      "\"My system is doing its best.\"",
      "\"I can get through this moment.\"",
      "If any of these don't feel true yet, that's okay. Just let them be here with you."
    ],
    suggested_for: ["crisis", "overwhelm", "switching", "stuck", "anxiety"],
    duration_seconds: 120,
    is_default: true,
    order: 10
  }
];

export const EMOTIONAL_STATES = [
  {
    id: "dissociation",
    label: "Dissociating",
    description: "Feeling disconnected from your body or surroundings",
    emoji: "🌫️",
    suggested_breathing: "Physiological sigh",
  },
  {
    id: "derealization",
    label: "Feeling unreal",
    description: "Things feel dreamlike or not quite right",
    emoji: "🪞",
    suggested_breathing: "Box breathing",
  },
  {
    id: "anxiety",
    label: "Anxious or panicking",
    description: "Racing thoughts, heart pounding, hard to breathe",
    emoji: "💨",
    suggested_breathing: "4-7-8 breathing",
  },
  {
    id: "overwhelm",
    label: "Emotionally overwhelmed",
    description: "Too much at once, flooded",
    emoji: "🌊",
    suggested_breathing: "4-7-8 breathing",
  },
  {
    id: "crisis",
    label: "In crisis or feeling unsafe",
    description: "Having thoughts of hurting yourself",
    emoji: "🤍",
    suggested_breathing: "Box breathing",
    isCrisis: true,
  },
  {
    id: "switching",
    label: "Switching or system distress",
    description: "Lots of switching, system feeling chaotic",
    emoji: "🔄",
    suggested_breathing: "Box breathing",
  },
  {
    id: "stuck",
    label: "Feeling stuck",
    description: "Low energy, can't move forward, numb",
    emoji: "🪨",
    suggested_breathing: "Physiological sigh",
  },
];

export const BREATHING_PATTERNS = {
  "Box breathing": {
    name: "Box breathing",
    pattern: "4-4-4-4",
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Exhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  "4-7-8 breathing": {
    name: "4-7-8 breathing",
    pattern: "4-7-8",
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Hold", seconds: 7 },
      { label: "Exhale", seconds: 8 },
    ],
  },
  "Physiological sigh": {
    name: "Physiological sigh",
    pattern: "double inhale + long exhale",
    phases: [
      { label: "Inhale", seconds: 3 },
      { label: "Inhale again", seconds: 2 },
      { label: "Exhale", seconds: 8 },
    ],
  },
};

export const CATEGORY_LABELS = {
  breathing: "Breathing",
  sensory: "Sensory",
  body: "Body",
  visualization: "Visualization",
  movement: "Movement",
  affirmation: "Affirmations",
  custom: "Custom",
};

export const CATEGORY_EMOJIS = {
  breathing: "🌬️",
  sensory: "👁️",
  body: "🫧",
  visualization: "🌿",
  movement: "🤸",
  affirmation: "💬",
  custom: "✨",
};