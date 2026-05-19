/**
 * User-configurable batch size for the dashboard Bulletin Board's
 * recent-activity strip. The dashboard board shows N bulletins
 * initially and loads N more each time the user hits "Load more".
 * Used to be a hardcoded 10; this lets users who only want to see
 * 2-3 at a time keep the dashboard short and use the standalone
 * /bulletins page for browsing.
 *
 * Persisted in localStorage. Standalone page uses its own larger
 * default + IntersectionObserver-driven lazy load and ignores this.
 */

export const BULLETIN_BATCH_KEY = "bulletin_dashboard_batch_size";

export const BATCH_MIN = 1;
export const BATCH_MAX = 30;
export const DEFAULT_BATCH = 10;

function safeRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode / quota — ignore, UI still works */
  }
}

export function getBulletinBatchSize() {
  const raw = safeRead(BULLETIN_BATCH_KEY, String(DEFAULT_BATCH));
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_BATCH;
  if (n < BATCH_MIN) return BATCH_MIN;
  if (n > BATCH_MAX) return BATCH_MAX;
  return n;
}

export function setBulletinBatchSize(n) {
  const clamped = Math.max(BATCH_MIN, Math.min(BATCH_MAX, parseInt(n, 10) || DEFAULT_BATCH));
  safeWrite(BULLETIN_BATCH_KEY, clamped);
  try {
    window.dispatchEvent(new CustomEvent("bulletin-batch-size-changed"));
  } catch {
    /* ignore */
  }
}
