// Inline "~command" quick-logging.
//
// Anywhere text is typed (chat, bulletins, notes, status, activity notes,
// check-in steps…) a user can type a command that logs an entity inline — as
// if they'd entered it in Quick Check-In. Commands are parsed + executed ON
// SAVE (like whispers / mentions), and each executed command is replaced in the
// stored content with an inline chip (a <span class="log-chip">).
//
// Grammar:  ~[type]:[category]:[value]:[is_active]
//   type       symptom | habit | feeling(=emotion) | company(=with) | activity
//   category   which specific one (a symptom/emotion/contact/activity name; for
//              feelings the last path segment is the emotion, earlier segments
//              only guide the autocomplete)
//   value      severity 0–5 for a rating symptom (empty = just tick it)
//   is_active  active|on|start → running session; inactive|off|end → end it
//
// Token rules:
//   - Trigger:   a ~ at a word boundary (start, after whitespace, or after >).
//   - Span:      from ~ to end-of-line / a tag boundary (< >) / an optional
//                closing ~. Single spaces are allowed inside a segment, so
//                "on edge" and multi-word contact names work.
//   - Safe fail: if a command doesn't resolve to a real entity it is LEFT AS
//                LITERAL TEXT and nothing is logged — never log garbage, never
//                silently swallow typed text. Trailing prose after a valid
//                inline command is trimmed off (longest-resolvable-prefix), so
//                "~feeling:on edge and I feel tired" logs "On edge" and keeps
//                the rest as prose. A trailing keyword (…:active) needs a
//                newline or a closing ~ to separate it from following prose.
//
// FREE TEXT inside a command uses square brackets: key[the text]. The
// bracket bounds it cleanly against prose after the command, and the text
// can contain colons and quotes. A missing "]" means "everything to the
// end of the line belongs to this entry". (note=… without brackets still
// works, greedy to its segment's end.)
//
// Activity extras (any order, each its own :segment, after the name):
//   duration     45 / 45m / 1h / 1h30m — logs that many minutes ENDING now
//   note[…]      free-text note (n[…] works too)
//   urgent       marks it urgent (critical ⚡) — also: critical / important
//   start:…      explicit times instead of a duration. Military time (HHMM).
//                No date = today; day words and date[MM/DD/YYYY] (or a bare
//                [MM/DD/YYYY], YYYY-MM-DD works too) set the day. The first
//                HHMM is the start, a second is the end; an end date with no
//                time keeps the start's time. A future start saves as a PLAN.
//                  ~activity:work:start:0500:active            running since 5am
//                  ~activity:work:start:yesterday:0500:0700    5–7am yesterday
//                  ~activity:work:start:date[02/25/2026]0630:[02/27/2026]:note[work trip]
//
// Journal entries: ~journal:folder:title[…]:body[…] — folder optional
// (matched against your journal folders), title[] optional, body[] is the
// entry text.
//
// Examples:
//   ~symptom:amnesia:4            ~symptom:anxiety:3:active     ~symptom:anxiety:inactive
//   ~feeling:good:happy:cheerful  ~feeling:body:flight:on edge  ~feeling:on edge
//   ~company:emma:active          ~activity:reading:active      ~activity:reading
//   ~activity:eating:note[having cereal]:15m
//   ~activity:work:3h:note[covering for jase] lalala   ← "lalala" stays prose
//   ~journal:dreams:title[flying again]:body[it was the ocean one]

import { base44 } from "@/api/base44Client";
import { WHEEL } from "@/components/emotions/EmotionWheelPicker";
import { contactDisplayName } from "@/lib/contacts";
import { getActivePrimaryId, getActiveFronterIds } from "@/lib/frontingUtils";
import { startEncounter, endEncounterForContact, logVisit } from "@/lib/contactEncounters";
import { addActiveActivity, getActiveActivities, endAndLogActiveActivity } from "@/lib/activitySession";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";

// ── Type catalogue ──────────────────────────────────────────────────────────
export const COMMAND_TYPES = [
  { key: "symptom",  aliases: ["symptom", "symptoms", "sym"],                 label: "Symptom",  icon: "🩹", hint: "Log a symptom" },
  { key: "habit",    aliases: ["habit", "habits"],                            label: "Habit",    icon: "🔁", hint: "Log a habit" },
  { key: "feeling",  aliases: ["feeling", "feelings", "emotion", "emotions", "mood", "feel"], label: "Feeling", icon: "💗", hint: "Log an emotion" },
  { key: "company",  aliases: ["company", "with", "contact", "contacts"],     label: "Company",  icon: "👤", hint: "Log who you're with" },
  { key: "activity", aliases: ["activity", "activities", "act"],              label: "Activity", icon: "🎯", hint: "Log an activity" },
  { key: "journal",  aliases: ["journal", "journals", "entry", "j"],          label: "Journal",  icon: "📓", hint: "Write a journal entry" },
];

const ICON = Object.fromEntries(COMMAND_TYPES.map((t) => [t.key, t.icon]));

export function normalizeType(raw) {
  const q = (raw || "").trim().toLowerCase();
  if (!q) return null;
  const t = COMMAND_TYPES.find((x) => x.key === q || x.aliases.includes(q));
  return t ? t.key : null;
}

// active/on/start → true (begin a running session); inactive/off/end → false.
const ACTIVE_WORDS = {
  active: true, on: true, start: true, started: true, begin: true,
  inactive: false, off: false, end: false, ended: false, stop: false, stopped: false, done: false,
};

