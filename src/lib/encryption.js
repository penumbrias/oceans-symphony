// Per-entry content encryption (locked journal entries) — Web Crypto.
//
// v2 (v0.181.0): PBKDF2-SHA256 at KDF_ITERATIONS with a fresh 16-byte salt
// PER ENTRY, AES-GCM-256 with a fresh 12-byte IV. Wire format:
//   "v2:" + base64( salt(16) | iv(12) | ciphertext )
//
// v1 (legacy, everything written before v0.181.0): key = ONE unsalted
// SHA-256(password), AES-GCM, format base64( iv(12) | ciphertext ) with no
// prefix. That was brute-forceable at GPU speed and one rainbow table
// covered every user. Legacy entries still DECRYPT (never lose data);
// callers should re-encrypt on next save so the entry upgrades. The
// app-wide at-rest encryption (localEncryption.js) always used the strong
// KDF — this brings the per-entry lock in line with it.

import { KDF_ITERATIONS } from "@/lib/localEncryption";

const V2_PREFIX = "v2:";
const SALT_LEN = 16;
const IV_LEN = 12;

function bytesToBase64(bytes) {
  // Chunked — String.fromCharCode(...bigArray) blows the call stack on a
  // long entry (the old code did exactly that).
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKeyV2(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Legacy v1 key — kept ONLY to read old entries.
async function deriveKeyV1(password) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

export function isLegacyEncryptedContent(encrypted) {
  return typeof encrypted === "string" && encrypted.length > 0 && !encrypted.startsWith(V2_PREFIX);
}

export async function encryptContent(content, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKeyV2(password, salt);
  const data = new TextEncoder().encode(content);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const combined = new Uint8Array(SALT_LEN + IV_LEN + ct.length);
  combined.set(salt, 0);
  combined.set(iv, SALT_LEN);
  combined.set(ct, SALT_LEN + IV_LEN);
  return V2_PREFIX + bytesToBase64(combined);
}

export async function decryptContent(encrypted, password) {
  try {
    if (typeof encrypted !== "string") throw new Error("bad input");
    if (encrypted.startsWith(V2_PREFIX)) {
      const combined = base64ToBytes(encrypted.slice(V2_PREFIX.length));
      const salt = combined.slice(0, SALT_LEN);
      const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
      const ct = combined.slice(SALT_LEN + IV_LEN);
      const key = await deriveKeyV2(password, salt);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
    }
    // Legacy v1
    const combined = base64ToBytes(encrypted);
    const iv = combined.slice(0, IV_LEN);
    const ct = combined.slice(IV_LEN);
    const key = await deriveKeyV1(password);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  } catch {
    throw new Error("Decryption failed - wrong password or corrupted data");
  }
}
