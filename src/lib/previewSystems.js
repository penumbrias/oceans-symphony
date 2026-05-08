// Curated example "systems" used by Preview Mode.
//
// Each entry is a self-contained snapshot of what a populated app might look
// like for someone with that kind of system. Each system uses its own
// terminology (system / alter / fronting / switching) so users can see how
// the app feels with different vocabularies.
//
// Data is generated relative to "now" so the timeline always shows recent
// activity, regardless of when the user enables Preview Mode.

const DAY = 86400000;
const HOUR = 3600000;
const MINUTE = 60000;

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoOffset(daysAgo, hour = 12, min = 0) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

// Helper: build a record with the standard local-db fields.
function rec(fields) {
  const now = nowIso();
  return {
    id: uid("p"),
    created_date: now,
    updated_date: now,
    created_by: "preview@symphony.app",
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// SYSTEM 1: The Crescent — standard DID terminology
// ---------------------------------------------------------------------------
function buildCrescent() {
  const alters = {
    marin:  rec({ name: "Marin",  pronouns: "she/they",   color: "#8b5cf6", role: "Host",         description: "The everyday face of the system. Steady, organized, the one who shows up to work and remembers the dentist appointment.", origin_year: 1996, tags: ["host", "everyday"] }),
    river:  rec({ name: "River",  pronouns: "they/them",  color: "#0ea5e9", role: "Protector",    description: "Calm, watchful, takes over when things feel unsafe. Likes long walks and quiet music.", origin_year: 2008, tags: ["protector"] }),
    sage:   rec({ name: "Sage",   pronouns: "she/her",    color: "#10b981", role: "Caretaker",    description: "Soft-spoken and warm. The one who reminds the body to eat, drink, and sleep. Loves tea.", origin_year: 2012, tags: ["caretaker"] }),
    pip:    rec({ name: "Pip",    pronouns: "he/him",     color: "#f59e0b", role: "Little",       description: "Seven years old, bright, curious, and a little anxious about loud noises. Loves dinosaurs.", origin_year: 2003, age_apparent: 7, tags: ["little"] }),
    echo:   rec({ name: "Echo",   pronouns: "she/her",    color: "#ec4899", role: "Introject",    description: "Came in during a hard time. Quieter now than she used to be, but still a steady presence in the back.", origin_year: 2015, tags: ["introject"] }),
  };

  // FrontingSession history — last 14 days, varied switches
  const fronting = [];
  function addSession(alterId, daysAgo, startHour, durationHours, isPrimary = true) {
    const start = new Date(Date.now() - daysAgo * DAY);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start.getTime() + durationHours * HOUR);
    fronting.push(rec({
      alter_id: alterId,
      is_primary: isPrimary,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_active: false,
    }));
  }
  // Active session right now (Marin, started 2 hours ago)
  fronting.push(rec({
    alter_id: alters.marin.id,
    is_primary: true,
    start_time: new Date(Date.now() - 2 * HOUR).toISOString(),
    end_time: null,
    is_active: true,
  }));
  // Last 14 days — a believable mix
  const schedule = [
    [1, 7, 5, "marin"], [1, 12, 2, "sage"], [1, 14, 4, "marin"], [1, 19, 1, "river"],
    [2, 7, 9, "marin"], [2, 17, 2, "pip"], [2, 19, 3, "river"],
    [3, 8, 6, "marin"], [3, 14, 3, "sage"], [3, 18, 4, "marin"],
    [4, 9, 5, "river"], [4, 15, 6, "marin"],
    [5, 7, 4, "marin"], [5, 11, 2, "echo"], [5, 14, 5, "sage"], [5, 20, 1, "river"],
    [6, 8, 8, "marin"], [6, 17, 3, "pip"],
    [7, 9, 6, "marin"], [7, 15, 5, "sage"],
    [8, 7, 5, "river"], [8, 13, 3, "marin"], [8, 17, 4, "echo"],
    [9, 8, 7, "marin"], [9, 16, 4, "sage"],
    [10, 7, 4, "marin"], [10, 12, 6, "marin"], [10, 19, 2, "pip"],
    [11, 8, 5, "river"], [11, 14, 6, "marin"],
    [12, 9, 4, "marin"], [12, 14, 3, "sage"], [12, 18, 4, "marin"],
    [13, 7, 6, "marin"], [13, 14, 4, "echo"], [13, 19, 2, "river"],
    [14, 8, 8, "marin"], [14, 17, 4, "sage"],
  ];
  schedule.forEach(([d, h, dur, who]) => addSession(alters[who].id, d, h, dur));

  // Co-fronter examples (Sage co-fronts during caretaking moments)
  fronting.push(rec({
    alter_id: alters.sage.id, is_primary: false,
    start_time: new Date(Date.now() - 1 * DAY - 12 * HOUR).toISOString(),
    end_time: new Date(Date.now() - 1 * DAY - 10 * HOUR).toISOString(),
    is_active: false,
  }));

  const emotions = [
    rec({ timestamp: isoOffset(0, 9), mood: 6, energy: 5, emotions: ["calm", "focused"], note: "Settling into the morning." }),
    rec({ timestamp: isoOffset(0, 14), mood: 4, energy: 3, emotions: ["overwhelmed"], note: "Lots of email today." }),
    rec({ timestamp: isoOffset(1, 11), mood: 7, energy: 6, emotions: ["content"] }),
    rec({ timestamp: isoOffset(2, 18), mood: 3, energy: 4, emotions: ["sad", "tired"], note: "Old memory came up." }),
    rec({ timestamp: isoOffset(3, 10), mood: 8, energy: 7, emotions: ["happy", "grateful"] }),
    rec({ timestamp: isoOffset(4, 15), mood: 5, energy: 4, emotions: ["anxious"] }),
    rec({ timestamp: isoOffset(5, 9), mood: 7, energy: 6, emotions: ["calm"] }),
    rec({ timestamp: isoOffset(6, 13), mood: 6, energy: 5, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(7, 19), mood: 4, energy: 3, emotions: ["dissociative"], note: "Foggy after the meeting." }),
    rec({ timestamp: isoOffset(8, 11), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(10, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(12, 8), mood: 6, energy: 6, emotions: ["calm", "hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 7, 30), activity_name: "Morning walk",      duration_minutes: 30, color: "#10b981", notes: "Saw two dogs and a heron." }),
    rec({ timestamp: isoOffset(0, 13),   activity_name: "Therapy session",   duration_minutes: 50, color: "#8b5cf6" }),
    rec({ timestamp: isoOffset(1, 8),    activity_name: "Yoga",              duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(2, 10),   activity_name: "Reading",           duration_minutes: 40, color: "#f59e0b" }),
    rec({ timestamp: isoOffset(3, 16),   activity_name: "Drawing",           duration_minutes: 60, color: "#ec4899", notes: "Sage painted the river." }),
    rec({ timestamp: isoOffset(4, 11),   activity_name: "Meditation",        duration_minutes: 20, color: "#10b981" }),
    rec({ timestamp: isoOffset(5, 19),   activity_name: "Watched a movie",   duration_minutes: 110, color: "#8b5cf6" }),
    rec({ timestamp: isoOffset(6, 10),   activity_name: "Grocery shopping",  duration_minutes: 45, color: "#f59e0b" }),
    rec({ timestamp: isoOffset(7, 18),   activity_name: "Therapy session",   duration_minutes: 50, color: "#8b5cf6" }),
    rec({ timestamp: isoOffset(9, 14),   activity_name: "Cooking dinner",    duration_minutes: 60, color: "#10b981" }),
    rec({ timestamp: isoOffset(11, 9),   activity_name: "Morning walk",      duration_minutes: 35, color: "#10b981" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(0, 21), title: "A quiet day",    content: "Marin held the front for most of today. Felt steady. Sage came up briefly around lunch to remind us to eat — grateful for that.", tags: ["good day"], alter_id: alters.marin.id }),
    rec({ created_date: isoOffset(2, 22), title: "Hard afternoon", content: "An old memory surfaced. River stepped in to keep things calm. We made it through.", tags: ["trigger", "protector"], alter_id: alters.river.id }),
    rec({ created_date: isoOffset(5, 20), title: "Pip's drawing",  content: "Pip wanted to draw dinosaurs today. We let him. The triceratops is very good.", tags: ["littles"], alter_id: alters.pip.id }),
    rec({ created_date: isoOffset(8, 21), title: "Therapy notes",  content: "Talked about the role each of us plays. Echo is still figuring out who she wants to be now.", tags: ["therapy"], alter_id: alters.marin.id }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 6, communication_quality: 7, system_harmony: 7, note: "Calm start. Marin and Sage in agreement about today's plan." }),
    rec({ created_date: isoOffset(3, 21), mood: 5, communication_quality: 6, system_harmony: 6, note: "Some friction this morning, resolved by midday." }),
    rec({ created_date: isoOffset(7, 20), mood: 7, communication_quality: 8, system_harmony: 8, note: "Good system meeting. Echo spoke up for the first time in a while." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 11), note: "Foggy but functional." }),
    rec({ timestamp: isoOffset(2, 18), note: "Sage made tea. Helped." }),
    rec({ timestamp: isoOffset(5, 10), note: "Pip is co-conscious and excited about the museum trip." }),
    rec({ timestamp: isoOffset(9, 14), note: "Switching has been smooth this week." }),
  ];

  const relationships = [
    rec({ alter_id_a: alters.marin.id, alter_id_b: alters.sage.id, relationship_type: "Close friend",    notes: "Marin relies on Sage for grounding." }),
    rec({ alter_id_a: alters.river.id, alter_id_b: alters.marin.id, relationship_type: "Protects",       notes: "River steps forward when Marin is overwhelmed." }),
    rec({ alter_id_a: alters.sage.id,  alter_id_b: alters.pip.id,   relationship_type: "Caretaker of",   notes: "Sage looks out for Pip." }),
    rec({ alter_id_a: alters.echo.id,  alter_id_b: alters.marin.id, relationship_type: "Quiet ally",     notes: "Echo and Marin understand each other without words." }),
  ];

  const systemEvents = [
    rec({ type: "emergence", date: new Date(2003, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.pip.id], cause: "Childhood",    notes: "Pip first emerged around age 7." }),
    rec({ type: "emergence", date: new Date(2008, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.river.id], cause: "Stress",     notes: "River appeared during a hard year." }),
    rec({ type: "emergence", date: new Date(2012, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.sage.id], cause: "Healing work", notes: "Sage emerged after Marin started therapy." }),
    rec({ type: "emergence", date: new Date(2015, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.echo.id], cause: "Loss",         notes: "Echo arrived after a difficult loss." }),
  ];

  const symptoms = [
    rec({ name: "Headache",            color: "#ef4444", icon: "🤕" }),
    rec({ name: "Dissociation",        color: "#8b5cf6", icon: "🌫️" }),
    rec({ name: "Fatigue",             color: "#64748b", icon: "😴" }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[0].id, start_time: isoOffset(2, 14), end_time: isoOffset(2, 17), severity: 6, notes: "After the trigger." }),
    rec({ symptom_id: symptoms[1].id, start_time: isoOffset(5, 11), end_time: isoOffset(5, 13), severity: 4 }),
    rec({ symptom_id: symptoms[2].id, start_time: isoOffset(7, 16), end_time: isoOffset(7, 22), severity: 5 }),
  ];

  const locations = [
    rec({ timestamp: isoOffset(0, 7, 30), name: "Greenway Park",   category: "outdoor",   notes: "Morning walk." }),
    rec({ timestamp: isoOffset(0, 13),    name: "Therapist's office", category: "appointment" }),
    rec({ timestamp: isoOffset(2, 10),    name: "Home",            category: "home" }),
    rec({ timestamp: isoOffset(6, 11),    name: "Co-op grocery",   category: "errand" }),
  ];

  const tasks = [
    rec({ title: "Refill prescriptions",  completed: false, priority: "high",   due_date: isoOffset(-2, 17) }),
    rec({ title: "Email therapist about scheduling", completed: true, completed_date: isoOffset(1, 11), priority: "medium" }),
    rec({ title: "Plan weekend hike",     completed: false, priority: "low",    due_date: isoOffset(-4, 9) }),
    rec({ title: "Replace lightbulb",     completed: true, completed_date: isoOffset(3, 19), priority: "low" }),
    rec({ title: "Call Mum",              completed: false, priority: "medium" }),
  ];

  const dailyProgress = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0, 10), tasks_completed: 2, tasks_total: 5 }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), tasks_completed: 4, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), tasks_completed: 1, tasks_total: 3 }),
  ];

  const settings = rec({
    term_system: "system",
    term_alter:  "alter",
    term_switch: "switch",
    term_front:  "front",
    is_anonymized: false,
  });

  return {
    SystemSettings:     toMap([settings]),
    Alter:              toMap(Object.values(alters)),
    FrontingSession:    toMap(fronting),
    EmotionCheckIn:     toMap(emotions),
    Activity:           toMap(activities),
    JournalEntry:       toMap(journals),
    SystemCheckIn:      toMap(checkIns),
    StatusNote:         toMap(statusNotes),
    AlterRelationship:  toMap(relationships),
    SystemChangeEvent:  toMap(systemEvents),
    Symptom:            toMap(symptoms),
    SymptomSession:     toMap(symptomSessions),
    Location:           toMap(locations),
    Task:               toMap(tasks),
    DailyProgress:      toMap(dailyProgress),
  };
}

