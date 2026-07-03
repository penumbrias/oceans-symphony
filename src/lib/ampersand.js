// Ampersand (.ampar) archive importer.
//
// Ampersand (https://codeberg.org/Ampersand/app) is another plural-system app.
// Its `.ampar` "archive" export is, on the wire:
//
//   [10-byte magic] [ msgpack value ] [ msgpack value ] ...   (concatenated)
//
//   magic = "AMPAR" 0x00 0x00 <version> 0x00 0x00   (version 1 or 2)
//   each value = { table: <string>, data: <record> }
//   first two values are { table:"__revision", data:<int> } and
//   { table:"__config", data:{...} } — we skip both.
//   data records use Ampersand's serialization: Dates ride the msgpack
//   timestamp extension; Maps/Sets/Files become plain `{_meta, value}` objects.
//
// Ampersand supports MULTIPLE systems (the `systems` table; members link to one
// via `member.system`), which maps perfectly onto Oceans Symphony's own
// multi-system model: we create ONE OS system per Ampersand system and drop that
// system's members/fronting/journals into it.
//
// Field names below are taken straight from Ampersand's source
// (src/lib/db/entities.d.ts) — Member, System, FrontingEntry, JournalPost,
// BoardMessage, Tag, CustomField, Note. The OS-side shapes match the existing
// PluralKit importer (src/lib/pluralKit.js: name/pronouns/description/color/
// avatar_url/banner_url/tags/custom_fields/is_archived).

import { decodeMulti } from './msgpackLite';

const AMPAR_MAGIC = [0x41, 0x4d, 0x50, 0x41, 0x52]; // "AMPAR"

function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `amp-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function isAmparBuffer(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return b.length >= 10 && AMPAR_MAGIC.every((c, i) => b[i] === c);
}

// Reverse Ampersand's `_meta` serialization wrappers (Map/Set/File/escaped).
// Dates and Uint8Arrays are produced directly by the msgpack decoder and pass
// through untouched.
function revive(value) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(revive);
  if (typeof value === 'object') {
    if (value.__ext !== undefined) return value; // unknown ext kept raw
    const meta = value._meta;
    if (meta && typeof meta === 'object') {
      if (meta.type === 'map') return new Map((value.value || []).map(([k, v]) => [revive(k), revive(v)]));
      if (meta.type === 'set') return (value.value || []).map(revive);
      if (meta.type === 'file') return { __file: true, name: meta.name, mimeType: meta.mimeType, bytes: value.value };
      if (meta.type === 'escaped-meta') return revive({ ...value, _meta: meta.value });
    }
    const out = {};
    for (const k in value) out[k] = revive(value[k]);
    return out;
  }
  return value;
}

// Parse a `.ampar` ArrayBuffer/Uint8Array into { version, tables } where tables
// is { tableName: [record, ...] }. Throws if the magic doesn't match.
export function parseAmpar(buffer) {
  const all = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Distinguish an empty/incomplete download from a genuinely wrong format —
  // 0-byte files are the common failure (a Google Drive "large file" download
  // that didn't finish), and "Not an Ampersand archive" wrongly reads as an
  // app bug there.
  if (all.length === 0) {
    throw new Error("This file is empty (0 bytes) — the export or download didn't finish. Re-download or re-export the .ampar and try again (if it came from Google Drive, make sure the download completes).");
  }
  if (all.length < 10) {
    throw new Error(`This .ampar file looks incomplete (only ${all.length} bytes) — try re-exporting or re-downloading it.`);
  }
  if (!isAmparBuffer(all)) throw new Error("Not an Ampersand archive — the file doesn't start with the expected Ampersand header.");
  const version = all[7];
  const body = all.subarray(10);
  const records = decodeMulti(body);
  const tables = {};
  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue;
    const table = raw.table;
    if (!table || table === '__revision' || table === '__config') continue;
    const data = revive(raw.data);
    (tables[table] = tables[table] || []).push(data);
  }
  return { version, tables };
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// A revived File wrapper → a data: URL the avatar resolver passes through
// untouched (so images import without touching the local-image store).
function fileToDataUrl(f) {
  if (!f || !f.__file || !(f.bytes instanceof Uint8Array) || f.bytes.length === 0) return null;
  return `data:${f.mimeType || 'image/png'};base64,${bytesToBase64(f.bytes)}`;
}

function toIso(d) {
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString();
  if (typeof d === 'number') return new Date(d).toISOString();
  if (typeof d === 'string' && d) return d;
  return null;
}

function normColor(c) {
  if (!c || typeof c !== 'string') return '';
  let s = c.trim();
  if (!s) return '';
  if (s[0] !== '#') s = `#${s}`;
  // #AARRGGBB (8-digit) → drop the leading alpha pair → #RRGGBB
  if (/^#[0-9a-fA-F]{8}$/.test(s)) s = `#${s.slice(3)}`;
  return s;
}

