// The "Compact (.txt)" backup encoding: gzip + base64 behind a
// "SYMPHONYZ:" prefix. Shared by manual export and auto-backup so both
// write byte-identical files; Import detects the prefix.
import pako from "pako";
import { bytesToBase64 } from "@/lib/base64";

export function compressBackup(data) {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  const compressed = pako.deflate(json);
  // Platform base64 encoder (src/lib/base64.js). The per-byte
  // String.fromCharCode loop this replaced was slow on multi-MB backups.
  return "SYMPHONYZ:" + bytesToBase64(compressed);
}