// Activity extras: "45" / "45m" / "1h" / "1h30m" → minutes (leading token
// only, so unbounded trailing prose survives). Urgency words → is_critical.
const URGENT_RE = /^\s*(urgent|critical|important|priority)\b/i;
const NOTE_RE = /^\s*(?:note|n)=([\s\S]*)$/i;
function parseDurationLead(text) {
  // No whitespace inside the token — a match must not swallow the space
  // before following prose ("…:30 and then" keeps "and then" intact).
  let m = /^\s*(\d+)h(?:(\d+)m?)?\b/i.exec(text);
  if (m) return { minutes: parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0), len: m[0].length };
  m = /^\s*(\d+)(m|min|mins)?\b/i.exec(text);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 24 * 60) return { minutes: n, len: m[0].length };
  }
  return null;
}
// key[free text] — the standard wrapper for free text inside a command.
// Returns { key, value, len } for a token at position `pos` (relative to
// text) whose key is in `keys`, or null. The value runs to the matching
// "]" or, when unclosed, to `bodyEnd` (everything until the end belongs
// to the entry — the user's rule).
function readBracketArg(text, pos, bodyEnd, keys) {
  const m = /^\s*([a-zA-Z]+)\[/.exec(text.slice(pos, bodyEnd));
  if (!m || !keys.includes(m[1].toLowerCase())) return null;
  const contentStart = pos + m[0].length;
  const close = text.indexOf("]", contentStart);
  const end = close > -1 && close < bodyEnd ? close : bodyEnd;
  return { key: m[1].toLowerCase(), value: text.slice(contentStart, end).trim(), len: (close > -1 && close < bodyEnd ? close + 1 : bodyEnd) - pos };
}

// "start" time-spec tokens: HHMM military time, day words, date brackets.
const DAY_WORDS = { today: 0, yesterday: -1, tomorrow: 1 };
function hhmmToMin(t) {
  const h = parseInt(t.slice(0, 2), 10), mi = parseInt(t.slice(2), 10);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}
// Leading-match one token of a start-spec segment. Returns
// { date?, dayOffset?, min?, len } or null. A date bracket may have an
// HHMM glued straight after it (date[02/25/2026]0630).
function parseTimeSpecLead(txt) {
  let m = /^\s*(?:date)?\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*(\d{4})?/.exec(txt);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    if (!Number.isNaN(d.getTime())) {
      const min = m[4] != null ? hhmmToMin(m[4]) : null;
      return { date: d, min, len: m[0].length };
    }
  }
  m = /^\s*(?:date)?\[(\d{4})-(\d{1,2})-(\d{1,2})\]\s*(\d{4})?/.exec(txt);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    if (!Number.isNaN(d.getTime())) {
      const min = m[4] != null ? hhmmToMin(m[4]) : null;
      return { date: d, min, len: m[0].length };
    }
  }
  m = /^\s*(today|yesterday|tomorrow)\b/i.exec(txt);
  if (m) return { dayOffset: DAY_WORDS[m[1].toLowerCase()], len: m[0].length };
  m = /^\s*(\d{4})\b/.exec(txt);
  if (m) {
    const min = hhmmToMin(m[1]);
    if (min != null) return { min, len: m[0].length };
  }
  return null;
}
const clk = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`;
}

// ── small utils ───────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lc(s) { return (s || "").trim().toLowerCase(); }

// Case-insensitive best match of `candidate` against a pool, by selector.
// Prefers exact label, then startsWith, then includes.
function bestMatch(pool, candidate, sel) {
  const c = lc(candidate);
  if (!c) return null;
  return (
    pool.find((x) => lc(sel(x)) === c) ||
    pool.find((x) => lc(sel(x)).startsWith(c)) ||
    pool.find((x) => lc(sel(x)).includes(c)) ||
    null
  );
}

// Longest word-boundary prefix of `raw` for which testFn returns truthy.
// Returns { match, len } (len = chars of raw consumed) or null. Tries the
// longest prefix first so trailing prose is trimmed, not the useful name.
function longestMatch(raw, testFn) {
  const s = raw || "";
  const cuts = [];
  const re = /\S(?=\s|$)/g; // last char of each word
  let m;
  while ((m = re.exec(s))) cuts.push(m.index + 1);
  if (!cuts.length) return null;
  for (let k = cuts.length - 1; k >= 0; k--) {
    const cut = cuts[k];
    const res = testFn(s.slice(0, cut).trim());
    if (res) return { match: res, len: cut };
  }
  return null;
}

// ── catalogues ──────────────────────────────────────────────────────────────
// Flattened, loggable emotion labels: category labels (except the "body"
// container), core names, subs, neutral flats, plus custom emotions. Deduped
// case-insensitively, canonical original casing kept.
function buildEmotionLabels(customEmotions = []) {
  const seen = new Set();
  const out = [];
  const add = (l) => {
    const k = lc(l);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(l);
  };
  for (const [key, node] of Object.entries(WHEEL)) {
    if (key !== "body") add(node.label); // Good / Bad / Neutral are loggable; "Body…" is a container
    if (node.flat) node.flat.forEach(add);
    if (node.cores) for (const [core, cd] of Object.entries(node.cores)) { add(core); (cd.subs || []).forEach(add); }
  }
  for (const ce of customEmotions) add(ce.label);
  return out.map((label) => ({ label }));
}

export function buildCatalogues({ symptoms = [], contacts = [], activityCategories = [], customEmotions = [], journalEntries = [] } = {}) {
  // Journal folders: the user's saved folder list plus every folder any
  // entry actually lives in (same union the journal widgets use).
  const folderSet = new Set();
  try { JSON.parse(localStorage.getItem("os_journal_folders") || "[]").forEach((f) => f && folderSet.add(f)); } catch { /* storage off */ }
  journalEntries.forEach((e) => { if (e?.folder) folderSet.add(e.folder); });
  return {
    journalFolders: [...folderSet],
    symptoms: symptoms
      .filter((s) => s && !s.is_archived)
      .map((s) => ({ id: s.id, label: s.label || "", category: s.category, type: s.type })),
    contacts: contacts
      .filter((c) => c && !c.is_archived)
      .map((c) => ({ id: c.id, name: contactDisplayName(c) })),
    activityCategories: (activityCategories || []).map((c) => ({ id: c.id, name: c.name || "", color: c.color || null })),
    emotions: buildEmotionLabels(customEmotions),
  };
}

async function safeList(entity) {
  try { return (await entity.list()) || []; } catch { return []; }
}

export async function fetchCatalogues() {
  const [symptoms, contacts, activityCategories, customEmotions, journalEntries] = await Promise.all([
    safeList(base44.entities.Symptom),
    safeList(base44.entities.Contact),
    safeList(base44.entities.ActivityCategory),
    safeList(base44.entities.CustomEmotion),
    safeList(base44.entities.JournalEntry),
  ]);
  return buildCatalogues({ symptoms, contacts, activityCategories, customEmotions, journalEntries });
}

// per-type match helpers on a built catalogue
function matchSymptom(text, category, catalogues) {
  return bestMatch(catalogues.symptoms.filter((s) => s.category === category), text, (s) => s.label);
}
function matchContact(text, catalogues) { return bestMatch(catalogues.contacts, text, (c) => c.name); }
function matchActivity(text, catalogues) { return bestMatch(catalogues.activityCategories, text, (c) => c.name); }
function matchEmotion(text, catalogues) {
  const e = bestMatch(catalogues.emotions, text, (x) => x.label);
  return e ? e.label : null;
}

// ── token detection (autocomplete) ──────────────────────────────────────────
// The ~command token the caret currently sits inside, or null. Bounded by a
// newline or a tag boundary (< >). A SPACE ends the token UNLESS the text
// between that space and the caret still contains a ':' — i.e. the user typed a
// colon after the space, so they're continuing the command across a multi-word
// value ("~activity:Watching TV:active"). Otherwise the space means they've
// moved on ("~feeling:...detached @name"), and @/-/+ autocomplete takes over.
// (A multi-word value being typed manually before any following colon won't
// keep the live dropdown past the space — pick it from the dropdown instead;
// the SAVE-time parser separately allows spaces inside a value.)
export function detectCommandToken(value, caret) {
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === "\n" || ch === "<" || ch === ">") return null;
    if (/\s/.test(ch)) {
      // Keep going past the space only if a real segment colon follows it
      // (a multi-word value continued with ":keyword"). Ignore a URL's "://"
      // so sharing a link after a command doesn't swallow the following prose.
      if (!value.slice(i + 1, caret).replace(/:\/\//g, "").includes(":")) return null;
      i -= 1;
      continue;
    }
    if (ch === "~") {
      const prev = i > 0 ? value[i - 1] : "";
      if (i === 0 || /\s/.test(prev) || prev === ">") {
        const body = value.slice(i + 1, caret);
        return { start: i, body, segments: body.split(":") };
      }
      return null;
    }
    i -= 1;
  }
  return null;
}

// ── resolution ──────────────────────────────────────────────────────────────
// Resolve the command starting at `tildeIndex`. Returns
//   { start, end, type, isActive, plan, label, icon }  or null.
// `end` is where the resolved command stops in `text` (chip replaces
// text[start..end]); trailing prose after `end` is left literal.
function resolveCommandAt(text, tildeIndex, catalogues) {
  // read the greedy body up to a terminator
  let j = tildeIndex + 1;
  while (j < text.length && !"\n~<>".includes(text[j])) j++;
  const bodyEnd = j;
  const hadClose = text[bodyEnd] === "~";
  const body = text.slice(tildeIndex + 1, bodyEnd);
  if (!body.trim()) return null;

  // segments with absolute offsets in `text`
  const segs = [];
  let rel = 0;
  for (const part of body.split(":")) {
    const absStart = tildeIndex + 1 + rel;
    segs.push({ text: part, absStart, absEnd: absStart + part.length });
    rel += part.length + 1;
  }

  const type = normalizeType(segs[0].text);
  if (!type) return null;
  const icon = ICON[type];

  let rest = segs.slice(1);
  // trailing is_active keyword (must be an exact whole segment)
  let isActive; // undefined | true | false
  let keywordSeg = null;
  if (rest.length) {
    const kw = lc(rest[rest.length - 1].text);
    if (kw in ACTIVE_WORDS) { isActive = ACTIVE_WORDS[kw]; keywordSeg = rest[rest.length - 1]; rest = rest.slice(0, -1); }
  }
  // value segments are colon-clean (no trailing prose) when the body is bounded
  const bounded = hadClose || !!keywordSeg;
  const finish = (consumedEnd, plan, label) => ({
    start: tildeIndex,
    end: hadClose ? bodyEnd + 1 : (keywordSeg ? keywordSeg.absEnd : consumedEnd),
    type, isActive, plan, label, icon,
  });

  if (type === "symptom" || type === "habit") {
    if (!rest.length) return null;
    const nameSeg = rest[0];
    const sevSeg = rest[1];
    const nameTrimmable = !bounded && rest.length === 1;
    let entity, nameEnd;
    if (nameTrimmable) {
      const lm = longestMatch(nameSeg.text, (c) => matchSymptom(c, type, catalogues));
      if (!lm) return null;
      entity = lm.match; nameEnd = nameSeg.absStart + lm.len;
    } else {
      entity = matchSymptom(nameSeg.text, type, catalogues);
      if (!entity) return null;
      nameEnd = nameSeg.absEnd;
    }
    let severity = null, consumedEnd = nameEnd;
    if (sevSeg) {
      const sevTrimmable = !bounded; // sevSeg is the last value seg here
      const sm = /^\s*(\d+)/.exec(sevSeg.text);
      if (sm) {
        // Consume the numeric token regardless of type; only rating symptoms
        // keep it as a severity (booleans ignore the number but still swallow
        // it so "~symptom:amnesia:4" leaves no dangling ":4").
        const n = parseInt(sm[1], 10);
        if (entity.type === "rating" && n >= 0 && n <= 5) severity = n;
        consumedEnd = sevTrimmable ? sevSeg.absStart + sm[0].length : sevSeg.absEnd;
      } else {
        // Non-numeric value segment: consume if bounded (clean), else leave prose.
        consumedEnd = sevTrimmable ? nameEnd : sevSeg.absEnd;
      }
    }
    const sevTxt = severity != null ? ` · ${severity}` : "";
    if (isActive === true) return finish(consumedEnd, { kind: "symptomSessionStart", symptom_id: entity.id, severity }, `${entity.label}${sevTxt} · started`);
    if (isActive === false) return finish(consumedEnd, { kind: "symptomSessionEnd", symptom_id: entity.id }, `${entity.label} · ended`);
    return finish(consumedEnd, { kind: "symptomCheckIn", symptom_id: entity.id, severity }, `${entity.label}${sevTxt}`);
  }

  if (type === "feeling") {
    if (!rest.length) return null;
    const leaf = rest[rest.length - 1];
    let label, leafEnd;
    if (!bounded) {
      const lm = longestMatch(leaf.text, (c) => matchEmotion(c, catalogues));
      if (!lm) return null;
      label = lm.match; leafEnd = leaf.absStart + lm.len;
    } else {
      label = matchEmotion(leaf.text, catalogues);
      if (!label) return null;
      leafEnd = leaf.absEnd;
    }
    return finish(leafEnd, { kind: "emotion", label }, label);
  }

  if (type === "company") {
    if (!rest.length) return null;
    const nameSeg = rest[0];
    const nameTrimmable = !bounded && rest.length === 1;
    let contact, nameEnd;
    if (nameTrimmable) {
      const lm = longestMatch(nameSeg.text, (c) => matchContact(c, catalogues));
      if (!lm) return null;
      contact = lm.match; nameEnd = nameSeg.absStart + lm.len;
    } else {
      contact = matchContact(nameSeg.text, catalogues);
      if (!contact) return null;
      nameEnd = nameSeg.absEnd;
    }
    if (isActive === false) return finish(nameEnd, { kind: "companyEnd", contact_id: contact.id }, `left ${contact.name}`);
    if (isActive === true) return finish(nameEnd, { kind: "companyStart", contact_id: contact.id }, `with ${contact.name}`);
    return finish(nameEnd, { kind: "companyVisit", contact_id: contact.id }, `saw ${contact.name}`);
  }

  if (type === "activity") {
    if (!rest.length) return null;
    const nameSeg = rest[0];
    const nameTrimmable = !bounded && rest.length === 1;
    let cat, nameEnd;
    if (nameTrimmable) {
      const lm = longestMatch(nameSeg.text, (c) => matchActivity(c, catalogues));
      if (!lm) return null;
      cat = lm.match; nameEnd = nameSeg.absStart + lm.len;
    } else {
      cat = matchActivity(nameSeg.text, catalogues);
      if (!cat) return null;
      nameEnd = nameSeg.absEnd;
    }
    // Optional extras, each its own :segment after the name, any order:
    // a duration, a note=…, an urgency word. Stop at the first segment
    // that's none of those — it stays literal prose (safe-fail).
    let duration = null, note = null, critical = false;
    let startSpec = null; // { startDate?, startOffset?, startMin, endDate?, endOffset?, endMin? }
    let consumedEnd = nameEnd;
    // Consume consecutive time-spec segments starting AFTER rest[fromK].
    // Returns { spec, kEnd, lastEnd }; spec is null-ish startMin when no
    // actual clock time appeared (caller rolls back — safe-fail).
    const consumeTimeSpec = (fromK) => {
      const spec = {};
      let kk = fromK, lastEnd = null;
      while (kk + 1 < rest.length) {
        const nxt = rest[kk + 1];
        const lastUnb = !bounded && kk + 1 === rest.length - 1;
        const tk = parseTimeSpecLead(nxt.text);
        if (!tk) break;
        const beforeStart = spec.startMin == null;
        if (tk.date) { if (beforeStart) spec.startDate = tk.date; else spec.endDate = tk.date; }
        if (tk.dayOffset !== undefined) { if (beforeStart) spec.startOffset = tk.dayOffset; else spec.endOffset = tk.dayOffset; }
        if (tk.min != null) {
          if (tk.date && !beforeStart) spec.endMin = tk.min; // glued end date+time
          else if (beforeStart) spec.startMin = tk.min;
          else spec.endMin = tk.min;
        }
        kk += 1;
        lastEnd = lastUnb ? nxt.absStart + tk.len : nxt.absEnd;
      }
      return { spec, kEnd: kk, lastEnd };
    };
    for (let k = 1; k < rest.length; k++) {
      const segX = rest[k];
      const isLastUnbounded = !bounded && k === rest.length - 1;
      // start:… — explicit times (the keyword form).
      if (/^\s*start\s*$/i.test(segX.text)) {
        const res = consumeTimeSpec(k);
        if (res.spec.startMin == null) break; // no time → "start" stays prose (safe-fail)
        startSpec = res.spec;
        consumedEnd = res.lastEnd ?? segX.absEnd;
        k = res.kEnd;
        continue;
      }
      // Bare time spec, no keyword needed: ~activity:sing:1630:30m — a
      // 4-digit HHMM (or a day word / date bracket leading to one) reads
      // as the start time (owner report: the intuitive form did nothing).
      if (!startSpec && parseTimeSpecLead(segX.text)) {
        const res = consumeTimeSpec(k - 1); // consume from THIS segment
        if (res.spec.startMin != null) {
          startSpec = res.spec;
          consumedEnd = res.lastEnd ?? segX.absEnd;
          k = res.kEnd;
          continue;
        }
        break; // day/date with no clock time → prose
      }
      // note[…] — scanned against the RAW text so it can span colons and
      // stops exactly at the closing bracket (prose after it stays prose).
      // Unclosed = everything to the end of the command body is the note.
      const br = readBracketArg(text, segX.absStart, bodyEnd, ["note", "n"]);
      if (br) {
        note = br.value || null;
        consumedEnd = segX.absStart + br.len;
        while (k + 1 < rest.length && rest[k + 1].absStart < consumedEnd) k++;
        continue;
      }
      const nm = NOTE_RE.exec(segX.text);
      if (nm) { note = nm[1].trim() || null; consumedEnd = segX.absEnd; continue; }
      const d = parseDurationLead(segX.text);
      if (d) { duration = d.minutes; consumedEnd = isLastUnbounded ? segX.absStart + d.len : segX.absEnd; continue; }
      const u = URGENT_RE.exec(segX.text);
      if (u) { critical = true; consumedEnd = isLastUnbounded ? segX.absStart + u[0].length : segX.absEnd; continue; }
      break;
    }
    // Explicit start/end → an ISO start plus a computed duration.
    let startIso = null, whenTxt = "";
    if (startSpec) {
      const nowD = new Date();
      const dayFor = (date, offset) => date
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
        : new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + (offset || 0));
      const sDay = dayFor(startSpec.startDate, startSpec.startOffset);
      const start = new Date(sDay.getTime() + startSpec.startMin * 60000);
      let end = null;
      if (startSpec.endMin != null || startSpec.endDate || startSpec.endOffset !== undefined) {
        const eDay = (startSpec.endDate || startSpec.endOffset !== undefined)
          ? dayFor(startSpec.endDate, startSpec.endOffset) : sDay;
        const eMin = startSpec.endMin != null ? startSpec.endMin : startSpec.startMin;
        end = new Date(eDay.getTime() + eMin * 60000);
        // 2300–0100 with no end date crosses midnight
        if (end <= start && !startSpec.endDate && startSpec.endOffset === undefined) end = new Date(end.getTime() + 24 * 3600000);
      }
      if (end && end > start) duration = Math.round((end - start) / 60000);
      startIso = start.toISOString();
      const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      const dayTag = sameDay(start, nowD) ? "" : ` · ${start.getMonth() + 1}/${start.getDate()}`;
      whenTxt = ` · ${clk(startSpec.startMin)}${startSpec.endMin != null || end ? `\u2013${clk(startSpec.endMin != null ? startSpec.endMin : startSpec.startMin)}` : ""}${dayTag}`;
    }
    // The note rides IN the label (quoted, truncated) — a bare 📝 marker
    // left the note unreadable everywhere the token renders (check-in log,
    // status history — owner report).
    const noteTxt = note ? ` · \u201c${note.length > 60 ? `${note.slice(0, 57)}\u2026` : note}\u201d` : "";
    const extras = `${whenTxt}${duration && !startSpec ? ` · ${fmtDur(duration)}` : duration && startSpec ? ` (${fmtDur(duration)})` : ""}${critical ? " · ⚡" : ""}${noteTxt}`;
    if (isActive === true) return finish(consumedEnd, { kind: "activityStart", categoryId: cat.id, name: cat.name, color: cat.color, note, critical, startIso }, `${cat.name}${extras} · started`);
    if (isActive === false) return finish(consumedEnd, { kind: "activityEnd", categoryId: cat.id, name: cat.name, note, critical, duration, startIso }, `${cat.name}${extras} · ended`);
    return finish(consumedEnd, { kind: "activityLog", categoryId: cat.id, name: cat.name, color: cat.color, note, critical, duration, startIso }, `${cat.name}${extras}`);
  }

  if (type === "journal") {
    // ~journal[:folder]:title[…]:body[…] — folder is a plain segment
    // matched against the user's journal folders; title[]/body[] are
    // bracket args in any order. At least one of title/body must be
    // present (safe-fail otherwise).
    let folder = null, title = null, body = null;
    let pos = segs[0].absEnd; // after "journal"
    let consumedEnd = segs[0].absEnd;
    while (pos < bodyEnd && text[pos] === ":") {
      const argStart = pos + 1;
      const arg = readBracketArg(text, argStart, bodyEnd, ["title", "body", "note", "text"]);
      if (arg) {
        if (arg.key === "title") title = arg.value || null;
        else body = arg.value || null; // body / note / text
        pos = argStart + arg.len;
        consumedEnd = pos;
        continue;
      }
      // plain segment → folder candidate (first one only)
      let segEnd = argStart;
      while (segEnd < bodyEnd && text[segEnd] !== ":") segEnd++;
      const raw = text.slice(argStart, segEnd).trim();
      const match = folder === null && raw ? bestMatch(catalogues.journalFolders, raw, (f) => f) : null;
      if (match) { folder = match; pos = segEnd; consumedEnd = segEnd; continue; }
      break; // unknown plain segment → prose from here
    }
    if (title === null && body === null) return null;
    const label = `${folder ? `${folder} · ` : ""}${title || (body ? (body.length > 30 ? `${body.slice(0, 27)}\u2026` : body) : "entry")}`;
    return {
      start: tildeIndex,
      end: hadClose && bodyEnd + 1 >= consumedEnd ? bodyEnd + 1 : consumedEnd,
      type, isActive: undefined,
      plan: { kind: "journalEntry", folder, title, body },
      label, icon,
    };
  }

  return null;
}

// Why a command-LIKE token (a known ~type that didn't resolve) failed —
// one short, fixable sentence. Mirrors resolveCommandAt's null paths.
function explainFailure(text, tildeIndex, catalogues) {
  let j = tildeIndex + 1;
  while (j < text.length && !"\n~<>".includes(text[j])) j++;
  const body = text.slice(tildeIndex + 1, j);
  const segs = body.split(":").map((x) => x.trim());
  const type = normalizeType(segs[0]);
  if (!type) return null;
  const rest = segs.slice(1).filter(Boolean);
  const name = rest[0] || "";
  if (type === "symptom" || type === "habit") {
    if (!name) return `~${type} needs a name \u2014 like ~${type}:anxiety:3`;
    if (!matchSymptom(name, type, catalogues)) return `No ${type} called \u201c${name}\u201d \u2014 it has to match one from your list`;
  }
  if (type === "feeling") {
    if (!name) return "~feeling needs an emotion \u2014 like ~feeling:on edge";
    return `No feeling matched \u201c${rest[rest.length - 1]}\u201d \u2014 the last part has to be an emotion from the wheel`;
  }
  if (type === "company") {
    if (!name) return "~company needs a contact \u2014 like ~company:emma";
    if (!matchContact(name, catalogues)) return `No contact called \u201c${name}\u201d`;
  }
  if (type === "activity") {
    if (!name) return "~activity needs an activity \u2014 like ~activity:reading:30m";
    if (!matchActivity(name, catalogues)) return `No activity called \u201c${name}\u201d \u2014 it has to match one of your activity categories`;
  }
  if (type === "journal") return "~journal needs title[\u2026] or body[\u2026] \u2014 like ~journal:body[dear diary]";
  return `\u201c~${body.slice(0, 30)}\u201d isn\u2019t a complete ~${type} command`;
}

// Command-LIKE tokens that failed to resolve: a ~ at a word boundary whose
// first segment IS a known type but that resolveCommandAt rejects. Plain
// prose tildes (~5 min) are not command-like and never flagged.
export function findCommandProblems(text, catalogues) {
  const problems = [];
  if (!text || !text.includes("~")) return problems;
  const resolved = parseLogCommands(text, catalogues);
  let i = 0;
  while (i < text.length) {
    if (text[i] === "~") {
      const inResolved = resolved.some((r) => i >= r.start && i < r.end);
      const prev = i > 0 ? text[i - 1] : "";
      const boundary = i === 0 || /\s/.test(prev) || prev === ">";
      if (!inResolved && boundary) {
        const reason = explainFailure(text, i, catalogues);
        if (reason) problems.push({ index: i, reason });
      }
    }
    i += 1;
  }
  return problems;
}

// Every resolvable, non-overlapping command in `text`, left to right.
export function parseLogCommands(text, catalogues) {
  const out = [];
  if (!text || !text.includes("~")) return out;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "~") {
      const prev = i > 0 ? text[i - 1] : "";
      const boundary = i === 0 || /\s/.test(prev) || prev === ">";
      if (boundary) {
        const r = resolveCommandAt(text, i, catalogues);
        if (r && r.end > r.start) { out.push(r); i = r.end; continue; }
      }
    }
    i += 1;
  }
  return out;
}

// ── execution ───────────────────────────────────────────────────────────────
function attributionIds(sessions) {
  const primary = getActivePrimaryId(sessions);
  const all = getActiveFronterIds(sessions);
  return primary ? [primary, ...all.filter((id) => id !== primary)] : all;
}

async function executePlan(plan, ctx) {
  const now = ctx.now;
  switch (plan.kind) {
    case "symptomCheckIn": {
      const r = await base44.entities.SymptomCheckIn.create({ symptom_id: plan.symptom_id, timestamp: now, severity: plan.severity ?? null });
      return r?.id || null;
    }
    case "symptomSessionStart": {
      const r = await base44.entities.SymptomSession.create({
        symptom_id: plan.symptom_id, start_time: now, is_active: true,
        severity_snapshots: plan.severity != null ? [{ severity: plan.severity, timestamp: now }] : [],
      });
      return r?.id || null;
    }
    case "symptomSessionEnd": {
      const active = await base44.entities.SymptomSession.filter({ is_active: true });
      const s = (active || []).find((x) => x.symptom_id === plan.symptom_id);
      if (s) { await base44.entities.SymptomSession.update(s.id, { is_active: false, end_time: now }); return s.id; }
      return null;
    }
    case "emotion": {
      const r = await base44.entities.EmotionCheckIn.create({ timestamp: now, emotions: [plan.label], fronting_alter_ids: ctx.fronting_alter_ids });
      return r?.id || null;
    }
    case "companyStart": { const r = await startEncounter(plan.contact_id); return r?.id || null; }
    case "companyEnd": { const r = await endEncounterForContact(plan.contact_id); return r?.id || null; }
    case "companyVisit": { const r = await logVisit(plan.contact_id); return r?.id || null; }
    case "activityStart": {
      const item = addActiveActivity({ categoryId: plan.categoryId, name: plan.name, color: plan.color || null, startTime: plan.startIso || now, alterIds: ctx.fronting_alter_ids, notes: plan.note || "" });
      return item?.id || null;
    }
    case "activityLog": {
      // start:… gives an explicit start (duration, if any, runs FROM it).
      // A bare duration keeps the old reading: that many minutes ENDING
      // now, like the log modal's end-anchored presets.
      const start = plan.startIso
        ? plan.startIso
        : plan.duration ? new Date(Date.parse(now) - plan.duration * 60000).toISOString() : now;
      // A future start is a plan, not history — save it as scheduled so
      // the tally never counts something that hasn't happened.
      const isFuture = Date.parse(start) > Date.parse(now);
      const r = await base44.entities.Activity.create({
        timestamp: start, activity_name: plan.name,
        activity_category_ids: plan.categoryId ? [plan.categoryId] : [],
        ...(plan.color ? { color: plan.color } : {}),
        duration_minutes: plan.duration || null,
        notes: plan.note || null,
        ...(plan.critical ? { is_critical: true } : {}),
        fronting_alter_ids: ctx.fronting_alter_ids,
        is_planned: isFuture, status: isFuture ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED,
      });
      return r?.id || null;
    }
    case "activityEnd": {
      const running = getActiveActivities().find((a) => a.categoryId === plan.categoryId || lc(a.name) === lc(plan.name));
      if (running) { const res = await endAndLogActiveActivity(running.id, now); return res?.record?.id || null; }
      const start = plan.duration ? new Date(Date.parse(now) - plan.duration * 60000).toISOString() : now;
      const r = await base44.entities.Activity.create({
        timestamp: start, activity_name: plan.name,
        activity_category_ids: plan.categoryId ? [plan.categoryId] : [],
        duration_minutes: plan.duration || null,
        notes: plan.note || null,
        ...(plan.critical ? { is_critical: true } : {}),
        fronting_alter_ids: ctx.fronting_alter_ids, is_planned: false, status: ACTIVITY_STATUSES.LOGGED,
      });
      return r?.id || null;
    }
    case "journalEntry": {
      const r = await base44.entities.JournalEntry.create({
        title: plan.title || null,
        content: plan.body || "",
        folder: plan.folder || null,
        timestamp: now,
      });
      return r?.id || null;
    }
    default: return null;
  }
}

function chipHtml({ icon, label, type, entityId }) {
  const attrs = `class="log-chip" data-log-type="${esc(type)}"${entityId ? ` data-entity-id="${esc(entityId)}"` : ""}`;
  return `<span ${attrs}>${icon} ${esc(label)}</span>`;
}

// For plain (non-rich) surfaces the surrounding literal text must be escaped +
// line-breaks preserved so the whole note renders correctly once RichText
// routes it through the rich renderer (a chip is present).
function passthrough(seg, isRich) {
  if (isRich) return seg;
  return String(seg).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");
}

// Parse + execute every resolvable command in `content`, replacing each with a
// chip span (or a plain "icon label" token when `chips:false`, for surfaces
// that render their text as plain — e.g. status notes / timeline badges).
// Returns { content, logged }. When nothing resolves the content is returned
// byte-for-byte unchanged (so plain notes stay plain).
export async function applyLogCommands(content, { isRich = true, chips = true } = {}) {
  if (!content || typeof content !== "string" || !content.includes("~")) return { content, logged: [] };
  const catalogues = await fetchCatalogues();
  // A broken command BLOCKS the save with a fixable message (owner rule) —
  // nothing is logged and nothing is sent, so the text stays editable.
  // Only command-LIKE tokens block; a plain prose "~" never does.
  const problems = findCommandProblems(content, catalogues);
  if (problems.length) {
    const err = new Error(problems[0].reason + (problems.length > 1 ? ` (+${problems.length - 1} more)` : ""));
    err.name = "LogCommandFormatError";
    err.problems = problems;
    throw err;
  }
  const matches = parseLogCommands(content, catalogues);
  if (!matches.length) return { content, logged: [] };

  let sessions = [];
  try { sessions = await base44.entities.FrontingSession.filter({ is_active: true }); } catch { sessions = []; }
  const ctx = { fronting_alter_ids: attributionIds(sessions || []), now: new Date().toISOString() };

  const logged = [];
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    let entityId = null;
    try { entityId = await executePlan(m.plan, ctx); } catch { entityId = null; }
    if (chips) {
      out += passthrough(content.slice(cursor, m.start), isRich);
      out += chipHtml({ icon: m.icon, label: m.label, type: m.type, entityId });
    } else {
      // Plain-text surfaces: leave the surrounding text untouched, drop a
      // readable "icon label" token in place of the command.
      out += content.slice(cursor, m.start) + `${m.icon} ${m.label}`;
    }
    cursor = m.end;
    logged.push({ type: m.type, label: m.label, entityId });
  }
  out += chips ? passthrough(content.slice(cursor), isRich) : content.slice(cursor);
  return { content: out, logged };
}

// ── autocomplete suggestions ─────────────────────────────────────────────────
// Rows show the LITERAL text that gets inserted. Each item is { insert,
// terminal }: a non-terminal pick appends ":" and advances to the next section;
// a terminal pick just closes. The "log it / finish" action is the header
// chevron (canFinish), which drops any trailing ":" and ends the command — so a
// plain selection never auto-adds a space.

function filterByLabel(pool, query, sel) {
  const q = lc(query);
  if (!q) return pool;
  const starts = pool.filter((x) => lc(sel(x)).startsWith(q));
  const incl = pool.filter((x) => !lc(sel(x)).startsWith(q) && lc(sel(x)).includes(q));
  return [...starts, ...incl];
}

function feelingSuggestions(segments, catalogues, icon, query) {
  const path = segments.slice(1, -1).map((s) => s.trim()).filter(Boolean);
  const q = lc(query);
  const leafSearch = (limit = 8) =>
    catalogues.emotions.filter((e) => q && lc(e.label).includes(q)).slice(0, limit)
      .map((e) => ({ insert: e.label, terminal: true }));

  if (path.length === 0) {
    // Categories fill their short key (good/bad/neutral/body); the leaf that
    // actually resolves is whatever's typed last.
    const cats = Object.keys(WHEEL).map((k) => ({ insert: k, terminal: false })).filter((c) => !q || c.insert.startsWith(q));
    return { header: "Feeling", icon, canFinish: false, items: [...cats, ...leafSearch(6)].slice(0, 8) };
  }
  const catEntry = Object.entries(WHEEL).find(([k, v]) => k === lc(path[0]) || lc(v.label) === lc(path[0]));
  if (!catEntry) return { header: "Feeling", icon, canFinish: true, items: leafSearch() };
  const [, cat] = catEntry;
  if (path.length === 1) {
    if (cat.cores) {
      const cores = Object.keys(cat.cores).map((core) => ({ insert: core, terminal: false })).filter((c) => !q || lc(c.insert).startsWith(q));
      const subs = q ? Object.values(cat.cores).flatMap((cd) => cd.subs || []).filter((l) => lc(l).includes(q)).map((l) => ({ insert: l, terminal: true })) : [];
      return { header: cat.label, icon, canFinish: true, items: [...cores, ...subs].slice(0, 8) };
    }
    if (cat.flat) {
      return { header: cat.label, icon, canFinish: true, items: cat.flat.filter((l) => !q || lc(l).includes(q)).map((l) => ({ insert: l, terminal: true })).slice(0, 8) };
    }
  }
  if (path.length >= 2 && cat.cores) {
    const coreName = Object.keys(cat.cores).find((c) => lc(c) === lc(path[1]));
    const core = coreName ? cat.cores[coreName] : null;
    if (core) return { header: coreName, icon, canFinish: true, items: (core.subs || []).filter((l) => !q || lc(l).includes(q)).map((l) => ({ insert: l, terminal: true })).slice(0, 8) };
  }
  return { header: "Feeling", icon, canFinish: true, items: leafSearch() };
}

// Staged suggestions for the autocomplete dropdown. `segments` is the raw
// split from detectCommandToken (last item = the in-progress query). Returns
// { header, icon, canFinish, items:[{insert, terminal}] } or null.
export function buildCommandSuggestions({ segments, catalogues }) {
  if (!segments || !segments.length) return null;
  // Stage 0 — pick the type.
  if (segments.length === 1) {
    const q = lc(segments[0]);
    const items = COMMAND_TYPES
      .filter((t) => !q || t.key.startsWith(q) || t.aliases.some((a) => a.startsWith(q)))
      .map((t) => ({ insert: t.key, terminal: false }));
    return items.length ? { header: "Log…", icon: "~", canFinish: false, items } : null;
  }
  const type = normalizeType(segments[0]);
  if (!type) return null;
  const icon = ICON[type];
  const query = segments[segments.length - 1];
  const q = lc(query);

  if (type === "symptom" || type === "habit") {
    if (segments.length === 2) {
      const pool = catalogues.symptoms.filter((s) => s.category === type);
      const items = filterByLabel(pool, query, (s) => s.label).slice(0, 8).map((s) => ({ insert: s.label, terminal: false }));
      return { header: type === "habit" ? "Habit" : "Symptom", icon, canFinish: false, items };
    }
    const entity = matchSymptom(segments[1], type, catalogues);
    // Rating symptom → severity 0–5 (its own stage), then active/inactive.
    if (segments.length === 3 && entity?.type === "rating") {
      const items = [];
      for (let n = 0; n <= 5; n++) if (!q || String(n).startsWith(q)) items.push({ insert: String(n), terminal: false });
      return { header: "Severity", icon, canFinish: true, items };
    }
    const items = [{ insert: "active", terminal: true }, { insert: "inactive", terminal: true }].filter((it) => !q || it.insert.startsWith(q));
    return { header: "Active?", icon, canFinish: true, items };
  }

  if (type === "company") {
    if (segments.length === 2) {
      const items = filterByLabel(catalogues.contacts, query, (c) => c.name).slice(0, 8).map((c) => ({ insert: c.name, terminal: false }));
      return { header: "Company", icon, canFinish: false, items };
    }
    const items = [{ insert: "active", terminal: true }, { insert: "inactive", terminal: true }].filter((it) => !q || it.insert.startsWith(q));
    return { header: "Active?", icon, canFinish: true, items };
  }

  if (type === "activity") {
    if (segments.length === 2) {
      const items = filterByLabel(catalogues.activityCategories, query, (c) => c.name).slice(0, 8).map((c) => ({ insert: c.name, terminal: false }));
      return { header: "Activity", icon, canFinish: false, items };
    }
    // After "start" (or mid time-spec): day words, a date, military times.
    const prev = lc(segments[segments.length - 2] || "");
    const midSpec = prev === "start" || prev in DAY_WORDS || /^\d{4}$/.test(prev) || /\[.*\]\s*\d{0,4}$/.test(prev);
    if (midSpec) {
      const items = [
        { insert: "today", terminal: false }, { insert: "yesterday", terminal: false }, { insert: "tomorrow", terminal: false },
        { insert: "date[", terminal: true },
      ].filter((it) => !q || it.insert.startsWith(q));
      return { header: "When (HHMM \u00b7 start, then end)", icon, canFinish: true, items };
    }
    // Extras, any order: a duration (ends now), start:… times, note[…],
    // urgent, or "active" to start a running session.
    const items = [
      { insert: "active", terminal: true },
      { insert: "start", terminal: false },
      { insert: "15m", terminal: false }, { insert: "30m", terminal: false },
      { insert: "1h", terminal: false }, { insert: "2h", terminal: false },
      { insert: "note[", terminal: true },
      { insert: "urgent", terminal: false },
    ].filter((it) => !q || it.insert.startsWith(q));
    return { header: "Extras", icon, canFinish: true, items };
  }

  if (type === "journal") {
    if (segments.length === 2) {
      const folders = filterByLabel(catalogues.journalFolders.map((f) => ({ name: f })), query, (f) => f.name)
        .slice(0, 6).map((f) => ({ insert: f.name, terminal: false }));
      const args = [{ insert: "title[", terminal: true }, { insert: "body[", terminal: true }]
        .filter((it) => !q || it.insert.startsWith(q));
      return { header: "Journal", icon, canFinish: false, items: [...folders, ...args].slice(0, 8) };
    }
    const items = [{ insert: "title[", terminal: true }, { insert: "body[", terminal: true }]
      .filter((it) => !q || it.insert.startsWith(q));
    return { header: "Entry", icon, canFinish: false, items };
  }

  if (type === "feeling") return feelingSuggestions(segments, catalogues, icon, query);
  return null;
}
