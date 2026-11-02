import { journalEntryDate } from "@/lib/journalDate";
import { meetingTextParts } from "@/lib/systemMeetingText";
import { redactWhispers } from "@/lib/whisperRedact";
/**
 * Global search engine — shared between the Dashboard "Search everything"
 * input and any other surface that wants to query across the user's data.
 *
 * Design:
 *   - Pure functions, no React. The consumer feeds in the entity lists it
 *     has fetched (alters, journals, tasks, …) and a query string, and
 *     gets back grouped result records.
 *   - Coverage = every entity the user can back up via Settings → Data,
 *     plus all profile fields on each alter (including custom_fields,
 *     alter_custom_fields, groups, tags, birthday, origin_year).
 *   - Matching is case-insensitive substring, run over a single
 *     pre-built `searchableText` blob per record. Date strings are
 *     baked into the blob in several human + ISO formats so a user
 *     typing "March 2025" or "2025-03" finds records from that month.
 *   - The user's dataset is bounded (hundreds → low thousands of
 *     records), so an in-memory `.includes()` scan is fine. No need
 *     for Fuse/Lunr/FTS — keep it dependency-free.
 *
 * Adding a new entity:
 *   1. Add a `build<Name>Records({ items, … })` helper that returns
 *      `[{ type, id, title, subtitle, path, searchableText, sortDate }]`.
 *   2. Call it from `buildSearchIndex()`.
 *   3. Add the matching label/icon entries in `TYPE_LABELS` / `TYPE_ICONS`
 *      inside `GlobalSearch.jsx` and include the type in `TYPE_ORDER`.
 */

const SYS_CHANGE_TYPE_LABELS = {
  fusion: "Fusion",
  split: "Split",
  dormancy: "Dormancy",
  return: "Return",
  emergence: "Emergence",
  reformation: "Reformation",
};

// ---------- date helpers ----------

function pad(n) { return String(n).padStart(2, "0"); }

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];
const MONTH_SHORT = [
  "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
];
const DAY_NAMES = [
  "sunday","monday","tuesday","wednesday","thursday","friday","saturday",
];

/**
 * Expand a date into a single space-joined string with multiple human
 * and machine forms so a substring match catches them all. Examples
 * (for 2025-03-04):
 *   "2025-03-04 03/04/2025 march 4 2025 mar 4 2025 mar 4 march 4
 *    tuesday march 4 tuesday mar 4 march mar 2025-03 03/2025 2025"
 */
export function dateSearchBlob(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  return [
    `${year}-${pad(month + 1)}-${pad(day)}`,
    `${pad(month + 1)}/${pad(day)}/${year}`,
    `${MONTH_NAMES[month]} ${day} ${year}`,
    `${MONTH_SHORT[month]} ${day} ${year}`,
    `${MONTH_SHORT[month]} ${day}`,
    `${MONTH_NAMES[month]} ${day}`,
    `${day}th`, `${day}st`, `${day}nd`, `${day}rd`,
    `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[month]} ${day}`,
    `${DAY_NAMES[d.getDay()]} ${MONTH_SHORT[month]} ${day}`,
    MONTH_NAMES[month],
    MONTH_SHORT[month],
    `${year}-${pad(month + 1)}`,
    `${pad(month + 1)}/${year}`,
    String(year),
  ].join(" ");
}

