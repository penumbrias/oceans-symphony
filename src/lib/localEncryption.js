// AES-GCM encryption using Web Crypto API (native browser crypto, no dependencies)

// PBKDF2 iteration counts. KDF_ITERATIONS is what NEW envelopes are written
// with; LEGACY_KDF_ITERATIONS is what pre-upgrade blobs used. Envelopes record
// their count in `__kdf_iterations`; readers must pass the stored value to
// deriveKey. Blobs without the field are legacy (100k). initLocalDb upgrades
// a legacy blob to KDF_ITERATIONS transparently on the first successful
// unlock (it holds the password at that moment, so it can re-derive).
export const KDF_ITERATIONS = 600000;
export const LEGACY_KDF_ITERATIONS = 100000;

export async function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Fix: use loop instead of spread
  let binary = "";
  salt.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

// The default stays LEGACY so any call site that predates the iteration
// bump keeps decrypting old blobs correctly. New-envelope writers must pass
// KDF_ITERATIONS explicitly.
export async function deriveKey(password, saltBase64, iterations = LEGACY_KDF_ITERATIONS) {
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  // Chunked byte→binary-string conversion (v0.95.2). The previous
  // per-byte `binary += String.fromCharCode(b)` was O(n²) on multi-MB
  // blobs — every encrypted save stalled for seconds, which widened the
  // window where a stale pre-import save could land after an import.
  // Same chunked pattern as nativeMediaStoreSave.js.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < combined.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, combined.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function decryptData(base64, key) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
