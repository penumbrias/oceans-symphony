// Fast, memory-bounded base64 helpers.
//
// Every place that had to turn file bytes into base64 (native file writes
// through the Capacitor bridge, the MediaStore save, the compact backup
// envelope) used to build a "binary string" one byte at a time in JS —
// millions of String.fromCharCode calls for a big backup, which is slow on
// a phone and churns the heap. These use the platform's own encoder:
//
//   1. Uint8Array.prototype.toBase64 (native, newest engines), else
//   2. FileReader.readAsDataURL on a Blob (native encoder, every WebView), else
//   3. String.fromCharCode.apply over 48 KB slices + btoa (no per-byte loop).
//
// Large inputs are encoded in slices whose length is a multiple of 3, so the
// slices' base64 concatenates into exactly the base64 of the whole — and the
// biggest transient string is one slice, never the whole payload twice.

// 3 MB — a multiple of 3, small enough for a Capacitor bridge message.
export const BASE64_SLICE_BYTES = 3 * 1024 * 1024;
// 48 KB — a multiple of 3, safely under every engine's argument limit for
// String.fromCharCode.apply.
const APPLY_SLICE = 0xC000;

const hasNativeToBase64 = () =>
  typeof Uint8Array !== "undefined" && typeof Uint8Array.prototype.toBase64 === "function";
const hasNativeFromBase64 = () =>
  typeof Uint8Array !== "undefined" && typeof Uint8Array.fromBase64 === "function";

// Bytes → base64, synchronously. Native when available, otherwise chunked
// fromCharCode.apply (never a per-byte loop).
export function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (hasNativeToBase64()) return bytes.toBase64();
  const parts = [];
  for (let i = 0; i < bytes.length; i += APPLY_SLICE) {
    const slice = bytes.subarray(i, Math.min(i + APPLY_SLICE, bytes.length));
    parts.push(btoa(String.fromCharCode.apply(null, slice)));
  }
  return parts.join("");
}

// One Blob (any size the caller chose) → base64 via the browser's encoder.
function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

// Blob → base64, encoded slice by slice. Peak extra memory is one slice's
// bytes + its base64 (plus the growing result, which the caller asked for).
export async function blobToBase64(blob) {
  if (!blob || blob.size === 0) return "";
  const parts = [];
  for (let off = 0; off < blob.size; off += BASE64_SLICE_BYTES) {
    const slice = blob.slice(off, Math.min(off + BASE64_SLICE_BYTES, blob.size));
    if (hasNativeToBase64()) {
      parts.push(new Uint8Array(await slice.arrayBuffer()).toBase64());
    } else if (typeof FileReader !== "undefined") {
      parts.push(await readBlobAsBase64(slice));
    } else {
      parts.push(bytesToBase64(new Uint8Array(await slice.arrayBuffer())));
    }
  }
  return parts.join("");
}

// base64 → bytes. Native when available, otherwise atob + one tight loop
// (decoding has no apply-style shortcut).
export function base64ToBytes(b64) {
  const clean = String(b64 || "");
  if (hasNativeFromBase64()) {
    try { return Uint8Array.fromBase64(clean); } catch { /* fall through for odd whitespace */ }
  }
  const binary = atob(clean.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