function customFieldsToObject(cf, fieldName) {
  const out = {};
  if (cf instanceof Map) {
    for (const [k, v] of cf) { const n = fieldName[k] || k; if (n) out[n] = v; }
  } else if (cf && typeof cf === 'object') {
    for (const k in cf) { const n = fieldName[k] || k; if (n) out[n] = cf[k]; }
  }
  return out;
}

// Map a parsed archive into one OS "system dump" per Ampersand system.
// Returns [{ name, data }] where data is an OS entity dump
// ({ EntityName: { id: record } }) ready for createSystemWithData().
export function ampersandToSystemDumps(parsed) {
  const tables = (parsed && parsed.tables) || {};
  const systemRecs = [].concat(tables.systems || [], tables.system || []).filter(Boolean);
  const members = (tables.members || []).filter(Boolean);
  const fronting = (tables.frontingEntries || []).filter(Boolean);
  const journals = (tables.journalPosts || []).filter(Boolean);
  const boards = (tables.boardMessages || []).filter(Boolean);
  const notes = (tables.notes || []).filter(Boolean);
  const tags = (tables.tags || []).filter(Boolean);
  const customFields = (tables.customFields || []).filter(Boolean);

  const tagName = {};
  tags.forEach((t) => { if (t && t.uuid) tagName[t.uuid] = t.name || ''; });
  const fieldName = {};
  customFields.forEach((f) => { if (f && f.uuid) fieldName[f.uuid] = f.name || ''; });

  // One import target per Ampersand system. If the archive somehow has no
  // system record, fall back to a single catch-all system so nothing is lost.
  const targets = systemRecs.length
    ? systemRecs.map((rec) => ({ rec, name: (rec && rec.name && String(rec.name).trim()) || 'Imported system' }))
    : [{ rec: null, name: 'Imported (Ampersand)' }];

  const idxByUuid = {};
  targets.forEach((t, i) => { if (t.rec && t.rec.uuid) idxByUuid[t.rec.uuid] = i; });

  // Which system each member belongs to (orphans → first system).
  const memberSysIdx = {};
  members.forEach((m) => {
    const i = (m.system != null && idxByUuid[m.system] != null) ? idxByUuid[m.system] : 0;
    if (m.uuid) memberSysIdx[m.uuid] = i;
  });

  const dumps = targets.map(() => ({
    Alter: {}, FrontingSession: {}, JournalEntry: {}, Bulletin: {}, BulletinComment: {},
    CustomField: {}, SystemSettings: {},
  }));

  // Members → Alters.
  members.forEach((m) => {
    const si = memberSysIdx[m.uuid] ?? 0;
    const dump = dumps[si];
    const id = m.uuid || genId();
    const custom = customFieldsToObject(m.customFields, fieldName);
    const avatar = fileToDataUrl(m.image);
    const banner = fileToDataUrl(m.cover);
    if (banner) custom._header_image = banner;
    dump.Alter[id] = {
      id,
      name: m.name || 'Unknown',
      pronouns: m.pronouns || '',
      description: m.description || '',
      role: m.role || '',
      ...(typeof m.age === 'number' ? { age: m.age } : {}),
      color: normColor(m.color),
      avatar_url: avatar || '',
      ...(banner ? { banner_url: banner } : {}),
      tags: Array.isArray(m.tags) ? m.tags.map((u) => tagName[u] || u).filter(Boolean) : [],
      custom_fields: custom,
      is_archived: !!m.isArchived,
      is_pinned: !!m.isPinned,
      created_date: toIso(m.dateCreated) || nowIso(),
    };
  });

  // Fronting entries → FrontingSessions (only for members we imported).
  fronting.forEach((f) => {
    const si = memberSysIdx[f.member];
    if (si == null) return;
    const dump = dumps[si];
    const id = f.uuid || genId();
    const note = [];
    if (f.comment) note.push({ text: String(f.comment), timestamp: toIso(f.startTime) || nowIso() });
    dump.FrontingSession[id] = {
      id,
      alter_id: f.member,
      start_time: toIso(f.startTime) || nowIso(),
      ...(f.endTime ? { end_time: toIso(f.endTime) } : {}),
      is_active: !f.endTime,
      is_primary: !!f.isMainFronter,
      note: JSON.stringify(note),
      created_date: toIso(f.startTime) || nowIso(),
      ...(f.customStatus ? { custom_status: String(f.customStatus) } : {}),
    };
  });

  // Journal posts → JournalEntries (attributed to the first listed author).
  journals.forEach((j) => {
    const author = Array.isArray(j.members) && j.members.length ? j.members[0] : null;
    const si = (author && memberSysIdx[author] != null) ? memberSysIdx[author] : 0;
    const dump = dumps[si];
    const id = j.uuid || genId();
    let content = j.body || '';
    if (j.subtitle) content = `<p><em>${j.subtitle}</em></p>${content}`;
    dump.JournalEntry[id] = {
      id,
      title: j.title || '',
      content,
      timestamp: toIso(j.date) || nowIso(),
      created_date: toIso(j.date) || nowIso(),
      ...(author ? { alter_id: author } : {}),
      is_pinned: !!j.isPinned,
      ...(j.contentWarning ? { content_warning: String(j.contentWarning) } : {}),
      tags: Array.isArray(j.tags) ? j.tags.map((u) => tagName[u] || u).filter(Boolean) : [],
    };
  });

  // Standalone notes → JournalEntries in an "Imported notes" folder (no native
  // OS equivalent; this preserves the text rather than dropping it).
  notes.forEach((n) => {
    const dump = dumps[0];
    const id = n.uuid || genId();
    dump.JournalEntry[id] = {
      id,
      title: n.title || 'Note',
      content: n.content || '',
      timestamp: nowIso(),
      created_date: nowIso(),
      folder: 'Imported notes',
    };
  });

  // Board messages → Bulletins (+ embedded comments → BulletinComments).
  boards.forEach((bm) => {
    const author = Array.isArray(bm.members) && bm.members.length ? bm.members[0] : null;
    const si = (author && memberSysIdx[author] != null) ? memberSysIdx[author] : 0;
    const dump = dumps[si];
    const id = bm.uuid || genId();
    const body = bm.body || '';
    dump.Bulletin[id] = {
      id,
      content: bm.title ? `<strong>${bm.title}</strong><br/>${body}` : body,
      timestamp: toIso(bm.date) || nowIso(),
      created_date: toIso(bm.date) || nowIso(),
      ...(author ? { author_alter_id: author } : {}),
      is_pinned: !!bm.isPinned,
    };
    if (Array.isArray(bm.comments)) {
      bm.comments.forEach((c) => {
        if (!c || !c.comment) return;
        const cid = genId();
        dump.BulletinComment[cid] = {
          id: cid,
          bulletin_id: id,
          content: String(c.comment),
          timestamp: toIso(c.date) || nowIso(),
          created_date: toIso(c.date) || nowIso(),
          ...(c.member ? { author_alter_id: c.member } : {}),
        };
      });
    }
  });

  // Custom-field definitions (replicated into every system's dump — cheap, and
  // keeps a field referenced by a member in any system resolvable).
  customFields.forEach((f) => {
    if (!f || !f.uuid) return;
    dumps.forEach((d) => { d.CustomField[f.uuid] = { id: f.uuid, name: f.name || 'Field', type: 'text', created_date: nowIso() }; });
  });

  // System name/avatar/bio → each dump's SystemSettings. Use the SAME field
  // names the profile writes (system_avatar_url / system_banner_url) so the
  // switcher and the profile show the same picture.
  targets.forEach((t, i) => {
    const ssid = genId();
    const ss = { id: ssid, system_name: t.name, created_date: nowIso() };
    const sysAvatar = t.rec ? fileToDataUrl(t.rec.image) : null;
    if (sysAvatar) ss.system_avatar_url = sysAvatar;
    const sysBanner = t.rec ? fileToDataUrl(t.rec.cover) : null;
    if (sysBanner) ss.system_banner_url = sysBanner;
    if (t.rec && t.rec.description) ss.system_bio = String(t.rec.description);
    dumps[i].SystemSettings[ssid] = ss;
  });

  return targets.map((t, i) => ({ name: t.name, data: dumps[i] }));
}
