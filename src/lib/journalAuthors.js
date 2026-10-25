// Who wrote a journal entry (roadmap step 5).
//
// `author_alter_id` is the first author; `co_author_alter_ids` the others.
// The switch journal used to save its signers in `author_alter_ids` (the
// shape other authored records use), which nothing on the journal side
// read, so co-signers were invisible in every list and filter. New switch
// journals write `co_author_alter_ids`; older ones are read through here.
// Read-only: nothing is rewritten.

export function journalCoAuthorIds(entry) {
  if (!entry) return [];
  const co = Array.isArray(entry.co_author_alter_ids) ? entry.co_author_alter_ids : [];
  if (co.length) return co.filter((id) => id && id !== entry.author_alter_id);
  const legacy = Array.isArray(entry.author_alter_ids) ? entry.author_alter_ids : [];
  return [...new Set(legacy)].filter((id) => id && id !== entry.author_alter_id);
}

// Everyone who wrote it, first author first.
export function journalAuthorIds(entry) {
  if (!entry) return [];
  return [entry.author_alter_id, ...journalCoAuthorIds(entry)].filter(Boolean);
}
