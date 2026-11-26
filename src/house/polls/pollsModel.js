// The Polls room's pure helpers (board 25-PollsPhone): the order the polls
// show in, the words on each card's title bar and foot, the voter squares
// and the room's status line. Nothing here reads or writes a record; every
// write goes through src/lib/pollEntry.js, and counts through pollCounts.

import { pollCounts } from "@/lib/pollMaths";

/** True on /polls (the room's only address). */
export function pollsRoomOf(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/polls";
}

/** An option is normally its label; older/imported polls hold { label }. */
export const optionLabel = (o) => (typeof o === "string" ? o : (o?.label ?? ""));

/** The voter ids on one option (older rows may hold a plain count: no ids). */
export function optionVoters(poll, idx) {
  const v = poll?.votes?.[String(idx)];
  return Array.isArray(v) ? v : [];
}

const stamp = (p) => String(p?.created_date || "");

/**
 * The room's order: open polls before closed ones, pinned first among the
 * open, newest first inside each.
 */
export function sortPolls(polls) {
  return (polls || []).filter((p) => p && !p.trashed_at).slice().sort((a, b) =>
    (!!a.is_closed - !!b.is_closed)
    || (!!b.pinned_to_dashboard - !!a.pinned_to_dashboard)
    || stamp(b).localeCompare(stamp(a)));
}

export const POLL_FILTERS = ["all", "open", "closed"];

export function filterPolls(polls, filter = "all") {
  if (filter === "open") return polls.filter((p) => !p.is_closed);
  if (filter === "closed") return polls.filter((p) => p.is_closed);
  return polls;
}

/** The right side of a card's title bar: "pinned to the board", a date… */
export function pollMeta(poll, { dateWords = (iso) => iso, agoWords = (iso) => iso } = {}) {
  if (poll.is_closed) {
    const when = poll.closed_at || poll.updated_date || poll.created_date;
    return when ? dateWords(when) : "";
  }
  if (poll.pinned_to_dashboard) return "pinned to the board";
  if (poll.bulletin_id) return "from the board";
  return poll.created_date ? agoWords(poll.created_date) : "";
}

/** Votes per option and the total, as the bars need them. */
export function pollTotals(poll) {
  const counts = pollCounts(poll);
  return { counts, total: counts.reduce((a, b) => a + b, 0) };
}

/** A bar's width, 0–100. */
export function barPct(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

/** Has any of `voters` voted for this option? (Never true for a tally poll.) */
export function votedBy(poll, idx, voters = []) {
  if (poll?.tally_mode) return false;
  const on = optionVoters(poll, idx);
  return voters.some((v) => on.includes(v));
}

/**
 * Who votes when this card is tapped: the voters chosen for this poll, else
 * whoever is in front, else one {system}-wide vote ("").
 */
export function votersOf(chosen, frontIds = []) {
  if (Array.isArray(chosen) && chosen.length) return chosen;
  return frontIds.length ? [...frontIds] : [""];
}

/** The card's foot (board 25): closed, tally, who hasn't voted, or who votes. */
export function pollFoot(poll, { voters = [], frontIds = [], chosen = false, byId = {}, terms = {}, formatAlter = (a) => a?.name } = {}) {
  if (poll.is_closed) return "This poll is closed";
  if (poll.tally_mode) return "Anonymous tally: pick an option, then + or −";
  const names = (ids) => ids.map((id) => byId[id]).filter(Boolean).map(formatAlter).join(", ");
  const everyVoter = new Set(Object.values(poll.votes || {}).filter(Array.isArray).flat());
  if (!chosen) {
    const notYet = frontIds.filter((id) => byId[id] && !everyVoter.has(id));
    if (notYet.length && notYet.length < frontIds.length) return `Not voted yet: ${names(notYet)}`;
  }
  const people = voters.filter(Boolean);
  const sys = voters.includes("") ? `the ${terms.system || "system"}` : "";
  const who = [names(people), sys].filter(Boolean).join(" and ");
  if (!who) return `Voting as the ${terms.system || "system"}`;
  if (!chosen && people.length && people.every((id) => frontIds.includes(id))) {
    return `Voting as ${who}, ${people.length === 1 ? "who is" : "who are"} in ${terms.front || "front"}`;
  }
  return `Voting as ${who}`;
}

/** May the poll be closed by these voters? (Its maker, or anyone when it has none.) */
export function canClose(poll, voters = []) {
  if (!poll || poll.is_closed) return false;
  return !poll.created_by_alter_id || voters.includes(poll.created_by_alter_id);
}

/** Up to `max` voter marks for an option, plus how many more there are. */
export function voterMarks(poll, idx, max = 6) {
  const ids = optionVoters(poll, idx);
  return { shown: ids.slice(0, max), more: Math.max(0, ids.length - max) };
}

/**
 * The editor's options after a change, keeping where each came from so
 * votes follow their option (editPoll's optionOrigin).
 */
export function editableOptions(poll) {
  const opts = (poll?.options || []).map(optionLabel);
  const list = opts.length >= 2 ? opts : [...opts, ...Array(2 - opts.length).fill("")];
  return { options: list, origin: list.map((_, i) => (i < opts.length ? i : null)) };
}

/** What a filled form saves: trimmed question, the non-empty options and their origins. */
export function formToSave({ question, options, origin }) {
  const trimmed = options.map((o) => String(o || "").trim());
  return {
    question: String(question || "").trim(),
    options: trimmed.filter(Boolean),
    optionOrigin: (origin || trimmed.map(() => null)).filter((_, i) => trimmed[i]),
  };
}

/** Why the form can't be saved yet, or null. */
export function formProblem(form) {
  const f = formToSave(form);
  if (!f.question) return "Type a question first";
  if (f.options.length < 2) return "Give it at least 2 options";
  return null;
}

export const MAX_OPTIONS = 8;

/** The status line under the room. */
export function statusWords(polls = []) {
  const n = polls.length;
  const open = polls.filter((p) => !p.is_closed).length;
  const pinned = polls.filter((p) => !p.is_closed && p.pinned_to_dashboard).length;
  const bits = [`${n} ${n === 1 ? "poll" : "polls"}`, `${open} open`];
  if (pinned) bits.push(`${pinned} pinned to the board`);
  return bits.join(" · ");
}
