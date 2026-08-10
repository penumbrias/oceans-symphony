// Remember the last screen crash so a bug report can carry its stack.
//
// The crash screen shows the trace behind a "Show error details" toggle, but
// by the time someone opens the bug-report form they've usually navigated
// away and the trace is gone — so reports arrive saying "it crashed" with no
// way to find out where. That costs a whole round trip per bug, and for a
// crash that needs specific data to reproduce it can cost several.
//
// Kept in localStorage (not the DB) because it's diagnostic scratch about
// THIS device, not user content: it must never ride along in a backup, and
// losing it costs nothing.

const KEY = "symphony_last_crash_v1";
const KEEP = 3;

export function recordCrash(error, info, pathname) {
  try {
    const entry = {
      at: new Date().toISOString(),
      route: pathname || (typeof window !== "undefined" ? window.location.pathname : ""),
      message: String(error?.message || error || "Unknown error").slice(0, 400),
      // The stack is code paths and component names — no user content — so
      // it's safe to put in front of the user and into a report they send.
      stack: String(error?.stack || "").split("\n").slice(0, 12).join("\n").slice(0, 2000),
      components: String(info?.componentStack || "").split("\n").filter(Boolean).slice(0, 8).join("\n").slice(0, 1000),
    };
    const prev = readCrashes();
    localStorage.setItem(KEY, JSON.stringify([entry, ...prev].slice(0, KEEP)));
  } catch { /* quota / private mode — diagnostics are best-effort */ }
}

export function readCrashes() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function readLastCrash() {
  return readCrashes()[0] || null;
}

export function clearCrashes() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Markdown for the bug-report body.
export function formatCrash(c) {
  if (!c) return "";
  const lines = [
    "**Last crash** (auto-captured)",
    `- When: \`${c.at}\``,
    `- Screen: \`${c.route}\``,
    `- Error: \`${c.message}\``,
  ];
  if (c.stack) lines.push("", "```", c.stack, "```");
  if (c.components) lines.push("", "Component stack:", "```", c.components, "```");
  return lines.join("\n");
}
