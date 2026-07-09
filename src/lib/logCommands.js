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
// Examples:
//   ~symptom:amnesia:4            ~symptom:anxiety:3:active     ~symptom:anxiety:inactive
//   ~feeling:good:happy:cheerful  ~feeling:body:flight:on edge  ~feeling:on edge
//   ~company:emma:active          ~activity:reading:active      ~activity:reading

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

export function buildCatalogues({ symptoms = [], contacts = [], activityCategories = [], customEmotions = [] } = {}) {
  return {
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
  const [symptoms, contacts, activityCategories, customEmotions] = await Promise.all([
    safeList(base44.entities.Symptom),
    safeList(base44.entities.Contact),
    safeList(base44.entities.ActivityCategory),
    safeList(base44.entities.CustomEmotion),
  ]);
  return buildCatalogues({ symptoms, contacts, activityCategories, customEmotions });
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
    if (isActive === true) return finish(nameEnd, { kind: "activityStart", categoryId: cat.id, name: cat.name, color: cat.color }, `${cat.name} · started`);
    if (isActive === false) return finish(nameEnd, { kind: "activityEnd", categoryId: cat.id, name: cat.name }, `${cat.name} · ended`);
    return finish(nameEnd, { kind: "activityLog", categoryId: cat.id, name: cat.name, color: cat.color }, cat.name);
  }

  return null;
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
      const item = addActiveActivity({ categoryId: plan.categoryId, name: plan.name, color: plan.color || null, startTime: now, alterIds: ctx.fronting_alter_ids, notes: "" });
      return item?.id || null;
    }
    case "activityLog": {
      const r = await base44.entities.Activity.create({
        timestamp: now, activity_name: plan.name,
        activity_category_ids: plan.categoryId ? [plan.categoryId] : [],
        ...(plan.color ? { color: plan.color } : {}),
        fronting_alter_ids: ctx.fronting_alter_ids, is_planned: false, status: ACTIVITY_STATUSES.LOGGED,
      });
      return r?.id || null;
    }
    case "activityEnd": {
      const running = getActiveActivities().find((a) => a.categoryId === plan.categoryId || lc(a.name) === lc(plan.name));
      if (running) { const res = await endAndLogActiveActivity(running.id, now); return res?.record?.id || null; }
      const r = await base44.entities.Activity.create({
        timestamp: now, activity_name: plan.name,
        activity_category_ids: plan.categoryId ? [plan.categoryId] : [],
        fronting_alter_ids: ctx.fronting_alter_ids, is_planned: false, status: ACTIVITY_STATUSES.LOGGED,
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
    // Only "active" (a running session). Plain "log it" (no end time) is the
    // header chevron; a PAST activity with a duration is out of scope here.
    const items = [{ insert: "active", terminal: true }].filter((it) => !q || it.insert.startsWith(q));
    return { header: "Active?", icon, canFinish: true, items };
  }

  if (type === "feeling") return feelingSuggestions(segments, catalogues, icon, query);
  return null;
}
