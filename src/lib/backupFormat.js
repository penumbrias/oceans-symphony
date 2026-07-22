// Shared helpers for parsing import files and producing backup envelopes.
//
// The app has three valid file shapes a user might present for import:
//
//   1. Standard backup:
//        { __format: "symphony_backup", __version, data, __local_images?, __local_settings?, ... }
//      Produced by Settings → Backup & Export and by auto-backup.
//
//   2. Raw plain on-device file:
//        { EntityName: { id: record, ... }, ... }
//      Produced by RecoveryScreen "Save raw on-device file" when the
//      user did not have a password set. This is just `_db` itself.
//
//   3. Raw encrypted on-device file:
//        { __encrypted: <ciphertext>, __salt: <salt>, __format_version: 2 }
//      Produced by RecoveryScreen "Save raw on-device file" when the
//      user had a password set. Requires the password to decrypt before
//      it can be loaded.
//
// All three are accepted by the import paths so a raw file saved during
// recovery (or pulled out of the user's Downloads folder) can be
// restored later without manual conversion. The standard envelope is
// still the preferred long-term format because it also carries the
// local images and the local UI settings.

import { decryptData, deriveKey, KDF_ITERATIONS, LEGACY_KDF_ITERATIONS } from './localEncryption';

export const FORMAT_STANDARD = 'standard';
export const FORMAT_RAW_PLAIN = 'raw_plain';
export const FORMAT_RAW_ENCRYPTED = 'raw_encrypted';

// Detect which of the three shapes a parsed JSON object is. Returns
// FORMAT_STANDARD, FORMAT_RAW_PLAIN, FORMAT_RAW_ENCRYPTED, or null if
// the object doesn't match any known shape.
export function detectFormat(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.__format === 'symphony_backup' && parsed.data) return FORMAT_STANDARD;
  if (parsed.__encrypted && typeof parsed.__encrypted === 'string') return FORMAT_RAW_ENCRYPTED;
  // Raw plain: entity-keyed object with no envelope markers. Any object
  // whose values are themselves objects keyed by record id qualifies.
  // We don't enforce the inner shape strictly — loadDbDump treats it
  // tolerantly.
  if (!parsed.__format && !parsed.__encrypted) {
    // Reject obvious non-DB shapes — e.g. an array, or a primitive.
    if (Array.isArray(parsed)) return null;
    return FORMAT_RAW_PLAIN;
  }
  return null;
}

// Parses the file text into one of the three normalized shapes. Doesn't
// decrypt — that step is up to the caller because it needs a password
// prompt. The shape returned for FORMAT_RAW_ENCRYPTED carries the
// ciphertext and salt so the caller can decrypt after collecting the
// password.
export function parseImportText(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    throw new Error('File is not valid JSON.');
  }
  const format = detectFormat(parsed);
  if (!format) {
    throw new Error("Unrecognised file. Doesn't match the Symphony backup or raw on-device format.");
  }
  if (format === FORMAT_STANDARD) {
    return {
      format,
      data: parsed.data,
      localImages: parsed.__local_images || null,
      localFonts: parsed.__local_fonts || null,
      localSettings: parsed.__local_settings || null,
    };
  }
  if (format === FORMAT_RAW_ENCRYPTED) {
    return {
      format,
      ciphertext: parsed.__encrypted,
      salt: parsed.__salt || null,
      iterations: parsed.__kdf_iterations || null,
    };
  }
  // FORMAT_RAW_PLAIN
  return { format, data: parsed };
}

// Decrypts a raw encrypted import file. Throws Error('Incorrect password')
// on bad password, Error('Encryption salt missing — cannot decrypt this
// file') when the salt is absent.
export async function decryptRawEncrypted({ ciphertext, salt, iterations = null }, password) {
  if (!salt) {
    throw new Error('Encryption salt missing — cannot decrypt this file. You will need a backup that included the salt.');
  }
  // Envelopes record their PBKDF2 strength in __kdf_iterations; files that
  // predate the field are legacy (100k). Try the recorded/likely strength
  // first, then the other known strengths, so a raw file from any app
  // version decrypts. Only after every strength fails is it a bad password.
  const candidates = [...new Set([
    ...(iterations ? [iterations] : []),
    LEGACY_KDF_ITERATIONS,
    KDF_ITERATIONS,
  ])];
  for (const iters of candidates) {
    try {
      const key = await deriveKey(password, salt, iters);
      return await decryptData(ciphertext, key);
    } catch { /* try next strength */ }
  }
  throw new Error('Incorrect password');
}

// Wraps a plaintext entity dump in the standard backup envelope so it
// can be saved as an importable file. Used by RecoveryScreen's
// "Save as standard backup" button when the on-device data is plain.
export function wrapAsStandardBackup(dump, { localImages = null, localFonts = null, localSettings = null } = {}) {
  return {
    __format: 'symphony_backup',
    __version: 1,
    __exported_at: new Date().toISOString(),
    __from: 'recovery_screen',
    data: dump,
    __local_images: localImages || {},
    __local_fonts: localFonts || {},
    __local_settings: localSettings || {},
  };
}
