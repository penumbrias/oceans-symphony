// A poll's pure vote maths, shared by the one poll write path
// (src/lib/pollEntry.js, which re-exports these) and the house's Polls room.
// No database here, so it can be imported anywhere, tests included.
//
// Votes: `votes` maps an option index ("0", "1"…) to voter ids. A tally
// poll adds one anonymous "" per tap; a per-person poll toggles each voter
// on the picked option and moves them off any other. No voter means one
// system-wide vote (the "" voter).

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
