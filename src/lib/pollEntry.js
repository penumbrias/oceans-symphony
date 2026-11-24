// THE poll write path (house step 0.6, "plumbing out of the walls").
//
// Every Poll the app writes for the person goes through here: creating one
// (the Polls page, or the bulletin composer through bulletinEntry.js),
// editing it, voting (the Polls page, the Polls widgets, a bulletin's
// linked poll, the pinned poll card), taking a tally mark off, adding an
// option, switching tally mode, closing, pinning and deleting. Octocon's
// importer builds rows from a foreign shape and stays in its importer.
// (It replaces pollVote.js, the v0.322.0 one-vote-path file.)
//
// Votes: `votes` maps an option index ("0", "1"…) to voter ids. A tally
// poll adds one anonymous "" per tap; a per-person poll toggles each voter
// on the picked option and moves them off any other. No voter means one
// system-wide vote (the "" voter).
//
// Every vote reads the poll fresh before counting, so two quick taps (or
// two surfaces) never undo each other from a stale copy.

import { base44 } from "@/api/base44Client";

const P = () => base44.entities.Poll;

// ── Pure maths ─────────────────────────────────────────────────────────

export function nextVotes(poll, optionIdx, voterIds = []) {
  const key = String(optionIdx);
  const votes = JSON.parse(JSON.stringify(poll?.votes || {}));
  if (!votes[key]) votes[key] = [];
  if (poll?.tally_mode) {
    votes[key].push("");
    return votes;
  }
  const voters = voterIds.length > 0 ? voterIds : [""];
  for (const voterId of voters) {
    if (votes[key].includes(voterId)) {
      votes[key] = votes[key].filter((id) => id !== voterId);
    } else {
      Object.keys(votes).forEach((k) => { votes[k] = votes[k].filter((id) => id !== voterId); });
      votes[key].push(voterId);
    }
  }
  return votes;
}

// One anonymous mark off an option: the last "" first, so per-person votes
// from before a switch to tally mode stay. null when there's none to take.
export function votesAfterDecrement(poll, optionIdx) {
  const key = String(optionIdx);
  const votes = JSON.parse(JSON.stringify(poll?.votes || {}));
  if (!votes[key] || votes[key].length === 0) return null;
  const lastAnon = votes[key].lastIndexOf("");
  if (lastAnon >= 0) votes[key].splice(lastAnon, 1);
  else votes[key].pop();
  return votes;
}

// Votes per option, in option order — a vote is an array of voter ids
// (older rows may hold a plain count).
export function pollCounts(poll) {
  return (poll?.options || []).map((_, i) => {
    const v = poll?.votes?.[String(i)];
    return Array.isArray(v) ? v.length : (typeof v === "number" ? v : 0);
  });
}

// ── The person's last voting mode (a backed-up preference) ─────────────

export const TALLY_DEFAULT_KEY = "symphony_polls_default_tally_mode";

export function defaultTallyMode() {
  try { return localStorage.getItem(TALLY_DEFAULT_KEY) === "1"; } catch { return false; }
}

export function rememberTallyMode(on) {
  try { localStorage.setItem(TALLY_DEFAULT_KEY, on ? "1" : "0"); } catch { /* non-fatal */ }
}

// ── Writers ────────────────────────────────────────────────────────────

// `pinnedToDashboard` is only written when given (polls posted from the
// bulletin board set it; polls made on the Polls page never did).
export async function createPoll({ question, options, tallyMode = false, createdByAlterId = null, pinnedToDashboard }) {
  const votes = {};
  options.forEach((_, idx) => { votes[String(idx)] = []; });
  return P().create({
    question,
    options,
    votes,
    is_closed: false,
    tally_mode: tallyMode,
    ...(pinnedToDashboard === undefined ? {} : { pinned_to_dashboard: pinnedToDashboard }),
    // A tally poll has no per-person accounting.
    created_by_alter_id: tallyMode ? null : (createdByAlterId || null),
  });
}

// The editor: options may be reordered, added or removed. `optionOrigin[i]`
// is the old index the new option i came from (null for a new one), so its
// votes follow it.
export async function editPoll(poll, { question, options, optionOrigin = [], tallyMode }) {
  const votes = {};
  options.forEach((_, newIdx) => {
    const origin = optionOrigin[newIdx];
    votes[String(newIdx)] = origin != null ? ((poll.votes || {})[String(origin)] || []) : [];
  });
  return P().update(poll.id, {
    question,
    options,
    votes,
    tally_mode: tallyMode,
    ...(tallyMode ? { created_by_alter_id: null } : {}),
  });
}

async function freshPoll(poll) {
  try { return (await P().get(poll.id)) || poll; } catch { return poll; }
}

// Casts a vote. `onVotes(votes)` runs just before the write (for an
// optimistic screen update). Returns the new votes, or null when the poll
// is closed.
export async function castPollVote(poll, optionIdx, voterIds = [], { onVotes } = {}) {
  if (!poll || poll.is_closed) return null;
  const source = await freshPoll(poll);
  if (source.is_closed) return null;
  const votes = nextVotes(source, optionIdx, voterIds);
  onVotes?.(votes);
  await P().update(poll.id, { votes });
  const { markPollVotedToday } = await import("@/lib/dailyTaskSystem");
  markPollVotedToday();
  return votes;
}

export async function decrementTallyVote(poll, optionIdx, { onVotes } = {}) {
  if (!poll || poll.is_closed) return false;
  const votes = votesAfterDecrement(await freshPoll(poll), optionIdx);
  if (!votes) return false;
  onVotes?.(votes);
  await P().update(poll.id, { votes });
  return true;
}

export async function addPollOption(poll, label) {
  const options = [...(poll.options || []), label];
  const votes = { ...(poll.votes || {}) };
  votes[String(options.length - 1)] = [];
  return P().update(poll.id, { options, votes });
}

export async function setPollTallyMode(id, on) {
  return P().update(id, { tally_mode: !!on });
}

export async function closePoll(id) {
  return P().update(id, { is_closed: true });
}

// Pins a poll to the board; a poll posted from a bulletin pins that post
// too, so it shows in the board's Pinned section.
export async function setPollPinned(poll, pinned) {
  await P().update(poll.id, { pinned_to_dashboard: !!pinned });
  if (pinned !== undefined && poll.bulletin_id) {
    try {
      const { setBulletinPinned } = await import("@/lib/bulletinEntry");
      await setBulletinPinned(poll.bulletin_id, pinned);
    } catch { /* non-fatal: the poll pin still flips */ }
  }
}

// Just the poll's own pin (the pinned card's ×).
export async function unpinPollOnly(id) {
  return P().update(id, { pinned_to_dashboard: false });
}

// To the trash. A poll posted from a bulletin is unlinked from that post
// first, so the post stops looking for it.
export async function trashPoll(poll) {
  if (poll.bulletin_id) {
    try {
      const { unlinkBulletinPoll } = await import("@/lib/bulletinEntry");
      await unlinkBulletinPoll(poll.bulletin_id);
    } catch { /* non-fatal */ }
  }
  await P().delete(poll.id);
}

// Who's in front right now — the default voters when a vote is cast
// from a widget (the Polls page keeps its own picker).
export async function currentFrontVoterIds() {
  try {
    const live = await base44.entities.FrontingSession.filter({ is_active: true });
    return [...new Set(live.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean))];
  } catch { return []; }
}
