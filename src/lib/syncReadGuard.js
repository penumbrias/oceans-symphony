// Decides, before a sync pass reads another device's snapshot, whether
// reading it is safe (v0.357.1). Pure (no imports) so
// scripts/test-sync-read-guard.mjs can run it under plain node.
//
// Two ways a read can take the phone down, and the guard for each:
//   - a media file too big to hold in memory (the desktop's file carries
//     every picture, song and video) → skipped on native above the limit;
//   - any file that killed the app mid-read last time (the runner leaves a
//     mark before each read and clears it after) → skipped until the other
//     device rewrites it, so the app can never be stuck in a crash loop.

// A peer's media file above this size is not read on the phone (v0.357.1).
// The read holds the file several times over (native bytes, a native
// string, the bridge copy, the parsed pictures) — a desktop library of
// songs and videos killed the app on every launch.
export const NATIVE_MEDIA_READ_LIMIT_BYTES = 40 * 1024 * 1024;

// Should this peer file be skipped before reading?
// Returns a reason string, or null to go ahead.
export function syncReadSkipReason({ name, size, mark, kind, native, inflight }) {
  if (inflight && inflight.name === name && inflight.mark === mark) {
    return "A file from the other device closed the app last time, so it was skipped to keep the app open. It\u2019s tried again once that device writes a new one.";
  }
  if (native && kind === "media" && (Number(size) || 0) > NATIVE_MEDIA_READ_LIMIT_BYTES) {
    return "The other device\u2019s pictures and files are too large for this phone to take in at once, so they were skipped. Your records still synced; move the files with \u201cFiles as .zip\u201d instead.";
  }
  return null;
}