// ---------------------------------------------------------------------------
// SYSTEM 2: Verdant Coven — plural-collective terminology
// ---------------------------------------------------------------------------
function buildVerdant() {
  const headmates = {
    juniper: rec({ name: "Juniper", pronouns: "she/her",  color: "#16a34a", role: "Steward",  description: "Practical and grounded. Holds the calendar and the to-dos.", tags: ["steward"] }),
    cedar:   rec({ name: "Cedar",   pronouns: "he/they",  color: "#a16207", role: "Anchor",   description: "Steady, slow to anger, slow to leave. Cedar shows up when things are hard.", tags: ["anchor"] }),
    wren:    rec({ name: "Wren",    pronouns: "they/them",color: "#0891b2", role: "Voice",    description: "The one who talks to people. Quick-witted and warm.", tags: ["social"] }),
    moss:    rec({ name: "Moss",    pronouns: "it/its",   color: "#65a30d", role: "Quiet one", description: "Doesn't come out often. Loves rain on windows and old books.", tags: ["quiet"] }),
  };

  const fronting = [];
  fronting.push(rec({
    alter_id: headmates.wren.id, is_primary: true,
    start_time: new Date(Date.now() - 1 * HOUR).toISOString(),
    end_time: null, is_active: true,
  }));
  const sched = [
    [1, 8, 5, "juniper"], [1, 14, 3, "wren"], [1, 18, 3, "cedar"],
    [2, 9, 7, "juniper"], [2, 17, 4, "wren"],
    [3, 7, 4, "cedar"], [3, 12, 5, "juniper"],
    [4, 8, 6, "wren"], [4, 15, 4, "juniper"],
    [5, 9, 8, "juniper"], [5, 18, 2, "moss"],
    [6, 7, 5, "cedar"], [6, 13, 4, "wren"],
    [7, 9, 6, "juniper"], [7, 16, 5, "cedar"],
    [10, 8, 7, "juniper"], [10, 17, 3, "wren"],
    [12, 9, 5, "cedar"], [12, 15, 4, "juniper"], [12, 20, 1, "moss"],
  ];
  sched.forEach(([d, h, dur, who]) => {
    const start = new Date(Date.now() - d * DAY);
    start.setHours(h, 0, 0, 0);
    fronting.push(rec({
      alter_id: headmates[who].id, is_primary: true,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + dur * HOUR).toISOString(),
      is_active: false,
    }));
  });

  const emotions = [
    rec({ timestamp: isoOffset(0, 10), mood: 7, energy: 5, emotions: ["content", "settled"] }),
    rec({ timestamp: isoOffset(1, 14), mood: 5, energy: 4, emotions: ["tired"] }),
    rec({ timestamp: isoOffset(3, 11), mood: 8, energy: 7, emotions: ["happy", "social"] }),
    rec({ timestamp: isoOffset(5, 19), mood: 4, energy: 3, emotions: ["overwhelmed"], note: "Big day at work." }),
    rec({ timestamp: isoOffset(7, 10), mood: 6, energy: 6, emotions: ["calm"] }),
    rec({ timestamp: isoOffset(10, 13), mood: 7, energy: 5, emotions: ["focused"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 17),  activity_name: "Garden",    duration_minutes: 40, color: "#16a34a" }),
    rec({ timestamp: isoOffset(1, 9),   activity_name: "Run",       duration_minutes: 35, color: "#0891b2" }),
    rec({ timestamp: isoOffset(2, 19),  activity_name: "Reading",   duration_minutes: 60, color: "#a16207" }),
    rec({ timestamp: isoOffset(4, 11),  activity_name: "Bake bread", duration_minutes: 90, color: "#a16207" }),
    rec({ timestamp: isoOffset(7, 14),  activity_name: "Long walk", duration_minutes: 75, color: "#65a30d" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(1, 21), title: "Cedar's evening",  content: "Cedar held us together today. It was hard, but we made it.", tags: ["hard day"], alter_id: headmates.cedar.id }),
    rec({ created_date: isoOffset(4, 22), title: "Garden notes",     content: "The mint is taking over. Juniper says we should make tea.", tags: ["garden"], alter_id: headmates.juniper.id }),
    rec({ created_date: isoOffset(8, 20), title: "Wren met someone", content: "A friendly stranger at the cafe. Wren talked for an hour.", tags: ["social"], alter_id: headmates.wren.id }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 9),  note: "Slow morning. Tea." }),
    rec({ timestamp: isoOffset(3, 17), note: "Cedar is co-conscious today." }),
    rec({ timestamp: isoOffset(7, 11), note: "Calm collective day." }),
  ];

  const relationships = [
    rec({ alter_id_a: headmates.juniper.id, alter_id_b: headmates.cedar.id,  relationship_type: "Trusts deeply" }),
    rec({ alter_id_a: headmates.wren.id,    alter_id_b: headmates.juniper.id, relationship_type: "Sibling-like" }),
    rec({ alter_id_a: headmates.cedar.id,   alter_id_b: headmates.moss.id,   relationship_type: "Looks after" }),
  ];

  const settings = rec({
    term_system: "collective",
    term_alter:  "headmate",
    term_switch: "shift",
    term_front:  "be out",
    is_anonymized: false,
  });

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(headmates)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
  };
}

