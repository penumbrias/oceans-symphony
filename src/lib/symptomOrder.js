// The one order symptoms are listed in: pinned ("priority") first, then the
// order set in Manage check-in, then A→Z. Shared by the check-in and the
// per-alter panels so they never disagree.
export function bySymptomOrder(a, b) {
  const pin = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
  if (pin) return pin;
  return (a.order ?? 0) - (b.order ?? 0) || (a.label || "").localeCompare(b.label || "");
}
