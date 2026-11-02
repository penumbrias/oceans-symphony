// Making a sound file smaller before it's stored (v0.341.0). The person
// chooses: keep the file exactly as it is, or re-encode it as an MP3 at
// one of three sizes. MP3 because every build (Android, iOS, desktop, web)
// plays it, and the encoder (lamejs, plain JavaScript) is loaded only when
// someone actually compresses something.
//
// The whole recording is decoded into memory first (the browser has no way
// to decode a file piece by piece), so long recordings can be too big to
// compress on a phone. canCompress() says so up front instead of letting
// the app run out of memory part-way.
//
// Nothing here stores anything: it takes a File and hands back a Blob.

export const MAX_STORED_AUDIO_BYTES = 25 * 1024 * 1024; // same cap as every stored file (assetFiles.MAX_FILE_BYTES)
const MAX_INPUT_BYTES = 200 * 1024 * 1024;

// kbps → the sample rate it's encoded at. Lower rates keep the decoded
// recording smaller in memory as well as the file on disk.
export const AUDIO_QUALITIES = [
  { value: "original", label: "Keep original", kbps: null },
  { value: "high", label: "High", kbps: 128, rate: 44100 },
  { value: "balanced", label: "Balanced", kbps: 96, rate: 32000 },
  { value: "small", label: "Small", kbps: 64, rate: 24000 },
];
export const qualityById = (id) => AUDIO_QUALITIES.find((q) => q.value === id) || null;

// Rough size of the result, in bytes.
export const estimateBytes = (seconds, kbps) => Math.round((Number(seconds) || 0) * kbps * 125);

// How much decoded audio this device can hold while compressing.
function memoryBudget() {
  const gb = typeof navigator !== "undefined" ? Number(navigator.deviceMemory) : NaN;
  if (Number.isFinite(gb) && gb >= 8) return 640 * 1024 * 1024;
  if (Number.isFinite(gb) && gb <= 2) return 160 * 1024 * 1024;
  return 320 * 1024 * 1024;
}

// { ok, reason } — whether this file can be compressed at this quality here.
export function canCompress({ size, seconds }, quality) {
  const q = qualityById(quality);
  if (!q?.kbps) return { ok: true };
  if (size > MAX_INPUT_BYTES) return { ok: false, reason: "This file is too big to compress in the app." };
  if (!seconds) return { ok: true }; // length unknown — try, and report a failure honestly
  const decoded = seconds * q.rate * 2 * 4; // stereo float samples
  if (decoded > memoryBudget()) {
    return { ok: false, reason: "This recording is too long to compress on this device at this size. Try Small, or a shorter file." };
  }
  return { ok: true };
}

// The length of an audio file in seconds (0 when the browser can't tell),
// and whether it can play here at all.
export function probeAudioFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let done = false;
    const finish = (seconds, playable) => {
      if (done) return;
      done = true;
      try { a.removeAttribute("src"); a.load(); } catch { /* gone */ }
      URL.revokeObjectURL(url);
      resolve({ seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0, playable });
    };
    a.preload = "metadata";
    a.addEventListener("loadedmetadata", () => finish(a.duration, true));
    a.addEventListener("error", () => finish(0, false));
    setTimeout(() => finish(0, true), 10000);
    a.src = url;
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function toInt16(f32, from, to) {
  const out = new Int16Array(to - from);
  for (let i = from, j = 0; i < to; i++, j++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// File → MP3 Blob. onProgress(0..1). `isCancelled()` is checked between
// chunks; a cancel rejects with an AbortError.
export async function compressAudioToMp3(file, quality, { onProgress, isCancelled } = {}) {
  const q = qualityById(quality);
  if (!q?.kbps) throw new Error("No compression chosen.");
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error("This device can't compress audio. Keep the original instead.");
  const abort = () => { const e = new Error("Cancelled"); e.name = "AbortError"; return e; };

  onProgress?.(0);
  let bytes = await file.arrayBuffer();
  if (isCancelled?.()) throw abort();
  // An offline context at the target rate decodes AND resamples in one go.
  const ctx = new Ctx(2, 1, q.rate);
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("This file couldn't be read as audio on this device.");
  }
  bytes = null;
  if (isCancelled?.()) throw abort();

  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;
  const enc = new Mp3Encoder(channels, q.rate, q.kbps);
  const parts = [];
  const CHUNK = 1152 * 32;
  const total = left.length;
  let last = performance.now();
  for (let i = 0; i < total; i += CHUNK) {
    const end = Math.min(total, i + CHUNK);
    const out = right
      ? enc.encodeBuffer(toInt16(left, i, end), toInt16(right, i, end))
      : enc.encodeBuffer(toInt16(left, i, end));
    if (out.length) parts.push(new Uint8Array(out));
    // Hand the screen back now and then so the progress bar moves.
    if (performance.now() - last > 60) {
      onProgress?.(end / total);
      await tick();
      if (isCancelled?.()) throw abort();
      last = performance.now();
    }
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);
  return new Blob(parts, { type: "audio/mpeg" });
}
