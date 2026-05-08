// Curated example "systems" used by Preview Mode.
//
// Each entry is a self-contained snapshot of what a populated app might look
// like for someone with that kind of system. Each system uses its own
// terminology AND its own theme + font, so users can see how the app feels
// with different vocabularies and visual identities.
//
// Data is generated relative to "now" so the timeline always shows recent
// activity, regardless of when the user enables Preview Mode.

const DAY = 86400000;
const HOUR = 3600000;

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

function toMap(records) {
  const out = {};
  for (const r of records) out[r.id] = r;
  return out;
}

function pushSession(arr, alterId, daysAgo, startHour, durationHours, isPrimary = true) {
  const start = new Date(Date.now() - daysAgo * DAY);
  start.setHours(startHour, 0, 0, 0);
  arr.push(rec({
    alter_id: alterId,
    is_primary: isPrimary,
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + durationHours * HOUR).toISOString(),
    is_active: false,
  }));
}

// ---------------------------------------------------------------------------
// SYSTEM 1: The Hearth — small DID system
// ---------------------------------------------------------------------------
function buildHearth() {
  const alters = {
    marin:  rec({ name: "Marin",  pronouns: "she/they",  color: "#d97706", role: "Host",      description: "The everyday face of the system. Steady, organised, the one who shows up to work and remembers the dentist appointment.", origin_year: 1996, tags: ["host", "everyday"] }),
    river:  rec({ name: "River",  pronouns: "they/them", color: "#0891b2", role: "Protector", description: "Calm, watchful, takes over when things feel unsafe. Likes long walks and quiet music.", origin_year: 2008, tags: ["protector"] }),
    sage:   rec({ name: "Sage",   pronouns: "she/her",   color: "#15803d", role: "Caretaker", description: "Soft-spoken and warm. Reminds the body to eat, drink, and sleep. Loves tea and old kitchens.", origin_year: 2012, tags: ["caretaker"] }),
    pip:    rec({ name: "Pip",    pronouns: "he/him",    color: "#f59e0b", role: "Little",    description: "Seven years old, bright, curious, and a little anxious about loud noises. Loves dinosaurs.", origin_year: 2003, age_apparent: 7, tags: ["little"] }),
    echo:   rec({ name: "Echo",   pronouns: "she/her",   color: "#b45309", role: "Introject", description: "Came in during a hard time. Quieter now than she used to be, but still a steady presence in the back.", origin_year: 2015, tags: ["introject"] }),
  };

  const fronting = [];
  fronting.push(rec({
    alter_id: alters.marin.id, is_primary: true,
    start_time: new Date(Date.now() - 2 * HOUR).toISOString(),
    end_time: null, is_active: true,
  }));
  const sched = [
    [1,7,5,"marin"],[1,12,2,"sage"],[1,14,4,"marin"],[1,19,1,"river"],
    [2,7,9,"marin"],[2,17,2,"pip"],[2,19,3,"river"],
    [3,8,6,"marin"],[3,14,3,"sage"],[3,18,4,"marin"],
    [4,9,5,"river"],[4,15,6,"marin"],
    [5,7,4,"marin"],[5,11,2,"echo"],[5,14,5,"sage"],
    [6,8,8,"marin"],[6,17,3,"pip"],
    [7,9,6,"marin"],[7,15,5,"sage"],
    [9,7,5,"river"],[9,13,3,"marin"],
    [11,8,7,"marin"],[11,16,4,"sage"],
    [13,7,6,"marin"],[13,14,4,"echo"],
  ];
  sched.forEach(([d,h,dur,who]) => pushSession(fronting, alters[who].id, d, h, dur));

  const emotions = [
    rec({ timestamp: isoOffset(0, 9), mood: 6, energy: 5, emotions: ["calm","focused"], note: "Settling into the morning." }),
    rec({ timestamp: isoOffset(0, 14), mood: 4, energy: 3, emotions: ["overwhelmed"], note: "Lots of email today." }),
    rec({ timestamp: isoOffset(2, 18), mood: 3, energy: 4, emotions: ["sad","tired"], note: "Old memory came up." }),
    rec({ timestamp: isoOffset(3, 10), mood: 8, energy: 7, emotions: ["happy","grateful"] }),
    rec({ timestamp: isoOffset(5, 9), mood: 7, energy: 6, emotions: ["calm"] }),
    rec({ timestamp: isoOffset(7, 19), mood: 4, energy: 3, emotions: ["dissociative"], note: "Foggy after the meeting." }),
    rec({ timestamp: isoOffset(10, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(12, 8), mood: 6, energy: 6, emotions: ["calm","hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 7, 30), activity_name: "Morning walk", duration_minutes: 30, color: "#15803d", notes: "Saw two dogs and a heron." }),
    rec({ timestamp: isoOffset(0, 13),    activity_name: "Therapy session", duration_minutes: 50, color: "#d97706" }),
    rec({ timestamp: isoOffset(2, 10),    activity_name: "Reading",      duration_minutes: 40, color: "#f59e0b" }),
    rec({ timestamp: isoOffset(3, 16),    activity_name: "Drawing",      duration_minutes: 60, color: "#b45309", notes: "Sage painted the river." }),
    rec({ timestamp: isoOffset(5, 19),    activity_name: "Watched a movie", duration_minutes: 110, color: "#d97706" }),
    rec({ timestamp: isoOffset(7, 18),    activity_name: "Therapy session", duration_minutes: 50, color: "#d97706" }),
    rec({ timestamp: isoOffset(11, 9),    activity_name: "Morning walk", duration_minutes: 35, color: "#15803d" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(0, 21), title: "A quiet day",    content: "Marin held the front for most of today. Felt steady. Sage came up briefly around lunch to remind us to eat — grateful for that.", tags: ["good day"], alter_id: alters.marin.id }),
    rec({ created_date: isoOffset(2, 22), title: "Hard afternoon", content: "An old memory surfaced. River stepped in to keep things calm. We made it through.", tags: ["trigger","protector"], alter_id: alters.river.id }),
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
    rec({ alter_id_a: alters.marin.id, alter_id_b: alters.sage.id,  relationship_type: "Close friend",  notes: "Marin relies on Sage for grounding." }),
    rec({ alter_id_a: alters.river.id, alter_id_b: alters.marin.id, relationship_type: "Protects",     notes: "River steps forward when Marin is overwhelmed." }),
    rec({ alter_id_a: alters.sage.id,  alter_id_b: alters.pip.id,   relationship_type: "Caretaker of", notes: "Sage looks out for Pip." }),
    rec({ alter_id_a: alters.echo.id,  alter_id_b: alters.marin.id, relationship_type: "Quiet ally",    notes: "Echo and Marin understand each other without words." }),
  ];

  const systemEvents = [
    rec({ type: "emergence", date: new Date(2003, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.pip.id],   cause: "Childhood",     notes: "Pip first emerged around age 7." }),
    rec({ type: "emergence", date: new Date(2008, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.river.id], cause: "Stress",        notes: "River appeared during a hard year." }),
    rec({ type: "emergence", date: new Date(2012, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.sage.id],  cause: "Healing work",  notes: "Sage emerged after Marin started therapy." }),
    rec({ type: "emergence", date: new Date(2015, 0, 1).toISOString(), year_only: true, result_alter_ids: [alters.echo.id],  cause: "Loss",          notes: "Echo arrived after a difficult loss." }),
  ];

  const symptoms = [
    rec({ name: "Headache",     color: "#ef4444", icon: "🤕" }),
    rec({ name: "Dissociation", color: "#a78bfa", icon: "🌫️" }),
    rec({ name: "Fatigue",      color: "#64748b", icon: "😴" }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[0].id, start_time: isoOffset(2, 14), end_time: isoOffset(2, 17), severity: 6, notes: "After the trigger." }),
    rec({ symptom_id: symptoms[1].id, start_time: isoOffset(5, 11), end_time: isoOffset(5, 13), severity: 4 }),
    rec({ symptom_id: symptoms[2].id, start_time: isoOffset(7, 16), end_time: isoOffset(7, 22), severity: 5 }),
  ];

  const locations = [
    rec({ timestamp: isoOffset(0, 7, 30), name: "Greenway Park",    category: "outdoor", notes: "Morning walk." }),
    rec({ timestamp: isoOffset(0, 13),    name: "Therapist's office", category: "appointment" }),
    rec({ timestamp: isoOffset(6, 11),    name: "Co-op grocery",    category: "errand" }),
  ];

  const tasks = [
    rec({ title: "Refill prescriptions", completed: false, priority: "high",   due_date: isoOffset(-2, 17) }),
    rec({ title: "Email therapist",      completed: true,  completed_date: isoOffset(1, 11), priority: "medium" }),
    rec({ title: "Plan weekend hike",    completed: false, priority: "low",    due_date: isoOffset(-4, 9) }),
    rec({ title: "Call Mum",             completed: false, priority: "medium" }),
  ];

  const settings = rec({
    term_system: "system",
    term_alter:  "alter",
    term_switch: "switch",
    term_front:  "front",
    is_anonymized: false,
  });

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(alters)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    SystemCheckIn:     toMap(checkIns),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
    SystemChangeEvent: toMap(systemEvents),
    Symptom:           toMap(symptoms),
    SymptomSession:    toMap(symptomSessions),
    Location:          toMap(locations),
    Task:              toMap(tasks),
  };
}

// ---------------------------------------------------------------------------
// SYSTEM 2: The Tapestry — large polyfragmented DID system
// ---------------------------------------------------------------------------
function buildTapestry() {
  // 24 alters across hosts, protectors, caretakers, littles, teens,
  // introjects, fragments, and dormant alters. Polyfragmented systems often
  // include many limited-function "fragments" alongside fully-formed alters.
  const defs = [
    { k: "atlas",   n: "Atlas",   p: "they/them",  c: "#7c3aed", r: "Host",         d: "Carries the calendar and the day-to-day. Tired but reliable.", y: 1995, t: ["host"] },
    { k: "iris",    n: "Iris",    p: "she/her",    c: "#ec4899", r: "Co-host",      d: "Steps in when Atlas burns out. Warm, social, organised.", y: 2010, t: ["host","ANP"] },
    { k: "jasper",  n: "Jasper",  p: "he/him",     c: "#dc2626", r: "Protector",    d: "Vigilant. Surfaces when threats appear. Doesn't say much.", y: 2002, t: ["protector"] },
    { k: "wren",    n: "Wren",    p: "they/them",  c: "#10b981", r: "Protector",    d: "Quiet protection — watches more than acts. Knows when to leave a room.", y: 2007, t: ["protector"] },
    { k: "kestrel", n: "Kestrel", p: "she/they",   c: "#b91c1c", r: "Persecutor",   d: "Used to keep us small. Working on softening — slowly.", y: 1999, t: ["persecutor","working"] },
    { k: "thorne",  n: "Thorne",  p: "he/him",     c: "#9333ea", r: "Persecutor",   d: "Sharp tongue, harsh judgements. In dialogue with the rest of us.", y: 2004, t: ["persecutor"] },
    { k: "linnet",  n: "Linnet",  p: "she/her",    c: "#06b6d4", r: "Caretaker",    d: "Looks after the littles. Always knows where the cocoa is.", y: 2008, t: ["caretaker"] },
    { k: "fern",    n: "Fern",    p: "she/her",    c: "#65a30d", r: "Caretaker",    d: "The body's caretaker — eating, sleeping, hydration.", y: 2014, t: ["caretaker"] },
    { k: "milo",    n: "Milo",    p: "he/him",     c: "#f59e0b", r: "Little",       d: "Five. Loves dinosaurs and stickers.", y: 2001, ageA: 5, t: ["little"] },
    { k: "poppy",   n: "Poppy",   p: "she/her",    c: "#f43f5e", r: "Little",       d: "Eight. Talks fast, draws constantly.", y: 2002, ageA: 8, t: ["little"] },
    { k: "tadpole", n: "Tadpole", p: "any",        c: "#14b8a6", r: "Little",       d: "Tiny. Mostly hums. Has a stuffed frog.", y: 2003, ageA: 3, t: ["little","fragment"] },
    { k: "sparrow", n: "Sparrow", p: "she/they",   c: "#fbbf24", r: "Middle",       d: "Eleven. Practical and a little bossy.", y: 2005, ageA: 11, t: ["middle"] },
    { k: "vex",     n: "Vex",     p: "they/them",  c: "#a855f7", r: "Teen",         d: "Fifteen, sarcastic, secretly soft.", y: 2008, ageA: 15, t: ["teen"] },
    { k: "rook",    n: "Rook",    p: "he/they",    c: "#3b82f6", r: "Teen",         d: "Seventeen. Skates, draws, listens to loud music.", y: 2009, ageA: 17, t: ["teen"] },
    { k: "noor",    n: "Noor",    p: "she/her",    c: "#0ea5e9", r: "Introject",    d: "Based on a real-life mentor. Calm advice on tap.", y: 2013, t: ["introject"] },
    { k: "halo",    n: "Halo",    p: "she/her",    c: "#fde68a", r: "Introject",    d: "Comfort character. Came in during a hard winter.", y: 2016, t: ["introject"] },
    { k: "blaze",   n: "Blaze",   p: "he/him",     c: "#f97316", r: "Introject",    d: "Action-hero introject. Useful in emergencies.", y: 2014, t: ["introject"] },
    { k: "zee",     n: "Zee",     p: "ze/zir",     c: "#22d3ee", r: "Sexual",       d: "Holds intimacy and bodily autonomy.", y: 2011, t: ["sexual"] },
    { k: "shade",   n: "Shade",   p: "they/them",  c: "#6b7280", r: "Trauma holder", d: "Holds the heaviest memories. Rarely fronts; stable in the back.", y: 1998, t: ["trauma","ENP"] },
    { k: "gate",    n: "Gate",    p: "they/them",  c: "#1e40af", r: "Gatekeeper",   d: "Manages who fronts and when. Does not engage with the outside world.", y: 1997, t: ["gatekeeper"] },
    { k: "tiny",    n: "tiny",    p: "any",        c: "#94a3b8", r: "Fragment",     d: "Single-purpose: types fast. Comes up only when the keyboard is needed.", y: 2012, t: ["fragment"] },
    { k: "scout",   n: "Scout",   p: "they/them",  c: "#84cc16", r: "Fragment",     d: "Scans crowded rooms. Limited beyond that.", y: 2010, t: ["fragment"] },
    { k: "lumen",   n: "Lumen",   p: "she/her",    c: "#fbbf24", r: "Dormant",      d: "Fully formed but hasn't fronted in over two years. Resting.", y: 2006, t: ["dormant"], dormant: true },
    { k: "mira",    n: "Mira",    p: "she/her",    c: "#e11d48", r: "Dormant",      d: "Fused mostly into Iris. Still an echo in the background.", y: 2003, t: ["dormant"], dormant: true },
  ];

  const alters = {};
  for (const def of defs) {
    alters[def.k] = rec({
      name: def.n, pronouns: def.p, color: def.c, role: def.r,
      description: def.d, origin_year: def.y, tags: def.t,
      ...(def.ageA ? { age_apparent: def.ageA } : {}),
      ...(def.dormant ? { is_dormant: true } : {}),
    });
  }

  // Lots of switching — polyfragmented systems often switch frequently.
  const fronting = [];
  fronting.push(rec({
    alter_id: alters.iris.id, is_primary: true,
    start_time: new Date(Date.now() - 90 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));
  fronting.push(rec({
    alter_id: alters.fern.id, is_primary: false,
    start_time: new Date(Date.now() - 90 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));

  const sched = [
    [1,7,3,"atlas"],[1,10,2,"linnet"],[1,12,2,"poppy"],[1,14,3,"iris"],[1,17,2,"vex"],[1,19,3,"jasper"],
    [2,7,4,"atlas"],[2,11,2,"halo"],[2,13,2,"milo"],[2,15,3,"iris"],[2,18,3,"rook"],
    [3,8,3,"noor"],[3,11,2,"sparrow"],[3,13,2,"linnet"],[3,15,3,"atlas"],[3,18,3,"thorne"],
    [4,7,3,"iris"],[4,10,1,"scout"],[4,11,2,"poppy"],[4,13,2,"fern"],[4,15,3,"atlas"],[4,18,3,"vex"],
    [5,8,4,"atlas"],[5,12,2,"halo"],[5,14,2,"tiny"],[5,16,3,"iris"],[5,19,2,"jasper"],
    [6,7,3,"atlas"],[6,10,2,"milo"],[6,12,2,"noor"],[6,14,3,"iris"],[6,17,3,"rook"],
    [7,8,2,"linnet"],[7,10,2,"sparrow"],[7,12,3,"iris"],[7,15,3,"atlas"],[7,18,2,"vex"],[7,20,1,"shade"],
    [8,7,3,"atlas"],[8,10,2,"poppy"],[8,12,2,"fern"],[8,14,3,"iris"],[8,17,2,"thorne"],[8,19,2,"jasper"],
    [9,8,3,"noor"],[9,11,2,"halo"],[9,13,2,"milo"],[9,15,3,"iris"],[9,18,3,"atlas"],
    [10,7,3,"atlas"],[10,10,2,"linnet"],[10,12,2,"vex"],[10,14,3,"iris"],[10,17,2,"poppy"],[10,19,2,"jasper"],
    [11,8,3,"iris"],[11,11,2,"sparrow"],[11,13,2,"fern"],[11,15,3,"atlas"],[11,18,2,"rook"],[11,20,2,"blaze"],
    [12,7,3,"atlas"],[12,10,2,"halo"],[12,12,2,"milo"],[12,14,3,"iris"],[12,17,2,"vex"],[12,19,2,"jasper"],
    [13,8,3,"noor"],[13,11,2,"linnet"],[13,13,2,"poppy"],[13,15,3,"atlas"],[13,18,3,"iris"],
    [14,7,4,"atlas"],[14,11,2,"sparrow"],[14,13,2,"fern"],[14,15,3,"iris"],[14,18,2,"rook"],[14,20,1,"kestrel"],
  ];
  sched.forEach(([d,h,dur,who]) => pushSession(fronting, alters[who].id, d, h, dur));

  const emotions = [
    rec({ timestamp: isoOffset(0, 9), mood: 5, energy: 4, emotions: ["overwhelmed","scattered"] }),
    rec({ timestamp: isoOffset(0, 14), mood: 6, energy: 5, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(1, 11), mood: 4, energy: 3, emotions: ["dissociative"], note: "Lots of switching this morning." }),
    rec({ timestamp: isoOffset(2, 16), mood: 7, energy: 6, emotions: ["connected"], note: "Halo and Atlas co-front, surprisingly steady." }),
    rec({ timestamp: isoOffset(4, 10), mood: 3, energy: 3, emotions: ["sad","tired"], note: "Shade was up briefly." }),
    rec({ timestamp: isoOffset(5, 18), mood: 6, energy: 5, emotions: ["settled"] }),
    rec({ timestamp: isoOffset(7, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(9, 11), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(11, 19), mood: 4, energy: 3, emotions: ["lonely"] }),
    rec({ timestamp: isoOffset(13, 9), mood: 6, energy: 6, emotions: ["calm","hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),    activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(0, 13),   activity_name: "Reading",         duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(1, 10),   activity_name: "Walk",            duration_minutes: 30, color: "#10b981" }),
    rec({ timestamp: isoOffset(2, 19),   activity_name: "Drawing",         duration_minutes: 75, color: "#f43f5e", notes: "Poppy spent most of this." }),
    rec({ timestamp: isoOffset(4, 15),   activity_name: "Music practice",  duration_minutes: 40, color: "#f97316", notes: "Rook plays bass." }),
    rec({ timestamp: isoOffset(6, 11),   activity_name: "Errands",         duration_minutes: 60, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(7, 18),   activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(9, 13),   activity_name: "Cooking",         duration_minutes: 70, color: "#65a30d", notes: "Fern, of course." }),
    rec({ timestamp: isoOffset(11, 16),  activity_name: "Game night",      duration_minutes: 120, color: "#a855f7" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(0, 22), title: "Mapping the system",       content: "We made a list today — twenty-four of us, give or take. Atlas is exhausted but proud.", tags: ["system map"], alter_id: alters.atlas.id }),
    rec({ created_date: isoOffset(2, 21), title: "Halo's afternoon",          content: "Halo came up around lunch. The kitchen smelled like cinnamon. Poppy drew a picture for her.", tags: ["good day","introject"], alter_id: alters.halo.id }),
    rec({ created_date: isoOffset(4, 20), title: "Shade was here",            content: "Brief surface, then gone again. Took notes. Gate kept things contained.", tags: ["trauma","gatekeeper"], alter_id: alters.gate.id }),
    rec({ created_date: isoOffset(6, 22), title: "Rook's playlist",           content: "Rook made a 90-minute playlist. Vex approves. Iris is mildly horrified.", tags: ["teens"], alter_id: alters.rook.id }),
    rec({ created_date: isoOffset(9, 21), title: "Working with Kestrel",      content: "She agreed to a check-in twice a week instead of fronting unannounced. Progress.", tags: ["persecutor","working"], alter_id: alters.kestrel.id }),
    rec({ created_date: isoOffset(12, 22), title: "Lumen still resting",       content: "Two and a half years dormant now. We trust she'll come back if she wants to.", tags: ["dormant"], alter_id: alters.atlas.id }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 5, communication_quality: 6, system_harmony: 6, note: "Lots of co-consciousness today. Iris and Fern co-fronting." }),
    rec({ created_date: isoOffset(3, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting went smoothly. Twenty-one people showed up to the inner room." }),
    rec({ created_date: isoOffset(7, 20), mood: 5, communication_quality: 5, system_harmony: 5, note: "Tense — Kestrel and Iris disagreeing about an outside friend." }),
    rec({ created_date: isoOffset(11, 9), mood: 7, communication_quality: 8, system_harmony: 8, note: "Felt like a big team this morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 11), note: "Co-fronting day. Iris is leading; Fern is in the background." }),
    rec({ timestamp: isoOffset(2, 14), note: "Switching every 90 minutes or so. Tiring but not unsafe." }),
    rec({ timestamp: isoOffset(5, 17), note: "Halo came up out of nowhere — kitchen got cinnamon vibes for an hour." }),
    rec({ timestamp: isoOffset(8, 9),  note: "Atlas needs sleep. Iris is covering today." }),
    rec({ timestamp: isoOffset(11, 20), note: "Game night was loud — Rook, Vex, Poppy, Sparrow all up at once." }),
  ];

  const relationships = [
    rec({ alter_id_a: alters.atlas.id, alter_id_b: alters.iris.id,    relationship_type: "Co-host" }),
    rec({ alter_id_a: alters.gate.id,  alter_id_b: alters.shade.id,   relationship_type: "Contains" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.milo.id,   relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.poppy.id,  relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.tadpole.id, relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.fern.id,  alter_id_b: alters.atlas.id,   relationship_type: "Looks after" }),
    rec({ alter_id_a: alters.kestrel.id, alter_id_b: alters.iris.id,  relationship_type: "Working it out" }),
    rec({ alter_id_a: alters.noor.id,  alter_id_b: alters.atlas.id,   relationship_type: "Mentor to" }),
    rec({ alter_id_a: alters.rook.id,  alter_id_b: alters.vex.id,     relationship_type: "Sibling-like" }),
    rec({ alter_id_a: alters.sparrow.id, alter_id_b: alters.poppy.id, relationship_type: "Older sibling" }),
  ];

  const systemEvents = [
    rec({ type: "split",    date: new Date(2003, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.poppy.id, alters.milo.id], cause: "Childhood",   notes: "Two littles split off in the same year." }),
    rec({ type: "split",    date: new Date(2008, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.vex.id, alters.sparrow.id, alters.rook.id], cause: "Adolescence", notes: "Teen layer formed." }),
    rec({ type: "split",    date: new Date(2010, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.iris.id, alters.scout.id, alters.tiny.id], cause: "Burnout",     notes: "Co-host emerged plus two fragments." }),
    rec({ type: "fusion",   date: new Date(2018, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.iris.id, alters.mira.id], result_alter_ids: [alters.iris.id], fusion_type: "absorption", notes: "Iris is the alter that persists." }),
    rec({ type: "dormancy", date: new Date(2022, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.lumen.id], notes: "Lumen has been dormant since." }),
  ];

  const symptoms = [
    rec({ name: "Dissociation", color: "#a78bfa", icon: "🌫️" }),
    rec({ name: "Headache",     color: "#ef4444", icon: "🤕" }),
    rec({ name: "Fatigue",      color: "#64748b", icon: "😴" }),
    rec({ name: "Time loss",    color: "#0ea5e9", icon: "⏳" }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[0].id, start_time: isoOffset(1, 11), end_time: isoOffset(1, 13), severity: 6 }),
    rec({ symptom_id: symptoms[3].id, start_time: isoOffset(4, 15), end_time: isoOffset(4, 18), severity: 7, notes: "Lost three hours after Shade surfaced." }),
    rec({ symptom_id: symptoms[1].id, start_time: isoOffset(7, 17), end_time: isoOffset(7, 20), severity: 5 }),
    rec({ symptom_id: symptoms[2].id, start_time: isoOffset(10, 19), end_time: isoOffset(10, 23), severity: 6 }),
  ];

  const settings = rec({
    term_system: "system",
    term_alter:  "alter",
    term_switch: "switch",
    term_front:  "front",
    is_anonymized: false,
  });

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(alters)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    SystemCheckIn:     toMap(checkIns),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
    SystemChangeEvent: toMap(systemEvents),
    Symptom:           toMap(symptoms),
    SymptomSession:    toMap(symptomSessions),
  };
}

// ---------------------------------------------------------------------------
// SYSTEM 3: Inner Compass — singlet using IFS (Internal Family Systems)
// ---------------------------------------------------------------------------
// This person is a singlet — one identity. They use IFS as a therapy model,
// which talks about "parts" of the self (Managers, Firefighters, Exiles)
// orbiting a core "Self". The app's alter model represents these parts so
// the user can journal, check in with, and track their parts work.
function buildCompass() {
  const parts = {
    self:    rec({ name: "Self",          pronouns: "I",        color: "#16a34a", role: "Self",        description: "The grounded, curious, compassionate centre. Not a part — the seat from which the parts are met.", tags: ["self"] }),
    planner: rec({ name: "The Planner",   pronouns: "she",      color: "#0d9488", role: "Manager",     description: "Lists, schedules, contingencies. Tries to keep me safe by anticipating everything.", tags: ["manager"] }),
    critic:  rec({ name: "The Critic",    pronouns: "he",       color: "#65a30d", role: "Manager",     description: "Sharp inner voice. Means well; wants me to be good enough that I don't get hurt.", tags: ["manager"] }),
    drifter: rec({ name: "The Drifter",   pronouns: "they",     color: "#84cc16", role: "Firefighter", description: "Steps in when the pain gets loud — scrolling, snacks, late nights, anything to soften the edge.", tags: ["firefighter"] }),
    little:  rec({ name: "Small One",     pronouns: "she",      color: "#22c55e", role: "Exile",       description: "Carries the early loneliness. Mostly hidden by the managers; gentler when the Self is leading.", tags: ["exile"] }),
  };

  // Self is "leading" most of the time — IFS goal is Self-led living.
  const fronting = [];
  fronting.push(rec({
    alter_id: parts.self.id, is_primary: true,
    start_time: new Date(Date.now() - 4 * HOUR).toISOString(),
    end_time: null, is_active: true,
  }));
  // Brief moments where a part "took over" — represented as that part fronting.
  const sched = [
    [0, 6, 1, "planner"],
    [1, 7, 2, "planner"], [1, 21, 1, "drifter"],
    [2, 8, 1, "critic"],  [2, 14, 3, "self"],
    [3, 22, 2, "drifter"],
    [4, 7, 1, "planner"],
    [5, 16, 1, "little"], [5, 17, 4, "self"],
    [6, 21, 1, "drifter"],
    [7, 8, 1, "critic"],
    [9, 7, 1, "planner"],
    [11, 22, 2, "drifter"],
    [13, 16, 1, "little"],
  ];
  sched.forEach(([d,h,dur,who]) => pushSession(fronting, parts[who].id, d, h, dur));

  const emotions = [
    rec({ timestamp: isoOffset(0, 9),  mood: 7, energy: 6, emotions: ["calm","curious"], note: "Self-led morning." }),
    rec({ timestamp: isoOffset(0, 21), mood: 5, energy: 3, emotions: ["tired","numb"],  note: "Drifter took over for a bit." }),
    rec({ timestamp: isoOffset(1, 14), mood: 4, energy: 4, emotions: ["anxious"],       note: "Planner is loud today." }),
    rec({ timestamp: isoOffset(2, 18), mood: 6, energy: 5, emotions: ["thoughtful"] }),
    rec({ timestamp: isoOffset(3, 23), mood: 3, energy: 2, emotions: ["sad","ashamed"], note: "Critic + Drifter combo. Naming it helped." }),
    rec({ timestamp: isoOffset(4, 9),  mood: 6, energy: 6, emotions: ["calm","focused"] }),
    rec({ timestamp: isoOffset(5, 17), mood: 4, energy: 4, emotions: ["lonely"],         note: "Small One came close — sat with her for an hour." }),
    rec({ timestamp: isoOffset(7, 12), mood: 7, energy: 7, emotions: ["content","grateful"] }),
    rec({ timestamp: isoOffset(9, 8),  mood: 5, energy: 5, emotions: ["overwhelmed"],   note: "Planner-heavy morning." }),
    rec({ timestamp: isoOffset(12, 19), mood: 7, energy: 6, emotions: ["calm","steady"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),  activity_name: "Morning meditation", duration_minutes: 20, color: "#16a34a" }),
    rec({ timestamp: isoOffset(0, 17), activity_name: "Therapy (IFS)",      duration_minutes: 50, color: "#0d9488", notes: "Worked with Planner." }),
    rec({ timestamp: isoOffset(1, 18), activity_name: "Yoga",               duration_minutes: 40, color: "#22c55e" }),
    rec({ timestamp: isoOffset(2, 9),  activity_name: "Journaling",         duration_minutes: 25, color: "#65a30d" }),
    rec({ timestamp: isoOffset(4, 11), activity_name: "Walk",               duration_minutes: 35, color: "#16a34a" }),
    rec({ timestamp: isoOffset(5, 20), activity_name: "Reading",            duration_minutes: 60, color: "#84cc16" }),
    rec({ timestamp: isoOffset(7, 17), activity_name: "Therapy (IFS)",      duration_minutes: 50, color: "#0d9488", notes: "Welcomed Small One — gently." }),
    rec({ timestamp: isoOffset(10, 19), activity_name: "Cooking",            duration_minutes: 45, color: "#16a34a" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(0, 21), title: "Meeting Planner",      content: "Sat with the Planner today. Asked what she's afraid would happen if she let go. She said: 'You'd fall and no one would catch you.' That's worth knowing.", tags: ["managers","ifs"], alter_id: parts.planner.id }),
    rec({ created_date: isoOffset(2, 22), title: "Critic, with kindness", content: "Tried to thank the Critic instead of arguing back. He didn't trust it. Maybe next time.", tags: ["managers"], alter_id: parts.critic.id }),
    rec({ created_date: isoOffset(3, 23), title: "After the Drifter",     content: "Snacks, scrolling, three hours gone. Not as a failure — as information. The Drifter shows up when an exile gets loud.", tags: ["firefighters"], alter_id: parts.drifter.id }),
    rec({ created_date: isoOffset(5, 22), title: "Small One",             content: "She came forward in session. Just sadness, no story attached. Self stayed present. We sat together.", tags: ["exiles","unburdening"], alter_id: parts.little.id }),
    rec({ created_date: isoOffset(8, 21), title: "Self-led day",          content: "Most of today was Self in the lead — calm, curious, capable. Parts were around but didn't drive.", tags: ["self"], alter_id: parts.self.id }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 7, communication_quality: 8, system_harmony: 8, note: "Self-led morning. Parts feel known." }),
    rec({ created_date: isoOffset(3, 23), mood: 4, communication_quality: 5, system_harmony: 5, note: "Got pulled out of Self briefly. Got back." }),
    rec({ created_date: isoOffset(7, 20), mood: 7, communication_quality: 9, system_harmony: 8, note: "Best therapy session in a while." }),
    rec({ created_date: isoOffset(12, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "Steady week. Drifter quieter than usual." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 9),  note: "In Self. Curious about the Planner's worry." }),
    rec({ timestamp: isoOffset(1, 14), note: "Planner is loud — running through everything that could go wrong tomorrow." }),
    rec({ timestamp: isoOffset(3, 23), note: "Drifter took the wheel for a bit. Coming back now." }),
    rec({ timestamp: isoOffset(5, 17), note: "Sitting with Small One. No fixing, just company." }),
    rec({ timestamp: isoOffset(8, 11), note: "Self-led. Parts in the room but not driving." }),
  ];

  const relationships = [
    rec({ alter_id_a: parts.self.id,    alter_id_b: parts.planner.id, relationship_type: "Welcomes",  notes: "Self meets the Planner without judgment." }),
    rec({ alter_id_a: parts.self.id,    alter_id_b: parts.critic.id,  relationship_type: "Welcomes" }),
    rec({ alter_id_a: parts.self.id,    alter_id_b: parts.drifter.id, relationship_type: "Welcomes" }),
    rec({ alter_id_a: parts.self.id,    alter_id_b: parts.little.id,  relationship_type: "Holds",     notes: "Self holds the Small One." }),
    rec({ alter_id_a: parts.planner.id, alter_id_b: parts.little.id,  relationship_type: "Protects",  notes: "The Planner thinks she's keeping the Small One from getting hurt." }),
    rec({ alter_id_a: parts.critic.id,  alter_id_b: parts.little.id,  relationship_type: "Protects" }),
    rec({ alter_id_a: parts.drifter.id, alter_id_b: parts.little.id,  relationship_type: "Distracts from" }),
  ];

  const settings = rec({
    term_system: "inner family",
    term_alter:  "part",
    term_switch: "shift",
    term_front:  "lead",
    is_anonymized: false,
  });

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(parts)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    SystemCheckIn:     toMap(checkIns),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
  };
}

// Public registry — each system declares its key, name, blurb, theme + font,
// and a builder function so data is freshly generated relative to "now" each
// time Preview Mode is enabled.
export const PREVIEW_SYSTEMS = [
  {
    key: "hearth",
    name: "The Hearth",
    blurb: "A small DID system with five alters — host, protector, caretaker, little, and an introject. Default DID terminology.",
    termsLabel: "system / alter / fronting / switching",
    theme: "warm",
    font:  "'Playfair Display', serif",
    themeMode: null,
    build: buildHearth,
  },
  {
    key: "tapestry",
    name: "The Tapestry",
    blurb: "A large polyfragmented DID system: 24 alters across hosts, protectors, caretakers, littles, teens, introjects, gatekeeper, persecutors, fragments, and dormants — with splits, fusions, and frequent switching.",
    termsLabel: "system / alter / fronting / switching",
    theme: "berry",
    font:  "'Nunito', sans-serif",
    themeMode: null,
    build: buildTapestry,
  },
  {
    key: "compass",
    name: "Inner Compass",
    blurb: "A singlet using Internal Family Systems (IFS) — one Self surrounded by parts (Managers, Firefighters, Exiles). Heavy on journaling and parts-work check-ins.",
    termsLabel: "inner family / part / leading / shift",
    theme: "forest",
    font:  "'Atkinson Hyperlegible', sans-serif",
    themeMode: null,
    build: buildCompass,
  },
];

export function getPreviewSystem(key) {
  return PREVIEW_SYSTEMS.find((s) => s.key === key) || null;
}