// ---------------------------------------------------------------------------
// SYSTEM 3: The Constellation — median / many-facets terminology
// ---------------------------------------------------------------------------
function buildConstellation() {
  const facets = {
    lyra:    rec({ name: "Lyra",    pronouns: "she/her",   color: "#6366f1", role: "Center",     description: "The brightest part. Holds most of daily life.", tags: ["center"] }),
    vega:    rec({ name: "Vega",    pronouns: "she/they",  color: "#06b6d4", role: "Logic",      description: "Plans, lists, calendars. Loves a good spreadsheet." }),
    nova:    rec({ name: "Nova",    pronouns: "any",       color: "#f43f5e", role: "Spark",      description: "Creative bursts, sudden ideas, big feelings." }),
    cygnus:  rec({ name: "Cygnus",  pronouns: "he/him",    color: "#0ea5e9", role: "Watcher",    description: "Notices things. Quiet but present." }),
    polaris: rec({ name: "Polaris", pronouns: "they/them", color: "#fbbf24", role: "Guide",      description: "The compass when things feel disorienting." }),
  };

  const fronting = [];
  fronting.push(rec({
    alter_id: facets.lyra.id, is_primary: true,
    start_time: new Date(Date.now() - 3 * HOUR).toISOString(),
    end_time: null, is_active: true,
  }));
  const sched = [
    [1, 7, 6, "lyra"],   [1, 14, 3, "vega"],   [1, 18, 3, "nova"],
    [2, 8, 8, "lyra"],   [2, 17, 2, "polaris"],
    [3, 9, 5, "vega"],   [3, 15, 5, "lyra"],
    [4, 7, 7, "lyra"],   [4, 16, 4, "cygnus"],
    [5, 8, 6, "lyra"],   [5, 15, 5, "nova"],
    [6, 9, 5, "vega"],   [6, 15, 5, "lyra"],
    [8, 7, 8, "lyra"],   [8, 17, 3, "polaris"],
    [10, 8, 6, "lyra"],  [10, 15, 4, "nova"], [10, 20, 1, "cygnus"],
    [12, 9, 5, "vega"],  [12, 15, 6, "lyra"],
  ];
  sched.forEach(([d, h, dur, who]) => {
    const start = new Date(Date.now() - d * DAY);
    start.setHours(h, 0, 0, 0);
    fronting.push(rec({
      alter_id: facets[who].id, is_primary: true,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + dur * HOUR).toISOString(),
      is_active: false,
    }));
  });

  const emotions = [
    rec({ timestamp: isoOffset(0, 11), mood: 7, energy: 6, emotions: ["focused", "calm"] }),
    rec({ timestamp: isoOffset(2, 16), mood: 9, energy: 8, emotions: ["inspired", "excited"], note: "Nova had a creative burst." }),
    rec({ timestamp: isoOffset(4, 21), mood: 4, energy: 3, emotions: ["lonely"] }),
    rec({ timestamp: isoOffset(7, 12), mood: 6, energy: 5, emotions: ["thoughtful"] }),
    rec({ timestamp: isoOffset(11, 9), mood: 7, energy: 7, emotions: ["hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 9),   activity_name: "Journaling",  duration_minutes: 25, color: "#6366f1" }),
    rec({ timestamp: isoOffset(2, 18),  activity_name: "Painting",    duration_minutes: 75, color: "#f43f5e", notes: "Stars and water." }),
    rec({ timestamp: isoOffset(4, 13),  activity_name: "Coding",      duration_minutes: 120, color: "#06b6d4" }),
    rec({ timestamp: isoOffset(8, 20),  activity_name: "Stargazing",  duration_minutes: 40, color: "#fbbf24" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(2, 22), title: "A creative night",   content: "Nova led tonight. Painted until midnight. Lyra was tired but happy.", tags: ["creative"], alter_id: facets.nova.id }),
    rec({ created_date: isoOffset(7, 21), title: "Vega's project",      content: "Spent the day reorganizing the calendar. Vega is satisfied.", tags: ["planning"], alter_id: facets.vega.id }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 8),  note: "Constellation is calm and aligned." }),
    rec({ timestamp: isoOffset(4, 15), note: "Nova is sparking. Lots of ideas." }),
    rec({ timestamp: isoOffset(9, 19), note: "Polaris is guiding tonight — feeling oriented." }),
  ];

  const relationships = [
    rec({ alter_id_a: facets.lyra.id,    alter_id_b: facets.vega.id,    relationship_type: "Works closely with" }),
    rec({ alter_id_a: facets.nova.id,    alter_id_b: facets.lyra.id,    relationship_type: "Inspires" }),
    rec({ alter_id_a: facets.polaris.id, alter_id_b: facets.cygnus.id,  relationship_type: "Quiet ally" }),
  ];

  const settings = rec({
    term_system: "constellation",
    term_alter:  "facet",
    term_switch: "transition",
    term_front:  "shine",
    is_anonymized: false,
  });

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(facets)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
  };
}

function toMap(records) {
  const out = {};
  for (const r of records) out[r.id] = r;
  return out;
}

// Public registry — each system declares its key, name, blurb, and a
// builder function so data is freshly generated relative to "now" each
// time Preview Mode is enabled.
export const PREVIEW_SYSTEMS = [
  {
    key: "crescent",
    name: "The Crescent",
    blurb: "A traditional DID system with five alters — host, protector, caretaker, little, and an introject. Uses default terminology.",
    termsLabel: "system / alter / fronting / switching",
    build: buildCrescent,
  },
  {
    key: "verdant",
    name: "Verdant Coven",
    blurb: "A four-headmate plural collective with a nature-leaning vibe. Uses 'collective' and 'headmate' terminology.",
    termsLabel: "collective / headmate / be out / shift",
    build: buildVerdant,
  },
  {
    key: "constellation",
    name: "The Constellation",
    blurb: "A median-flavored system with five facets, each holding a different aspect of daily life. Uses astronomical terminology.",
    termsLabel: "constellation / facet / shine / transition",
    build: buildConstellation,
  },
];

export function getPreviewSystem(key) {
  return PREVIEW_SYSTEMS.find((s) => s.key === key) || null;
}
