export const DEFAULT_TECHNIQUES = [
  // --- BREATHING ---
  {
    name: "Box breathing",
    description: "A steady, rhythmic breath pattern that calms the nervous system.",
    category: "breathing",
    steps: [
      "Find a comfortable position and gently close your eyes if that feels okay.",
      "Inhale slowly through your nose for 4 counts.",
      "Hold for 4 counts.",
      "Exhale slowly through your mouth for 4 counts.",
      "Hold for 4 counts.",
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
      "Inhale through your nose for 4 counts.",
      "Hold for 7 counts.",
      "Exhale completely through your mouth for 8 counts, making a gentle whooshing sound.",
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
      "Take a full inhale through your nose.",
      "Before exhaling, take one more short sharp inhale through your nose to fully top up the lungs.",
      "Exhale everything slowly and completely through your mouth.",
      "Pause for a moment.",
      "Repeat 3–5 times at whatever pace feels right.",
      "You may notice your shoulders drop or a sense of release — that's your nervous system settling."
    ],
    suggested_for: ["dissociation", "stuck", "anxiety"],
    duration_seconds: 60,
    is_default: true,
    order: 3
  },
  {
    name: "Deep belly breathing",
    description: "The simplest and most accessible breathing technique — a slow, deep breath that fills the belly rather than the chest.",
    category: "breathing",
    steps: [
      "Find a comfortable position sitting or lying down.",
      "Place one hand on your belly.",
      "Inhale slowly and deeply through your nose, letting your belly rise.",
      "Hold gently for 2 seconds.",
      "Exhale slowly through your mouth, letting your belly fall.",
      "Repeat for 5–10 breaths."
    ],
    suggested_for: ["anxiety", "dissociation", "overwhelm", "stuck", "crisis"],
    duration_seconds: 120,
    is_default: true,
    order: 4
  },
  {
    name: "Alternate nostril breathing",
    description: "A balancing technique that alternates breathing between nostrils, good for mental reset and reducing stress.",
    category: "breathing",
    steps: [
      "Sit comfortably.",
      "Rest your left hand on your knee.",
      "Close your right nostril with your right thumb and inhale through your left nostril.",
      "Close your left nostril with your ring finger, release your right nostril, exhale through your right nostril.",
      "Inhale through your right nostril.",
      "Close your right nostril, release your left, exhale through your left nostril.",
      "That is one round.",
      "Continue for 5–10 rounds."
    ],
    suggested_for: ["anxiety", "stuck", "overwhelm"],
    duration_seconds: 180,
    is_default: true,
    order: 5
  },
  {
    name: "Pursed lip breathing",
    description: "A simple technique that slows your breathing and increases oxygen flow, especially helpful for anxiety or shortness of breath.",
    category: "breathing",
    steps: [
      "Inhale gently through your nose for 2 counts.",
      "Purse your lips as if blowing out a candle.",
      "Exhale slowly through pursed lips for 4 counts.",
      "Keep the exhale controlled — twice as long as the inhale.",
      "Repeat several times."
    ],
    suggested_for: ["anxiety", "dissociation", "crisis"],
    duration_seconds: 120,
    is_default: true,
    order: 6
  },
  {
    name: "Resonant breathing",
    description: "A slow, steady breathing pattern of equal inhale and exhale that calms the nervous system and supports long-term stress recovery.",
    category: "breathing",
    steps: [
      "Inhale slowly through your nose for 5 counts.",
      "Exhale slowly through your nose for 5 counts.",
      "Keep a smooth, even rhythm — about 6 breaths per minute.",
      "Focus on keeping the breath gentle and steady.",
      "Continue for 5–10 minutes if possible, or as long as feels right."
    ],
    suggested_for: ["anxiety", "overwhelm", "stuck"],
    duration_seconds: 300,
    is_default: true,
    order: 7
  },
  {
    name: "Humming bee breath",
    description: "An unusual and deeply calming technique that uses gentle humming on the exhale to create soothing vibrations.",
    category: "breathing",
    steps: [
      "Sit comfortably and close your eyes if comfortable.",
      "Inhale through your nose.",
      "As you exhale through your nose, keep your lips gently closed and make a soft humming sound.",
      "Feel the vibrations in your face and head.",
      "Let the sound be quiet and easy, not forced.",
      "Repeat 5–10 times, letting each hum help you settle."
    ],
    suggested_for: ["anxiety", "overwhelm", "switching", "stuck"],
    duration_seconds: 180,
    is_default: true,
    order: 8
  },
  {
    name: "Breath counting",
    description: "A mindful breathing technique that uses counting to quiet racing thoughts and bring attention to the present moment.",
    category: "breathing",
    steps: [
      "Inhale naturally through your nose.",
      "On each inhale, silently count — one, two, three, up to ten.",
      "Exhale naturally through your nose.",
      "Then start again at one.",
      "If you lose count, gently return to one without judgment.",
      "Continue for 5–10 minutes, or as long as feels helpful."
    ],
    suggested_for: ["anxiety", "dissociation", "stuck", "derealization"],
    duration_seconds: 300,
    is_default: true,
    order: 9
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
    order: 10
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
    order: 11
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
    order: 12
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
    order: 13
  },

  // --- IMAGERY ---
  {
    name: "Orienting to the present",
    description: "A mental check-in that anchors you to the current moment by asking simple questions about where and when you are.",
    category: "imagery",
    steps: [
      "Ask yourself: What year is it? What month? What day?",
      "Ask: How old am I right now?",
      "Ask: Where am I? What is this place?",
      "Look around and name three things you can see right now.",
      "Notice: I am here, now, in this moment."
    ],
    suggested_for: ["dissociation", "derealization", "switching", "stuck"],
    duration_seconds: 60,
    is_default: true,
    order: 14
  },
  {
    name: "Peaceful place visualization",
    description: "Build a vivid mental image of a place — real or imagined — where you feel calm and safe.",
    category: "imagery",
    steps: [
      "Close your eyes if comfortable. Take a slow breath.",
      "Think of a place that feels peaceful to you — anywhere real or imagined.",
      "What do you see there? Notice the colors, the light, what's around you.",
      "What sounds are there? Notice them in detail.",
      "What does the air feel like? The temperature?",
      "Are there any smells? What does this place feel like in your body?",
      "Let yourself rest here for a few minutes. You are safe here.",
      "When ready, slowly bring your attention back to the room."
    ],
    suggested_for: ["overwhelm", "crisis", "anxiety", "switching"],
    duration_seconds: 300,
    is_default: true,
    order: 15
  },
  {
    name: "Split screen imagery",
    description: "A visualization for separating memories of the past from what's happening now — like watching two screens at once.",
    category: "imagery",
    steps: [
      "Get grounded first — take a slow breath and orient to the present.",
      "Imagine a large screen showing the present moment — where you are right now.",
      "In a small corner, imagine an old, slightly blurry image representing whatever from the past is coming up.",
      "Look at the big present-moment screen. Notice how NOW is different from THEN.",
      "What resources do you have now that you didn't have then?",
      "When ready, let the small past image fade or turn off. The big present screen remains.",
      "If you like, let the present image grow to fill the whole screen."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety", "overwhelm"],
    duration_seconds: 300,
    is_default: true,
    order: 16
  },
  {
    name: "Containment imagery",
    description: "A visualization for safely setting aside overwhelming thoughts until you have the resources to address them — like placing them in a secure container for safekeeping.",
    category: "imagery",
    steps: [
      "Take a slow breath and orient to the present.",
      "Imagine a strong, secure container — a vault, a locked box, a chest — something solid and safe.",
      "Notice its details: what is it made of? How does it close? Where is it?",
      "Gently imagine placing whatever feels overwhelming — thoughts, images, feelings, memories — into the container.",
      "Close and lock the container. It will hold these things safely until you're ready.",
      "Remind yourself: these feelings are contained, not gone. You can return to them with support when ready.",
      "Take a slow breath and bring your attention back to the room."
    ],
    suggested_for: ["crisis", "overwhelm", "dissociation", "switching"],
    duration_seconds: 240,
    is_default: true,
    order: 17
  },
  {
    name: "Gauge and regulator imagery",
    description: "Visualize internal dials and gauges to help you notice and gently adjust the intensity of overwhelming feelings.",
    category: "imagery",
    steps: [
      "Close your eyes if comfortable. Take a breath.",
      "Imagine a gauge — like a thermometer or pressure gauge — that shows how intense your feelings are right now.",
      "Now imagine a dial or control knob connected to that feeling.",
      "Slowly, gently, imagine turning the dial down — just a little. Not turning it off, just lowering the intensity.",
      "Notice any shift in your body as you do this.",
      "You can also imagine a lever that slows racing thoughts — gently pressing it, like a brake.",
      "Take a breath. You have more control than it sometimes feels like."
    ],
    suggested_for: ["anxiety", "overwhelm", "crisis"],
    duration_seconds: 180,
    is_default: true,
    order: 18
  },
  {
    name: "The pause button",
    description: "A simple mental image of pressing pause before acting on an overwhelming urge — giving yourself time to choose a healthy response.",
    category: "imagery",
    steps: [
      "When you notice an overwhelming feeling or urge, imagine a pause button.",
      "Press it. Everything slows down.",
      "Take a slow breath.",
      "Get grounded — orient to the present moment.",
      "Ask yourself: what healthy option do I have right now?",
      "Choose that option when you're ready."
    ],
    suggested_for: ["crisis", "anxiety", "overwhelm", "stuck"],
    duration_seconds: 60,
    is_default: true,
    order: 19
  },
  {
    name: "Slow swing imagery",
    description: "A gentle rocking visualization that can calm the nervous system, especially when deep breathing feels difficult.",
    category: "imagery",
    steps: [
      "Close your eyes if comfortable.",
      "Imagine yourself on a gentle swing, moving slowly back and forth.",
      "Feel the rhythm — forward, back, forward, back.",
      "Notice the gentle breeze as you move.",
      "Let your breathing slow to match the rhythm of the swing.",
      "Stay here as long as you need."
    ],
    suggested_for: ["anxiety", "dissociation", "stuck"],
    duration_seconds: 120,
    is_default: true,
    order: 20
  },

  // --- VISUALIZATION (existing) ---
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
    order: 21
  },

  // --- SENSORY (additional) ---
  {
    name: "Orienting with objects",
    description: "Using a physical object to anchor yourself in the present — something you can hold, touch, and focus on in detail.",
    category: "sensory",
    steps: [
      "Find an object near you — anything small you can hold.",
      "Look at it. What color is it? What shape?",
      "Turn it over in your hands. What does it feel like? Smooth? Rough? Warm? Cool?",
      "How heavy is it?",
      "Does it have a smell?",
      "Keep describing it to yourself in detail. This object is here. You are here."
    ],
    suggested_for: ["dissociation", "derealization", "switching"],
    duration_seconds: 120,
    is_default: true,
    order: 22
  },
  {
    name: "Feet on the ground",
    description: "A quick physical technique using the pressure of your feet on the floor to reconnect with your body and the present.",
    category: "sensory",
    steps: [
      "Plant both feet flat on the floor.",
      "Press them down gently, then harder, then gently again.",
      "Notice the feeling of the floor beneath you — solid, real, here.",
      "What does the floor feel like through your shoes or socks?",
      "Press down again. You are here. This floor is here. This moment is real."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety"],
    duration_seconds: 60,
    is_default: true,
    order: 23
  },
  {
    name: "Muscle release",
    description: "Tensing and releasing muscle groups to reconnect with your body and discharge nervous system activation.",
    category: "sensory",
    steps: [
      "Start with your hands. Make tight fists for 5 seconds.",
      "Release. Notice the difference.",
      "Move to your arms. Tense them for 5 seconds, then release.",
      "Shoulders — shrug them up to your ears for 5 seconds, then drop.",
      "Continue through your body if you like — legs, feet.",
      "Notice how your body feels now compared to when you started."
    ],
    suggested_for: ["anxiety", "overwhelm", "stuck"],
    duration_seconds: 120,
    is_default: true,
    order: 24
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
    order: 25
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
    order: 26
  },

  // --- BODY (additional) ---
  {
    name: "Butterfly hug",
    description: "A gentle self-administered technique using alternating taps to calm and comfort the nervous system.",
    category: "body",
    steps: [
      "Cross your arms over your chest so each hand rests near the opposite shoulder.",
      "Begin to tap gently and alternately — left hand, then right hand — in a slow, steady rhythm.",
      "Find a pace that feels calming, not rushed.",
      "Keep breathing normally as you tap.",
      "You can close your eyes if that feels safe, or let your gaze go soft.",
      "Continue for as long as it feels helpful — even a minute can make a difference.",
      "When you're ready to stop, bring your hands to rest in your lap and take one slow breath."
    ],
    suggested_for: ["anxiety", "crisis", "switching", "overwhelm"],
    duration_seconds: 120,
    is_default: true,
    order: 27
  },
  {
    name: "Self-soothing touch",
    description: "Gentle physical contact with yourself to activate the body's natural calming response.",
    category: "body",
    steps: [
      "Place one hand over your heart. Feel its warmth and gentle weight.",
      "Place your other hand on your belly.",
      "Take a slow breath and notice both your hands resting there.",
      "Feel the warmth from your palms spreading gently into your chest and belly.",
      "You can gently stroke your own arm if that feels okay — a slow, caring gesture.",
      "If you feel comfortable, give yourself a gentle hug, wrapping both arms around yourself.",
      "Breathe slowly. Notice any warmth or softening in your body."
    ],
    suggested_for: ["anxiety", "crisis", "overwhelm", "switching"],
    duration_seconds: 90,
    is_default: true,
    order: 28
  },
  {
    name: "Cold water face splash",
    description: "A quick, powerful way to interrupt a spiral by activating the body's natural calming dive reflex.",
    category: "body",
    steps: [
      "Go to a sink and fill it with cold water, or hold a cold, damp cloth.",
      "Take a breath, then briefly lower your face toward the water — or press the cold cloth gently against your forehead and cheeks.",
      "Hold for a few seconds. Even a moment of cold contact is enough.",
      "Breathe slowly through your nose.",
      "Notice the sensation — sharp, clear, present.",
      "Dry your face gently. Take a slow breath.",
      "Notice how your body feels now."
    ],
    suggested_for: ["crisis", "anxiety", "overwhelm", "dissociation"],
    duration_seconds: 60,
    is_default: true,
    order: 29
  },
  {
    name: "Hand warmth",
    description: "Warming your hands through friction and placing them gently on your face or eyes to activate the calming response.",
    category: "body",
    steps: [
      "Rub your palms together briskly for 10–15 seconds until they feel warm.",
      "Cup your warmed hands gently over your closed eyes.",
      "Let the warmth and darkness settle you. Breathe slowly.",
      "Notice the warmth. Notice the quiet.",
      "If you like, move your warm hands to rest on your cheeks.",
      "Stay here for as long as it feels good — 30 seconds to a few minutes.",
      "When you're ready, slowly lower your hands and open your eyes softly."
    ],
    suggested_for: ["dissociation", "derealization", "anxiety", "stuck"],
    duration_seconds: 90,
    is_default: true,
    order: 30
  },

  // --- SENSORY (additional) ---
  {
    name: "Smell grounding",
    description: "Using scent as an anchor to the present moment — one of the most direct routes to feeling 'here'.",
    category: "sensory",
    steps: [
      "Find something nearby with a distinct smell — lotion, tea, coffee, a candle, a piece of fruit, soap.",
      "Hold it close and breathe in slowly.",
      "Let the smell fill your awareness. This smell is here. You are here.",
      "Try to notice details — is it sharp or soft? Warm or cool? Sweet or earthy?",
      "Breathe in again. Notice any shift in your body as you do.",
      "If one smell isn't enough, try another. Different scents can have different effects.",
      "Pause and notice. You are in this moment, in this place."
    ],
    suggested_for: ["dissociation", "derealization", "switching"],
    duration_seconds: 90,
    is_default: true,
    order: 31
  },
  {
    name: "Mindful eating",
    description: "Using the sensory experience of eating to gently pull attention back into the body and the present moment.",
    category: "sensory",
    steps: [
      "Get something small to eat — a piece of fruit, a cracker, a square of chocolate.",
      "Before eating, look at it. Notice its color and shape.",
      "Hold it in your fingers. What does it feel like? Rough? Smooth? Cool or warm?",
      "Bring it close and notice if it has a smell.",
      "Take one small bite. Chew slowly and deliberately.",
      "Notice the taste — is it sweet, sharp, salty, bitter? Notice how it changes as you chew.",
      "Swallow slowly. Notice the sensation.",
      "Take a breath. You are here, tasting this, in this moment."
    ],
    suggested_for: ["dissociation", "stuck", "overwhelm", "derealization"],
    duration_seconds: 120,
    is_default: true,
    order: 32
  },

  // --- VISUALIZATION (additional) ---
  {
    name: "Tree rooting",
    description: "A grounding visualization that connects you to the earth and builds a sense of stability from the ground up.",
    category: "visualization",
    steps: [
      "Sit or stand with both feet flat on the floor.",
      "Close your eyes if comfortable, or let your gaze soften.",
      "Imagine that your feet are growing roots — slowly, gently downward, through the floor, into the earth.",
      "Let those roots reach down deeper with each breath. They spread wide and anchor you.",
      "Feel the solidity beneath you. The earth holds you. You don't have to hold yourself up alone.",
      "Notice your feet on the floor. The ground is real and solid.",
      "Breathe slowly. With each inhale, feel that connection. With each exhale, feel any tension release downward into the earth.",
      "When you're ready, gently bring your attention back to the room, keeping that sense of being grounded."
    ],
    suggested_for: ["dissociation", "anxiety", "derealization", "overwhelm"],
    duration_seconds: 180,
    is_default: true,
    order: 33
  },
  {
    name: "Necklace of good moments",
    description: "A gentle imagery technique for accessing warmth and safety through positive memories.",
    category: "visualization",
    steps: [
      "Take a slow breath and, if comfortable, close your eyes.",
      "Imagine a necklace with many small beads — each one holds a moment that was okay, or even good. It doesn't need to be a big memory.",
      "Let one bead come to you. Even a simple memory — warmth from sunshine, a moment of laughter, a feeling of being okay.",
      "Let yourself be in that memory for a moment. What did you see? What did it feel like?",
      "Notice any warmth in your body as you remember it.",
      "If you like, move to another bead — another small good moment.",
      "When you're ready, take a breath and come back to the room, bringing a little of that warmth with you."
    ],
    suggested_for: ["stuck", "crisis", "overwhelm", "switching"],
    duration_seconds: 240,
    is_default: true,
    order: 34
  },
  {
    name: "Inner still point",
    description: "Finding a quiet, steady place inside yourself even when everything else feels chaotic.",
    category: "visualization",
    steps: [
      "Take a slow breath and, if comfortable, close your eyes.",
      "Even in the middle of a storm, there's a still point at the center.",
      "Imagine finding that place inside you — very small, very quiet. It might be deep in your chest, or somewhere else that feels right.",
      "It doesn't need to be large. Just a point of steadiness, untouched by the noise around it.",
      "Let your attention rest there. Breathe gently.",
      "You don't need to make the storm go away. Just notice this small stillness.",
      "Stay here as long as you need. When you're ready, slowly bring your attention back."
    ],
    suggested_for: ["overwhelm", "switching", "crisis", "anxiety"],
    duration_seconds: 180,
    is_default: true,
    order: 35
  },

  // --- MOVEMENT (additional) ---
  {
    name: "Mindful walk",
    description: "Using slow, deliberate movement and attention to each step as a way to reconnect with your body and the present.",
    category: "movement",
    steps: [
      "Find a space where you can take a few steps — even a small room is fine.",
      "Begin to walk very slowly. Slower than feels natural.",
      "With each step, notice the sensation of your foot lifting, moving, and pressing down.",
      "Feel the ground under each foot as it lands.",
      "As you walk, look around and gently name things you see.",
      "Breathe slowly. Let your walk carry your whole attention.",
      "Continue for one to five minutes, or as long as it helps.",
      "When you stop, stand for a moment and press your feet into the floor."
    ],
    suggested_for: ["stuck", "anxiety", "dissociation", "overwhelm"],
    duration_seconds: 180,
    is_default: true,
    order: 36
  },

  // --- AFFIRMATION (additional) ---
  {
    name: "Compassionate inner voice",
    description: "Practicing speaking to yourself the way you would speak to someone you deeply care about.",
    category: "affirmation",
    steps: [
      "Take a slow breath.",
      "Think of someone you care about — a friend, a child, an animal.",
      "Now imagine they were going through exactly what you're going through right now.",
      "What would you say to them? How would you speak to them?",
      "Try saying some of that to yourself — out loud or in your head.",
      "Some possibilities: \"This is really hard. You're doing your best.\" \"It makes sense that you feel this way.\" \"You don't have to have it all figured out right now.\"",
      "If it feels difficult to say these things to yourself, that's okay. Just noticing what you'd say to someone else is enough."
    ],
    suggested_for: ["crisis", "overwhelm", "stuck", "anxiety", "switching"],
    duration_seconds: 120,
    is_default: true,
    order: 37
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
      { label: "Inhale through nose", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Exhale through mouth", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  "4-7-8 breathing": {
    name: "4-7-8 breathing",
    pattern: "4-7-8",
    phases: [
      { label: "Inhale through nose", seconds: 4 },
      { label: "Hold", seconds: 7 },
      { label: "Exhale through mouth", seconds: 8 },
    ],
  },
  "Physiological sigh": {
    name: "Physiological sigh",
    pattern: "double inhale + long exhale",
    phases: [
      { label: "Inhale through nose", seconds: 3 },
      { label: "Inhale again (nose)", seconds: 2 },
      { label: "Exhale through mouth", seconds: 8 },
    ],
  },
  "Deep belly breathing": {
    name: "Deep belly breathing",
    pattern: "slow, deep",
    phases: [
      { label: "Inhale through nose", seconds: 4 },
      { label: "Hold", seconds: 2 },
      { label: "Exhale through mouth", seconds: 4 },
    ],
  },
  "Alternate nostril breathing": {
    name: "Alternate nostril breathing",
    pattern: "alternating sides",
    phases: [
      { label: "Inhale left nostril", seconds: 4 },
      { label: "Exhale right nostril", seconds: 4 },
      { label: "Inhale right nostril", seconds: 4 },
      { label: "Exhale left nostril", seconds: 4 },
    ],
  },
  "Pursed lip breathing": {
    name: "Pursed lip breathing",
    pattern: "2-4",
    phases: [
      { label: "Inhale through nose", seconds: 2 },
      { label: "Exhale through lips", seconds: 4 },
    ],
  },
  "Resonant breathing": {
    name: "Resonant breathing",
    pattern: "5-5",
    phases: [
      { label: "Inhale through nose", seconds: 5 },
      { label: "Exhale through nose", seconds: 5 },
    ],
  },
  "Humming bee breath": {
    name: "Humming bee breath",
    pattern: "hum on exhale",
    phases: [
      { label: "Inhale through nose", seconds: 3 },
      { label: "Hum exhale (nose)", seconds: 4 },
    ],
  },
  "Breath counting": {
    name: "Breath counting",
    pattern: "count breaths",
    phases: [
      { label: "Breathe naturally (nose)", seconds: 4 },
    ],
  },
};

export const CATEGORY_LABELS = {
  breathing: "Breathing",
  sensory: "Sensory & Physical",
  body: "Body",
  imagery: "Imagery",
  visualization: "Visualization",
  movement: "Movement",
  affirmation: "Affirmations",
  custom: "Custom",
};

export const CATEGORY_EMOJIS = {
  breathing: "🌬️",
  sensory: "👁️",
  body: "🫧",
  imagery: "🌊",
  visualization: "🌿",
  movement: "🤸",
  affirmation: "💬",
  custom: "✨",
};