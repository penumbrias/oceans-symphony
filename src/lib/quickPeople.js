// The quick list (v0.371.0): one line per person, as little as a name, a
// colour or an emoji. A named line becomes an alter (createAlter); a line
// marked "Not sure yet", or one with no name, becomes a presence
// (createPresence). Pure helpers here; the UI is
// src/components/shared/QuickPeopleList.jsx.

// The writers load on first save, so this file stays pure (and testable
// without the database).
async function defaultWriters() {
  const [{ createAlter }, { createPresence }] = await Promise.all([
    import("@/lib/alterEntry"),
    import("@/lib/presenceEntry"),
  ]);
  return { alter: createAlter, presence: createPresence };
}

let _seq = 0;
export function newLine(partial = {}) {
  _seq += 1;
  return { key: `ql_${Date.now().toString(36)}_${_seq}`, name: "", color: "", emoji: "", unsure: false, ...partial };
}

// Names from pasted text: one per line, or split by commas / semicolons.
// Bullets and numbering ("- ", "• ", "1. ") are dropped; repeats keep the
// first spelling.
export function parseNameList(text) {
  const parts = String(text || "")
    .split(/[\n\r,;]+/)
    .map((s) => s.replace(/^\s*(?:[-*•·]+|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// True when pasting this text should fill several lines rather than one.
export function isListPaste(text) {
  return parseNameList(text).length > 1;
}

export function lineHasAnything(line) {
  return !!(String(line?.name || "").trim() || line?.color || String(line?.emoji || "").trim());
}

// "alter" | "presence" | null (empty line, nothing to save)
export function lineKind(line) {
  if (!lineHasAnything(line)) return null;
  if (line.unsure || !String(line.name || "").trim()) return "presence";
  return "alter";
}

// Put pasted names into the list: the first fills line `index` (keeping its
// colour/emoji), the rest become new lines right after it with the same
// "Not sure yet" setting.
export function spreadPaste(lines, index, text) {
  const names = parseNameList(text);
  if (!names.length) return lines;
  const base = lines[index] || newLine();
  const first = { ...base, name: names[0] };
  const rest = names.slice(1).map((name) => newLine({ name, unsure: !!base.unsure }));
  return [...lines.slice(0, index), first, ...rest, ...lines.slice(index + 1)];
}

// Saves every line that has something in it. Never throws: lines that
// fail come back in `failed` (and stay in the list, so nothing typed is lost).
export async function saveQuickPeople(lines, { create } = {}) {
  if (!lines.some((l) => lineKind(l))) return { alters: [], presences: [], failed: [] };
  create = create || await defaultWriters();
  const alters = [];
  const presences = [];
  const failed = [];
  for (const line of lines) {
    const kind = lineKind(line);
    if (!kind) continue;
    const name = String(line.name || "").trim();
    const emoji = String(line.emoji || "").trim();
    try {
      if (kind === "alter") {
        const fields = { name };
        if (line.color) fields.color = line.color;
        if (emoji) fields.emoji = emoji;
        alters.push({ line, record: await create.alter(fields) });
      } else {
        presences.push({ line, record: await create.presence({ label: name, color: line.color || "", emoji }) });
      }
    } catch (error) {
      failed.push({ line, error });
    }
  }
  return { alters, presences, failed };
}