export function formatDateLabel(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

export function isoDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

// ---------- general helpers ----------

// Whisper secrets never reach the index: every builder goes through here.
export function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return redactWhispers(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function joinNonEmpty(parts) {
  return parts.filter((p) => p !== undefined && p !== null && String(p).trim() !== "").join(" ");
}

function snippet(text, maxLen = 80) {
  if (!text) return "";
  const cleaned = stripHtml(String(text)).trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

// ---------- per-entity record builders ----------

/**
 * Alters — search EVERY profile field, not just name/role.
 *
 * We pull together:
 *   - the obvious top-level strings (name, alias, pronouns, role, description, tags, birthday, origin_year)
 *   - group membership (the name on each `alter.groups[i]`)
 *   - system-wide custom field values (alter.custom_fields object,
 *     joined against the CustomField defs by id so we also index the
 *     field's display name)
 *   - per-alter custom fields (alter.alter_custom_fields array of
 *     {name, value} objects)
 *   - any other top-level string we don't know about
 *
 * No filter on is_archived / dormant / hidden — the user wants every
 * alter to be findable. Archived ones still surface, dimmed, in the
 * results UI (see the "isArchived" badge in GlobalSearch.jsx).
 */
export function buildAlterRecords({ alters = [], customFieldDefs = [] }) {
  const fieldDefById = new Map();
  customFieldDefs.forEach((f) => { if (f?.id) fieldDefById.set(f.id, f); });

  return alters.map((a) => {
    if (!a) return null;

    const parts = [];

    // Obvious profile strings
    parts.push(
      a.name, a.alias, a.aliases, a.pronouns, a.role, a.gender, a.age,
      a.birthday, a.origin_year, a.species, a.sexuality,
      stripHtml(a.description), stripHtml(a.bio),
    );

    // Tags (array of strings)
    if (Array.isArray(a.tags)) parts.push(a.tags.join(" "));

    // Groups (array of {id, name} on alter.groups)
    if (Array.isArray(a.groups)) {
      parts.push(a.groups.map((g) => g?.name).filter(Boolean).join(" "));
    }

    // System-wide custom fields — object keyed by CustomField id.
    // Index both the field label (from defs) and the value.
    if (a.custom_fields && typeof a.custom_fields === "object") {
      for (const [fieldId, value] of Object.entries(a.custom_fields)) {
        // skip internal keys (anything starting with "_")
        if (fieldId.startsWith("_")) continue;
        if (value === undefined || value === null) continue;
        const def = fieldDefById.get(fieldId);
        if (def?.name) parts.push(def.name);
        if (typeof value === "string") {
          parts.push(stripHtml(value));
        } else if (typeof value === "number" || typeof value === "boolean") {
          parts.push(String(value));
        } else if (Array.isArray(value)) {
          parts.push(value.map((v) => (typeof v === "string" ? stripHtml(v) : String(v))).join(" "));
        }
      }
    }

    // Per-alter custom fields — array of {name, value}
    if (Array.isArray(a.alter_custom_fields)) {
      for (const f of a.alter_custom_fields) {
        if (!f) continue;
        if (f.name) parts.push(f.name);
        if (f.value !== undefined && f.value !== null) {
          parts.push(typeof f.value === "string" ? stripHtml(f.value) : String(f.value));
        }
      }
    }

    // Catch-all: any other top-level string field we didn't enumerate.
    for (const [k, v] of Object.entries(a)) {
      if (typeof v !== "string") continue;
      if (k === "id" || k === "color" || k === "avatar_url" || k === "user_id") continue;
      // already covered above — don't bother re-adding
      parts.push(v);
    }

    // Date forms (created_date)
    parts.push(dateSearchBlob(a.created_date));

    return {
      type: "alter",
      id: a.id,
      title: a.name || a.alias || "Untitled",
      subtitle: a.role || a.pronouns || a.alias || "",
      color: a.color,
      path: `/alter/${a.id}`,
      isArchived: !!a.is_archived,
      searchableText: joinNonEmpty(parts).toLowerCase(),
      sortDate: a.created_date,
    };
  }).filter(Boolean);
}

export function buildJournalRecords({ items = [] }) {
  return items.map((j) => {
    // An encrypted entry's content is ciphertext — only its title is findable.
    const content = j.is_encrypted ? "" : stripHtml(j.content);
    return {
      type: "journal",
      id: j.id,
      title: j.title || "Journal Entry",
      subtitle: snippet(content) || formatDateLabel(journalEntryDate(j)) || "",
      path: `/journals?id=${j.id}`,
      searchableText: joinNonEmpty([j.title, content, dateSearchBlob(journalEntryDate(j))]).toLowerCase(),
      sortDate: journalEntryDate(j),
    };
  });
}

export function buildSupportJournalRecords({ items = [] }) {
  return items.map((j) => {
    const content = stripHtml(j.content || j.notes);
    return {
      type: "journal",
      id: `sj-${j.id}`,
      title: j.title || "Support Journal Entry",
      subtitle: snippet(content) || formatDateLabel(j.created_date) || "",
      path: `/grounding`,
      searchableText: joinNonEmpty([j.title, content, dateSearchBlob(j.created_date)]).toLowerCase(),
      sortDate: j.created_date,
    };
  });
}

export function buildBulletinRecords({ items = [] }) {
  return items.map((b) => {
    const content = stripHtml(b.content);
    return {
      type: "bulletin",
      id: b.id,
      title: "Bulletin",
      subtitle: snippet(content) || formatDateLabel(b.created_date) || "",
      path: `/bulletin/${b.id}`,
      searchableText: joinNonEmpty([content, dateSearchBlob(b.created_date)]).toLowerCase(),
      sortDate: b.created_date,
    };
  });
}

export function buildBulletinCommentRecords({ items = [] }) {
  return items.map((c) => {
    const content = stripHtml(c.content);
    return {
      type: "bulletin",
      id: `bc-${c.id}`,
      title: "Bulletin Comment",
      subtitle: snippet(content) || formatDateLabel(c.created_date) || "",
      path: `/bulletin/${c.bulletin_id}?commentId=${c.id}`,
      searchableText: joinNonEmpty([content, dateSearchBlob(c.created_date)]).toLowerCase(),
      sortDate: c.created_date,
    };
  });
}

export function buildActivityRecords({ items = [] }) {
  return items.map((a) => {
    const dateStr = isoDate(a.timestamp) || isoDate(new Date());
    return {
      type: "activity",
      id: a.id,
      title: a.activity_name || "Activity",
      subtitle: snippet(a.notes) || formatDateLabel(a.timestamp) || "",
      path: `/planner?date=${dateStr}&highlight=${a.id}`,
      searchableText: joinNonEmpty([a.activity_name, a.notes, a.category, dateSearchBlob(a.timestamp)]).toLowerCase(),
      sortDate: a.timestamp,
    };
  });
}

// The activities themselves (categories), opening their page on Activities.
export function buildActivityCategoryRecords({ items = [] }) {
  const byId = Object.fromEntries(items.map((c) => [c.id, c]));
  return items.filter((c) => c?.id && c.name).map((c) => {
    const parent = c.parent_category_id && c.parent_category_id !== c.id ? byId[c.parent_category_id] : null;
    return {
      type: "activity",
      id: `cat-${c.id}`,
      title: c.name,
      subtitle: parent ? `Activity · in ${parent.name}` : "Activity",
      path: `/activities?category=${encodeURIComponent(c.id)}`,
      searchableText: joinNonEmpty([c.name, parent?.name]).toLowerCase(),
      sortDate: c.updated_date || c.created_date,
    };
  });
}

export function buildTaskRecords({ items = [] }) {
  return items.map((t) => ({
    type: "task",
    id: t.id,
    title: t.title || "Task",
    subtitle: snippet(t.description || t.notes) || formatDateLabel(t.due_date || t.created_date) || "",
    path: `/todo?highlight=${t.id}`,
    searchableText: joinNonEmpty([
      t.title, stripHtml(t.description), stripHtml(t.notes), t.priority,
      dateSearchBlob(t.due_date), dateSearchBlob(t.created_date),
    ]).toLowerCase(),
    sortDate: t.created_date,
  }));
}

export function buildDailyTaskTemplateRecords({ items = [] }) {
  return items.map((t) => ({
    type: "task",
    id: `dt-${t.id}`,
    title: t.title || t.name || "Daily Task",
    subtitle: snippet(t.notes || t.description) || "Daily task",
    path: `/tasks`,
    searchableText: joinNonEmpty([t.title, t.name, t.notes, t.description, t.category]).toLowerCase(),
    sortDate: t.created_date,
  }));
}

export function buildStatusNoteRecords({ items = [] }) {
  return items.map((s) => {
    const dateStr = isoDate(s.timestamp);
    return {
      type: "status",
      id: s.id,
      title: snippet(s.note) || "Status",
      subtitle: formatDateLabel(s.timestamp) || "",
      path: dateStr ? `/timeline?date=${dateStr}` : `/timeline`,
      searchableText: joinNonEmpty([s.note, dateSearchBlob(s.timestamp)]).toLowerCase(),
      sortDate: s.timestamp,
    };
  });
}

// Notes captured with the ~therapy command — they open the Therapy Report
// page, where pending ones are listed.
export function buildTherapyNoteRecords({ items = [] }) {
  return items.map((n) => ({
    type: "therapy",
    id: n.id,
    title: snippet(n.note) || "To bring up",
    subtitle: [formatDateLabel(n.timestamp), n.reported_at ? "in a report" : "waiting for next report"].filter(Boolean).join(" · "),
    path: "/therapy-report",
    searchableText: joinNonEmpty([n.note, n.source, "therapy", dateSearchBlob(n.timestamp)]).toLowerCase(),
    sortDate: n.timestamp,
  }));
}

export function buildEmotionCheckInRecords({ items = [] }) {
  const records = [];
  for (const e of items) {
    const dateStr = isoDate(e.timestamp);
    if (!dateStr) continue;
    const hasNote = !!(e.note && String(e.note).trim());
    const emotionsText = Array.isArray(e.emotions) ? e.emotions.join(" ") : "";
    const baseSearch = joinNonEmpty([e.note, emotionsText, dateSearchBlob(e.timestamp)]).toLowerCase();
    if (hasNote) {
      records.push({
        type: "status",
        id: `ec-${e.id}`,
        title: snippet(e.note),
        subtitle: `${formatDateLabel(e.timestamp)}${emotionsText ? " · " + emotionsText : ""}`,
        path: `/timeline?date=${dateStr}&highlightStatus=${e.id}`,
        searchableText: baseSearch,
        sortDate: e.timestamp,
      });
    } else {
      records.push({
        type: "emotion",
        id: e.id,
        title: "Emotion Check-In",
        subtitle: emotionsText || formatDateLabel(e.timestamp) || "",
        path: `/timeline?date=${dateStr}`,
        searchableText: baseSearch,
        sortDate: e.timestamp,
      });
    }
  }
  return records;
}

export function buildSymptomRecords({ items = [] }) {
  return items.map((s) => ({
    type: "symptom",
    id: s.id,
    title: s.label || s.name || "Symptom",
    subtitle: snippet(s.description) || "Symptom",
    path: `/checkin-log`,
    searchableText: joinNonEmpty([s.label, s.name, s.description, s.category]).toLowerCase(),
  }));
}

export function buildSymptomCheckInRecords({ items = [], symptoms = [] }) {
  // Check-ins store only the symptom's id; the name comes from the catalogue.
  const nameOf = new Map((symptoms || []).map((x) => [x.id, x.label || x.name]));
  return items.map((s) => {
    const name = nameOf.get(s.symptom_id) || s.symptom_name || s.label;
    return {
      type: "symptom",
      id: `sc-${s.id}`,
      title: name || "Symptom Check-in",
      subtitle: snippet(s.notes) || formatDateLabel(s.timestamp || s.created_date) || "",
      path: `/checkin-log`,
      searchableText: joinNonEmpty([
        name, s.notes, s.severity,
        dateSearchBlob(s.timestamp), dateSearchBlob(s.created_date),
      ]).toLowerCase(),
      sortDate: s.timestamp || s.created_date,
    };
  });
}

export function buildGroupRecords({ items = [], alters = [] }) {
  const byId = Object.fromEntries((alters || []).map((a) => [a.id, a]));
  return items.map((g) => {
    const owner = g.owner_alter_id ? byId[g.owner_alter_id] : null;
    const isSub = !!g.owner_alter_id;
    return {
      type: "group",
      id: g.id,
      title: g.name || "Group",
      subtitle: isSub ? (owner ? `Subsystem · ${owner.name}` : "Subsystem") : (snippet(g.description) || "Group"),
      // Both groups and subsystems now have a profile page.
      path: `/group/${g.id}`,
      // A group's own pages (v0.322.0, Field widget → Add a page) are its
      // text too.
      searchableText: joinNonEmpty([
        g.name, stripHtml(g.description), isSub ? "subsystem" : "group", owner?.name,
        ...(Array.isArray(g.info_fields) ? g.info_fields.flatMap((f) => [f?.name, typeof f?.value === "string" ? stripHtml(f.value) : ""]) : []),
      ]).toLowerCase(),
    };
  });
}

// Multiple-systems registry entries. Only surfaced when more than one system
// exists (searching for "your system" otherwise is noise). Results route to the
// Systems manager where you can switch/rename/delete.
export function buildSystemRecords({ items = [] }) {
  if (!Array.isArray(items) || items.length <= 1) return [];
  return items.map((s) => ({
    type: "system",
    id: s.id,
    title: s.name || "System",
    subtitle: "Switch or manage systems",
    path: "/settings#systems",
    searchableText: joinNonEmpty([s.name, "system", "switch system"]).toLowerCase(),
  }));
}

export function buildContactRecords({ items = [] }) {
  return (items || [])
    .filter((c) => !c.is_archived)
    .map((c) => ({
      type: "contact",
      id: c.id,
      title: c.nickname || c.name || "Contact",
      subtitle: c.relationship_label || "Contact",
      path: `/contacts/${c.id}`,
      searchableText: joinNonEmpty([
        c.name, c.nickname, c.relationship_label,
        c.about, c.safe_to_share, c.boundaries, c.system_rules,
        ...(c.contact_methods || []).map((m) => m.value),
        dateSearchBlob(c.created_date),
      ]).toLowerCase(),
      sortDate: c.created_date,
    }));
}

export function buildGroundingTechniqueRecords({ items = [] }) {
  return items.map((g) => ({
    type: "grounding",
    id: g.id,
    title: g.name || "Technique",
    subtitle: g.category ? `Grounding · ${g.category}` : "Grounding technique",
    path: "/grounding",
    searchableText: joinNonEmpty([g.name, g.category, g.instructions, g.description]).toLowerCase(),
  }));
}

export function buildInnerWorldLocationRecords({ items = [] }) {
  return items.map((l) => ({
    type: "innerworld",
    id: l.id,
    title: l.name || "Location",
    subtitle: snippet(l.description) || "Inner world location",
    path: `/location/${l.id}`,
    searchableText: joinNonEmpty([l.name, l.description]).toLowerCase(),
  }));
}

// A private channel's messages are findable only while one of its members
// is in front — the same rule the Chat page uses for showing the channel.
export function buildChatMessageRecords({ items = [], channels = [], frontingIds = [] }) {
  const chanById = Object.fromEntries((channels || []).map((c) => [c.id, c]));
  const here = new Set(frontingIds || []);
  const open = (chan) => !chan?.is_private || (chan.member_alter_ids || []).some((id) => here.has(id));
  return items
    .filter((m) => m && !m.deleted_at && m.content && open(chanById[m.channel_id]))
    .map((m) => {
      const text = stripHtml(String(m.content || ""));
      const chan = chanById[m.channel_id];
      return {
        type: "chat",
        id: m.id,
        title: snippet(text) || "Message",
        subtitle: chan ? `#${chan.name}` : "Chat",
        path: m.channel_id ? `/chat?channel=${m.channel_id}` : "/chat",
        searchableText: joinNonEmpty([text, chan?.name]).toLowerCase(),
      };
    });
}

export function buildDiaryCardRecords({ items = [] }) {
  return items.map((d) => {
    const notesText = joinNonEmpty([d.notes?.what, d.notes?.judgments, d.notes?.optional]);
    return {
      type: "diarycard",
      id: d.id,
      title: d.name || `Diary Card — ${d.date || ""}`.trim(),
      subtitle: snippet(notesText) || formatDateLabel(d.date || d.created_date) || "",
      path: `/checkin-log?id=${d.id}`,
      searchableText: joinNonEmpty([
        d.name, notesText, dateSearchBlob(d.date), dateSearchBlob(d.created_date),
      ]).toLowerCase(),
      sortDate: d.date || d.created_date,
    };
  });
}

export function buildSystemCheckInRecords({ items = [] }) {
  return items.map((c) => {
    const text = meetingTextParts(c).map((p) => p.text);
    return {
      type: "checkin",
      id: c.id,
      title: "System Meeting",
      subtitle: snippet(text[0]) || formatDateLabel(c.created_date) || "",
      path: `/system-checkin?id=${c.id}`,
      searchableText: joinNonEmpty([...text, dateSearchBlob(c.date), dateSearchBlob(c.created_date)]).toLowerCase(),
      sortDate: c.created_date,
    };
  });
}

export function buildLocationRecords({ items = [] }) {
  return items.map((l) => {
    const dateStr = isoDate(l.timestamp);
    return {
      type: "location",
      id: l.id,
      title: l.name || "Location",
      subtitle: snippet([l.category, l.notes].filter(Boolean).join(" · "))
        || formatDateLabel(l.timestamp) || "",
      path: dateStr ? `/location-history` : `/location-history`,
      searchableText: joinNonEmpty([
        l.name, l.category, l.notes, dateSearchBlob(l.timestamp),
      ]).toLowerCase(),
      sortDate: l.timestamp,
    };
  });
}

export function buildSystemChangeRecords({ items = [] }) {
  return items.map((e) => {
    const typeLabel = SYS_CHANGE_TYPE_LABELS[e.type] || e.type || "Event";
    const fusionSuffix = e.fusion_type === "absorption"
      ? " · Absorption"
      : e.fusion_type === "new_formation"
      ? " · New Formation"
      : "";
    return {
      type: "syschange",
      id: e.id,
      title: typeLabel + fusionSuffix,
      subtitle: snippet(e.cause || e.notes) || formatDateLabel(e.date) || "",
      path: `/system-history`,
      searchableText: joinNonEmpty([
        typeLabel, e.cause, e.notes, e.fusion_type,
        dateSearchBlob(e.date),
      ]).toLowerCase(),
      sortDate: e.date,
    };
  });
}

export function buildAlterNoteRecords({ items = [], alters = [] }) {
  const alterById = new Map(alters.map((a) => [a.id, a]));
  return items.map((n) => {
    const alter = alterById.get(n.alter_id);
    const alterName = alter?.name || alter?.alias || "Alter";
    const content = stripHtml(n.content || n.note);
    return {
      type: "note",
      id: n.id,
      title: snippet(content, 60) || `Note on ${alterName}`,
      subtitle: `${alterName}${n.created_date ? " · " + formatDateLabel(n.created_date) : ""}`,
      path: alter ? `/alter/${alter.id}` : `/Home`,
      searchableText: joinNonEmpty([
        content, alterName, dateSearchBlob(n.created_date),
      ]).toLowerCase(),
      sortDate: n.created_date,
    };
  });
}

// Wishes (System Needs). Private wishes stay out of search — they only
// show on their own profile.
export function buildWishRecords({ items = [], alters = [] }) {
  const alterById = new Map(alters.map((a) => [a.id, a]));
  return items.filter((w) => w && !w.is_private).map((w) => {
    const owners = (w.owner_alter_ids || []).map((id) => alterById.get(id)).filter(Boolean);
    const ownerNames = owners.map((a) => a.name || a.alias).filter(Boolean);
    const driving = stripHtml(w.driving);
    const impact = stripHtml(w.impact);
    const first = owners[0];
    return {
      type: "wish",
      id: `wish-${w.id}`,
      title: w.title || "Wish",
      subtitle: [w.for_everyone ? "Everyone" : ownerNames.join(", "), w.kind, w.status && w.status !== "wished" ? w.status.replace("_", " ") : null]
        .filter(Boolean).join(" · "),
      path: first ? `/alter/${first.id}?tab=wishlist&highlight=${w.id}` : `/needs?tab=wishes&highlight=${w.id}`,
      searchableText: joinNonEmpty([
        w.title, w.kind, driving, impact, ...ownerNames, w.url, dateSearchBlob(w.created_date),
      ]).toLowerCase(),
      sortDate: w.created_date,
    };
  });
}

// Goals (System Needs). Step titles are searchable too, so finding "call
// the dentist" lands on the goal it belongs to.
export function buildGoalRecords({ items = [], steps = [], alters = [] }) {
  const alterById = new Map(alters.map((a) => [a.id, a]));
  const stepTitles = new Map();
  for (const s of steps || []) {
    if (!s || s.removed_at || !s.goal_id) continue;
    if (!stepTitles.has(s.goal_id)) stepTitles.set(s.goal_id, []);
    stepTitles.get(s.goal_id).push(s.title, s.kind === "text" ? stripHtml(s.body) : null, s.label);
  }
  // Sections are pages too: their subtitle names the page they sit in.
  const goalById = new Map(items.filter(Boolean).map((g) => [g.id, g]));
  return items.filter(Boolean).map((g) => {
    const ownerNames = (g.owner_alter_ids || []).map((id) => alterById.get(id)).filter(Boolean).map((a) => a.name || a.alias).filter(Boolean);
    const status = { paused: "paused", done: "reached", let_go: "let go" }[g.status];
    const parent = g.parent_id ? goalById.get(g.parent_id) : null;
    return {
      type: "goal",
      id: `goal-${g.id}`,
      title: g.title || "Goal",
      subtitle: parent
        ? `In ${parent.title || "a goal"}`
        : [g.for_everyone ? "Everyone" : ownerNames.join(", "), status].filter(Boolean).join(" · "),
      path: `/goals?page=${g.id}`,
      searchableText: joinNonEmpty([
        g.title, stripHtml(g.why), stripHtml(g.impact), ...ownerNames, ...(stepTitles.get(g.id) || []), dateSearchBlob(g.created_date),
      ]).toLowerCase(),
      sortDate: g.created_date,
    };
  });
}

// Turn agreements (Needs page): "this now, that next".
export function buildTurnRecords({ items = [], alters = [] }) {
  const alterById = new Map(alters.map((a) => [a.id, a]));
  const names = (ids) => (ids || []).map((id) => alterById.get(id)).filter(Boolean).map((a) => a.name || a.alias).filter(Boolean);
  return items.filter(Boolean).map((t) => ({
    type: "turn",
    id: `turn-${t.id}`,
    title: `${t.first_title || "First"}, then ${t.second_title || "next"}`,
    subtitle: [names(t.first_alter_ids).join(", "), names(t.second_alter_ids).join(", ")].filter(Boolean).join(" → "),
    path: `/needs?tab=turns&highlight=${t.id}`,
    searchableText: joinNonEmpty([
      t.first_title, t.second_title, stripHtml(t.note), ...names(t.first_alter_ids), ...names(t.second_alter_ids), dateSearchBlob(t.created_date),
    ]).toLowerCase(),
    sortDate: t.created_date,
  }));
}

export function buildSleepRecords({ items = [] }) {
  return items.map((s) => ({
    type: "activity",
    id: `sl-${s.id}`,
    title: "Sleep",
    subtitle: snippet(s.notes) || formatDateLabel(s.start_time || s.date || s.created_date) || "",
    path: `/sleep`,
    searchableText: joinNonEmpty([
      "sleep", s.notes, s.quality,
      dateSearchBlob(s.start_time), dateSearchBlob(s.end_time),
      dateSearchBlob(s.date), dateSearchBlob(s.created_date),
    ]).toLowerCase(),
    sortDate: s.start_time || s.date || s.created_date,
  }));
}

export function buildReminderRecords({ items = [] }) {
  return items.map((r) => ({
    type: "reminder",
    id: r.id,
    title: r.title || r.name || "Reminder",
    subtitle: snippet(r.notes || r.description) || formatDateLabel(r.next_run || r.created_date) || "",
    path: `/reminders`,
    searchableText: joinNonEmpty([
      r.title, r.name, r.notes, r.description, r.schedule,
      dateSearchBlob(r.next_run), dateSearchBlob(r.created_date),
    ]).toLowerCase(),
    sortDate: r.next_run || r.created_date,
  }));
}

export function buildPollRecords({ items = [] }) {
  return items.map((p) => ({
    type: "bulletin",
    id: `poll-${p.id}`,
    title: p.question || "Poll",
    subtitle: snippet((p.options || []).map((o) => o?.text || o).filter(Boolean).join(" · "))
      || formatDateLabel(p.created_date) || "",
    path: p.bulletin_id ? `/bulletin/${p.bulletin_id}` : `/polls?id=${p.id}`,
    searchableText: joinNonEmpty([
      p.question,
      (p.options || []).map((o) => (typeof o === "string" ? o : o?.text)).filter(Boolean).join(" "),
      dateSearchBlob(p.created_date),
    ]).toLowerCase(),
    sortDate: p.created_date,
  }));
}

export function buildGroceryRecords({ items = [] }) {
  return items.map((g) => ({
    type: "grocery",
    id: g.id,
    title: g.name || "Grocery item",
    subtitle: snippet(g.notes || g.category) || (g.checked ? "Checked" : "Unchecked"),
    path: `/grocery`,
    searchableText: joinNonEmpty([g.name, g.notes, g.category]).toLowerCase(),
    sortDate: g.created_date,
  }));
}

// Named items in Assets (pictures, songs, videos, files). Unnamed stored
// pictures have no record and nothing a person would search for.
export function buildAssetRecords({ items = [] }) {
  return items.filter((a) => a && (a.name || a.file_name)).map((a) => {
    const folder = (a.folder || "").trim();
    const kind = a.kind === "video" ? "Video" : a.kind === "audio" ? "Audio" : a.kind === "file" ? "File" : "Image";
    return {
      type: "asset",
      id: a.id,
      title: a.name || a.file_name,
      subtitle: folder ? `${kind} · ${folder}` : kind,
      path: folder && !a.owner_alter_id ? `/assets?folder=${encodeURIComponent(folder)}` : "/assets",
      searchableText: joinNonEmpty([a.name, a.file_name, folder, kind]).toLowerCase(),
      sortDate: a.created_date,
    };
  });
}

// ---------- index builder + searcher ----------

/**
 * Aggregate every record list into one flat array.
 * Pass each `items` list nullably — missing arrays just contribute zero
 * records, which lets the consumer enable queries lazily.
 */
export function buildPresenceRecords({ items = [], alters = [] }) {
  return items.map((p) => {
    const linkedNames = (p.associated_alter_ids || [])
      .map((id) => alters.find((a) => a.id === id)?.name)
      .filter(Boolean);
    const title = p.label || p.vibe || "Presence";
    return {
      type: "presence",
      id: p.id,
      title,
      subtitle: joinNonEmpty([p.vibe && p.vibe !== title ? p.vibe : "", formatDateLabel(p.timestamp)]).trim() || "New presence",
      path: `/presences?highlight=${p.id}`,
      searchableText: joinNonEmpty([p.label, p.vibe, p.notes, p.relationship_type, linkedNames.join(" "), dateSearchBlob(p.timestamp)]).toLowerCase(),
      sortDate: p.timestamp,
    };
  });
}

// ── Settings ───────────────────────────────────────────────────────
// Static, not entity-backed: settings is a fixed set of pages, and
// people search for the THING they want to change ("backup", "font size",
// "wallpaper") rather than the page's name. Each record deep-links to
// /settings#<page>, which Settings.jsx honours (settingsPages.jsx).
export function buildSettingsRecords({ terms = {} } = {}) {
  const Alter = terms.Alter || "Alter";
  const Alters = terms.Alters || "Alters";
  const Systems = terms.Systems || "Systems";
  const fronting = terms.fronting || "fronting";
  const SECTIONS = [
    ["profile", "Profile", `${terms.System || "System"} name, banner, picture, bio, identity`],
    ["terms", "Terminology", `Words, terms, pronouns, ${Alter}, headmates, parts, ${fronting}`],
    ["systems", Systems, `Multiple ${Systems}, switching between ${Systems}`],
    ["language", "Language", "Language, locale, translation"],
    ["timezone", "Time & clock", "Timezone, time zone, clock, 12-hour, 24-hour"],
    ["alter-labels", `${Alter} labels in lists`, "Name, alias, labels, pickers"],
    ["home-screen", "Home screen", "New UI, home screen, widgets, board, home opens on"],
    ["experimental", "Experimental features", "Experimental, beta, labs, needs, goals, mods"],
    ["display", "Display options", "Appearance, theme, colours, fonts, text size, wallpaper, presets, dark, light, corners, bars, navigation, top bar, bottom bar, sidebar, wave"],
    ["accessibility", "Accessibility", "Low vision, contrast, motion, screen reader, tap targets, bar height"],
    ["custom-fields", "Custom fields", `Custom fields, entries, ${Alter} info schema`],
    ["relationship-types", "Relationship types", "Relationship types, lineage"],
    ["profile-layouts", "Profile layouts", "Profile layouts, default layout, new profile"],
    ["profile-songs", "Profile songs", "Profile songs, music"],
    ["alter-order", `Order your ${Alters}`, `${Alter} order, sort, arrangement`],
    ["archived-alters", `Archived ${Alters}`, `Archived ${Alters}, restore, unarchive`],
    ["archived-contacts", "Archived contacts", "Archived contacts, restore"],
    ["duplicates", "Find & remove duplicates", `Duplicates, merge ${Alters}`],
    ["checkin-manager", "Check-in manager", "Check-in fields, symptoms, diary card templates"],
    ["emotions", "Custom emotions", "Custom emotions, feelings wheel"],
    ["triggers", "Custom triggers", "Custom triggers, switch triggers"],
    ["front-levels", `${terms.Fronting || "Fronting"} levels`, `${fronting} levels, co-front`],
    ["shortcuts", "Shortcuts", "Shortcuts, quick actions, hold menu"],
    ["analytics", "Analytics & attribution", "Analytics grouping, attribution, inferred presence, insight spotlight"],
    ["notif-status", "Notifications status", "Notifications off, allow notifications, battery, permission"],
    ["reminders", "Reminders", "Reminders, quiet hours, snooze, pause, pre-plan banner"],
    ["popups", "Pop-up messages", "Pop-up messages, toasts, alerts"],
    ["notif-advanced", "Notifications: advanced", "Push, test notification, server delivery"],
    ["relay", "Friends & sync server", "Relay, server, friends, self-hosted"],
    ["privacy-notice", "Privacy & Data Notice", "Privacy, what leaves this device, local storage"],
    ["import", "Import", "Import, restore, Simply Plural, PluralKit, Octocon, PluralSpace, OpenPlural"],
    ["export", "Export & automatic backups", "Backup, export, save, download, share, auto-backup, schedule, password lock"],
    ["device-sync", "Sync between devices", "Sync, devices, folder"],
    ["chat-cleanup", "Clean up deleted chat messages", "Chat cleanup, deleted messages"],
    ["storage", "Storage & encryption", "Encryption, passphrase, storage mode, delete all data, offline images"],
    ["data-inspector", "See your data", "Data inspector, records, deleted items, trash"],
    ["find-my-data", "Find my data", "Lost data, empty app, recovery, rescue"],
    ["privacy-cover", "Privacy cover", "Panic hide, grocery list, triple tap"],
    ["whats-new", "What's new", "Changelog, updates, version, release notes"],
    ["tour", "Tour & onboarding", "Feature tour, page tutorials, re-run setup"],
    ["preview", "Preview mode", "Preview mode, example, wiki walkthrough"],
    ["bug-report", "Found a bug?", "Bug report, issue, feedback, support"],
    ["disclaimer", "Medical disclaimer", "Disclaimer, not medical advice"],
  ];
  return SECTIONS.map(([id, title, blurb]) => ({
    type: "setting",
    id: `setting_${id}`,
    title,
    subtitle: "Settings",
    path: `/settings#${id}`,
    searchableText: joinNonEmpty([title, "settings", blurb]).toLowerCase(),
    sortDate: null,
  }));
}

// Installed mods (src/pages/Mods.jsx), and each page of a switched-on mod.
export function buildModRecords({ items = [] }) {
  const out = [];
  for (const m of items || []) {
    if (!m?.mod_id) continue;
    out.push({
      type: "mod",
      id: m.id,
      title: m.name || m.mod_id,
      subtitle: m.enabled ? "Mod" : "Mod · turned off",
      path: "/mods",
      searchableText: joinNonEmpty([m.name, m.mod_id, m.author, m.description, "mod mods add-on"]).toLowerCase(),
      sortDate: m.created_date,
    });
    if (!m.enabled) continue;
    for (const p of m.pages || []) {
      out.push({
        type: "mod",
        id: `${m.id}:${p.id}`,
        title: p.title,
        subtitle: `${m.name} · mod page`,
        path: `/mod/${m.mod_id}/${p.id}`,
        searchableText: joinNonEmpty([p.title, m.name]).toLowerCase(),
        sortDate: m.created_date,
      });
    }
  }
  return out;
}

export function buildSearchIndex(sources = {}) {
  const {
    alters, customFieldDefs,
    journals, supportJournals,
    bulletins, bulletinComments, polls,
    activities, sleep, activityCategories,
    tasks, dailyTaskTemplates,
    statusNotes, emotionCheckIns,
    therapyNotes,
    symptoms, symptomCheckIns,
    groups,
    diaryCards,
    systemCheckIns,
    locations,
    systemChangeEvents,
    alterNotes, alterMessages,
    wishes,
    goals, goalSteps, turns,
    reminders,
    groceries,
    chatMessages, chatChannels, frontingIds,
    groundingTechniques, innerWorldLocations,
    presences,
    contacts,
    systems,
    assets,
    mods,
    terms,
  } = sources;

  const records = [];
  records.push(...buildSettingsRecords({ terms: terms || {} }));
  records.push(...buildAlterRecords({ alters: alters || [], customFieldDefs: customFieldDefs || [] }));
  records.push(...buildJournalRecords({ items: journals || [] }));
  records.push(...buildSupportJournalRecords({ items: supportJournals || [] }));
  records.push(...buildBulletinRecords({ items: bulletins || [] }));
  records.push(...buildBulletinCommentRecords({ items: bulletinComments || [] }));
  records.push(...buildPollRecords({ items: polls || [] }));
  records.push(...buildActivityRecords({ items: activities || [] }));
  records.push(...buildSleepRecords({ items: sleep || [] }));
  records.push(...buildTaskRecords({ items: tasks || [] }));
  records.push(...buildDailyTaskTemplateRecords({ items: dailyTaskTemplates || [] }));
  records.push(...buildStatusNoteRecords({ items: statusNotes || [] }));
  records.push(...buildTherapyNoteRecords({ items: therapyNotes || [] }));
  records.push(...buildEmotionCheckInRecords({ items: emotionCheckIns || [] }));
  records.push(...buildSymptomRecords({ items: symptoms || [] }));
  records.push(...buildSymptomCheckInRecords({ items: symptomCheckIns || [], symptoms: symptoms || [] }));
  records.push(...buildGroupRecords({ items: groups || [], alters: alters || [] }));
  records.push(...buildDiaryCardRecords({ items: diaryCards || [] }));
  records.push(...buildSystemCheckInRecords({ items: systemCheckIns || [] }));
  records.push(...buildLocationRecords({ items: locations || [] }));
  records.push(...buildSystemChangeRecords({ items: systemChangeEvents || [] }));
  records.push(...buildAlterNoteRecords({ items: alterNotes || [], alters: alters || [] }));
  records.push(...buildAlterNoteRecords({ items: alterMessages || [], alters: alters || [] }));
  records.push(...buildWishRecords({ items: wishes || [], alters: alters || [] }));
  records.push(...buildGoalRecords({ items: goals || [], steps: goalSteps || [], alters: alters || [] }));
  records.push(...buildTurnRecords({ items: turns || [], alters: alters || [] }));
  records.push(...buildReminderRecords({ items: reminders || [] }));
  records.push(...buildGroceryRecords({ items: groceries || [] }));
  records.push(...buildChatMessageRecords({ items: chatMessages || [], channels: chatChannels || [], frontingIds: frontingIds || [] }));
  records.push(...buildGroundingTechniqueRecords({ items: groundingTechniques || [] }));
  records.push(...buildInnerWorldLocationRecords({ items: innerWorldLocations || [] }));
  records.push(...buildActivityCategoryRecords({ items: activityCategories || [] }));
  records.push(...buildPresenceRecords({ items: presences || [], alters: alters || [] }));
  records.push(...buildContactRecords({ items: contacts || [] }));
  records.push(...buildSystemRecords({ items: systems || [] }));
  records.push(...buildAssetRecords({ items: assets || [] }));
  records.push(...buildModRecords({ items: mods || [] }));
  // Plain note fields are indexed as typed, and a whisper in a note is
  // stored as its span — take any secret out of what the search scans.
  for (const r of records) {
    if (r.searchableText && r.searchableText.includes("whisper")) {
      r.searchableText = redactWhispers(r.searchableText).toLowerCase();
    }
  }
  return records;
}

/**
 * Filter an index by a query string. Substring, case-insensitive. The
 * caller can cap the returned length — defaults to 60, plenty for the
 * Dashboard dropdown which only shows a handful per type.
 */
export function searchIndex(index, query, limit = 60) {
  if (!query) return [];
  const q = String(query).trim().toLowerCase();
  if (q.length < 2) return [];
  const matches = [];
  for (const rec of index) {
    if (!rec || !rec.searchableText) continue;
    if (rec.searchableText.includes(q)) matches.push(rec);
    if (matches.length >= limit) break;
  }
  return matches;
}

/**
 * Group an array of result records by `type` for the dropdown UI.
 */
export function groupResults(results) {
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }
  return grouped;
}
