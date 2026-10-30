// Casting a vote is one function (v0.322.0): the Polls page, the Polls
// widget and the poll results widget all call `castPollVote`, so a vote
// behaves the same everywhere — tally polls add one anonymous mark per
// tap; per-alter polls toggle each voter on the option, moving them off
// any other option first. `voterIds` empty collapses to one system-wide
// vote (the "" voter), as the Polls page always has.

import { base44 } from "@/api/base44Client";
import { markPollVotedToday } from "@/lib/dailyTaskSystem";

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

export async function castPollVote(poll, optionIdx, voterIds = []) {
  if (!poll || poll.is_closed) return null;
  const votes = nextVotes(poll, optionIdx, voterIds);
  await base44.entities.Poll.update(poll.id, { votes });
  markPollVotedToday();
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

// Who's in front right now — the default voters when a vote is cast
// from a widget (the Polls page keeps its own picker).
export async function currentFrontVoterIds() {
  try {
    const live = await base44.entities.FrontingSession.filter({ is_active: true });
    return [...new Set(live.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean))];
  } catch { return []; }
}
