// The house's Friends room: words and small shapes (pure, no storage, no
// network). scripts/test-house-friends.mjs runs it.
//
// What a friend is sent is NOT decided here: seeWords only words the result
// of whatFriendSees (src/lib/friendFronters.js), the same function the push
// (pushFrontStatus) runs for every friend.

import { FRONT_LEVELS, frontLevelLabel } from "@/lib/friendsView";

// Which friend is open: kept in the history entry's state (never in the
// address, so no relay id lands in the address bar or a shared link).
export function openFriendId(state) {
  const id = state && typeof state === "object" ? state.friendView : null;
  return typeof id === "string" && id ? id : null;
}
export const friendViewState = (userId) => (userId ? { friendView: userId } : null);

// The friend a desktop shows: the open one, else the first (board 22 always
// has one open). A phone shows the list until one is opened.
export function shownFriend(friends = [], openId, { phone = false } = {}) {
  const hit = openId ? friends.find((f) => f.userId === openId) : null;
  if (hit) return hit;
  return phone ? null : friends[0] || null;
}

const listNames = (names) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// "Right now they would see: …" — `view` is whatFriendSees' answer.
export function seeWords(view, terms = {}) {
  const fronting = terms.fronting || "fronting";
  if (!view || view.privacyLevel === "hidden") return `nothing about who's ${fronting}`;
  const n = (view.fronters || []).length;
  if (n === 0) return `no one ${fronting}`;
  if (view.privacyLevel === "count_only") return `${n} ${fronting}, no names`;
  const names = view.fronters.map((f) => f.name || "?");
  return `${listNames(names)} ${fronting} (${n})`;
}

// The head line under a friend's name: "Friends since 2 Oct · verified".
export function friendSinceWords(friend, { verified = false, dateWords } = {}) {
  const parts = [];
  if (friend?.systemName) parts.push(friend.systemName);
  if (friend?.addedAt && dateWords) {
    const d = new Date(friend.addedAt);
    if (!Number.isNaN(d.getTime())) parts.push(`Friends since ${dateWords(d)}`);
  }
  if (verified) parts.push("verified");
  return parts.join(" · ");
}

// What the friend shares about their own front, in words for the panel's tools.
export function theirLevelWords(privacyLevel, ft = {}) {
  if (privacyLevel === "hidden") return `they share nothing about who's ${ft.fronting || "fronting"}`;
  if (privacyLevel === "count_only") return "they share a count only";
  return "they share names and colours";
}

// The level a friend's view is on, and what the override row says.
export function effectiveLevel(privacyOverride, globalLevel = "names") {
  return privacyOverride || globalLevel || "names";
}
export function overrideWords(privacyOverride, globalLevel = "names") {
  if (!privacyOverride) return `none, follows your default (${frontLevelLabel(globalLevel).toLowerCase()})`;
  return `set for this friend (your default is ${frontLevelLabel(globalLevel).toLowerCase()})`;
}

// The right column's "Sharing levels" rows (board 22): the three front
// levels with what each sends, the current default marked.
export function levelRows(globalLevel = "names", terms = {}) {
  const fronting = terms.fronting || "fronting";
  const hint = { hidden: "no front info", count_only: `"2 ${fronting}"`, names: "names and colours" };
  return FRONT_LEVELS.map((l) => ({ id: l.id, label: l.label, hint: hint[l.id], isDefault: l.id === (globalLevel || "names") }));
}

// A friend's row in the list: "Lumen, Ember" (or "2 fronting", "Fronting
// hidden") plus "notify on" when it is.
export function friendRowSub(summary, friend) {
  return `${summary}${friend?.notifyOnChange ? " · notify on" : ""}`;
}

// "Show when fronting" rows: search by name or alias; whoever is in front first.
export function filterAltersByText(alters = [], text = "", formatAlter = (a) => a?.name || "") {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return alters;
  return alters.filter((a) => [formatAlter(a), a.name, a.alias].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)));
}

// The status words for the list's tools.
export function pollWords({ fetching = false } = {}) {
  return fetching ? "updating…" : "updates every 30 s";
}
