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
//   4. Password-locked standard backup (v0.240.0):
//        { __format: "symphony_backup_encrypted", __version: 1, __salt,
//          __kdf_iterations, __encrypted: <ciphertext> }
//      Produced by auto-backup / "Back up now" when the user has chosen to
//      lock backup files. The ciphertext decrypts to shape (1) — a full
//      standard envelope with images, fonts and local settings — so once
//      unlocked it takes exactly the standard import path.
//
// All four are accepted by the import paths so a raw file saved during
// recovery (or pulled out of the user's Downloads folder) can be
// restored later without manual conversion. The standard envelope is
// still the preferred long-term format because it also carries the
// local images and the local UI settings.

import { decryptData, deriveKey, encryptData, generateSalt, KDF_ITERATIONS, LEGACY_KDF_ITERATIONS } from './localEncryption';

export const FORMAT_STANDARD = 'standard';
export const FORMAT_RAW_PLAIN = 'raw_plain';
export const FORMAT_RAW_ENCRYPTED = 'raw_encrypted';
export const FORMAT_STANDARD_ENCRYPTED = 'standard_encrypted';
export const FORMAT_MULTISYSTEM = 'multisystem';

// True for either shape that needs a password before it can be applied.
// Import UIs branch on this to open the password prompt.
export function isEncryptedFormat(format) {
  return format === FORMAT_RAW_ENCRYPTED || format === FORMAT_STANDARD_ENCRYPTED;
}

// Detect which of the three shapes a parsed JSON object is. Returns
// FORMAT_STANDARD, FORMAT_RAW_PLAIN, FORMAT_RAW_ENCRYPTED, or null if
// the object doesn't match any known shape.
export function detectFormat(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  // Several systems in one file (manual "each separately" export, and
  // every auto-backup of a multi-system device since v0.248.1). Without
  // this, first-run setup and the recovery screen read it as a standard
  // backup with no `data` and restored an EMPTY database.
  if (parsed.__format === 'symphony_backup' && parsed.__multisystem && Array.isArray(parsed.systems)) return FORMAT_MULTISYSTEM;
  if (parsed.__format === 'symphony_backup' && parsed.data) return FORMAT_STANDARD;
  // Checked before the raw-encrypted shape: both carry `__encrypted`, but
  // only the locked standard envelope names its format.
  if (parsed.__format === 'symphony_backup_encrypted' && typeof parsed.__encrypted === 'string') return FORMAT_STANDARD_ENCRYPTED;
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

// Parses the file text into one of the normalized shapes. Doesn't
// decrypt — that step is up to the caller because it needs a password
// prompt. The shape returned for the two encrypted formats carries the
// ciphertext and salt so the caller can decrypt after collecting the
// password (see decryptEncryptedImport).
export function parseImportText(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    throw new Error('File is not valid JSON.');
  }
  return normalizeImport(parsed);
}

// Same as parseImportText but for an already-parsed object — the step the
// encrypted formats run AFTER decryption, so a locked standard backup
// yields exactly what an unlocked one would.
export function normalizeImport(parsed) {
  const format = detectFormat(parsed);
  if (!format) {
    throw new Error("Unrecognised file. Doesn't match the Symphony backup or raw on-device format.");
  }
  if (format === FORMAT_MULTISYSTEM) {
    return {
      format,
      payload: parsed,
      localImages: parsed.__local_images || null,
      localFonts: parsed.__local_fonts || null,
      localSettings: parsed.__local_settings || null,
    };
  }
  if (format === FORMAT_STANDARD) {
    return {
      format,
      data: parsed.data,
      localImages: parsed.__local_images || null,
      localFonts: parsed.__local_fonts || null,
      localSettings: parsed.__local_settings || null,
      // Categories the file declares it covers (v0.243.1+; null on older
      // files) — Replace All only replaces these. See backupScope.js.
      categories: Array.isArray(parsed.__categories) ? parsed.__categories : null,
      // Opt-in Friends identity bundle (v0.95.2) — the import flow shows
      // an explicit adoption prompt; it is never applied automatically.
      friendBundle: parsed.__friend_identity || null,
    };
  }
  if (format === FORMAT_RAW_ENCRYPTED || format === FORMAT_STANDARD_ENCRYPTED) {
    return {
      format,
      ciphertext: parsed.__encrypted,
      salt: parsed.__salt || null,
      iterations: parsed.__kdf_iterations || null,
    };
  }
  // FORMAT_RAW_PLAIN — old auto-backups/recovery files carried the
  // FriendIdentity entity raw (leak fixed in v0.95.2). The import path
  // strips it from the data; surface it as a bundle so the consent
  // prompt can offer adoption instead of it silently applying.
  let rawFriendBundle = null;
  const fiTable = parsed?.FriendIdentity;
  if (fiTable && typeof fiTable === 'object') {
    const rows = Array.isArray(fiTable) ? fiTable : Object.values(fiTable);
    const row = rows.find((r) => r && r.userId && r.secret);
    if (row) rawFriendBundle = row;
  }
  return { format, data: parsed, friendBundle: rawFriendBundle };
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

// Decrypts either encrypted import shape and returns the normalized
// import object the caller would have got from an unencrypted file:
//   raw encrypted      → { format: FORMAT_RAW_PLAIN, data, friendBundle }
//   locked standard    → { format: FORMAT_STANDARD, data, localImages, … }
// Throws the same errors as decryptRawEncrypted.
export async function decryptEncryptedImport(parsed, password) {
  const inner = await decryptRawEncrypted(parsed, password);
  // A locked backup of SEVERAL systems (auto-backups hold every system
  // since v0.248.1): hand the whole container back so the caller routes
  // it through the multi-system import, not the single-dump one (which
  // would see no `data` and restore nothing).
  if (parsed.format === FORMAT_STANDARD_ENCRYPTED) {
    const norm = normalizeImport(inner);
    if (norm.format !== FORMAT_STANDARD && norm.format !== FORMAT_MULTISYSTEM) {
      throw new Error('Unlocked the file, but its contents are not a Symphony backup.');
    }
    return norm;
  }
  return normalizeImport(inner);
}

// Seals a standard backup envelope (the object auto-backup builds) behind a
// password: fresh salt per file, current KDF strength, AES-256-GCM via the
// same primitives as at-rest encryption. The result is shape (4) above.
export async function encryptStandardBackup(payload, password) {
  if (!password) throw new Error('backup_password_missing');
  const salt = await generateSalt();
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const ciphertext = await encryptData(payload, key);
  return {
    __format: 'symphony_backup_encrypted',
    __version: 1,
    __exported_at: payload?.__exported_at || new Date().toISOString(),
    __salt: salt,
    __kdf_iterations: KDF_ITERATIONS,
    __encrypted: ciphertext,
  };
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
