import React, { useState, useRef, useCallback } from "react";
import { useTerms } from "@/lib/useTerms";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Copy, ClipboardPaste, Image as ImageIcon, ChevronDown, ChevronRight, Bug, Share2 } from "lucide-react";
import { getFullDbDump, loadDbDump, mergeDbDump, migrateHttpImagesToLocal, getRawIdbDump } from "@/lib/localDb";
import { getAllLocalImages, restoreLocalImages, recompressAllStoredImages } from "@/lib/localImageStorage";
import {
  parseImportText,
  decryptRawEncrypted,
  FORMAT_STANDARD,
  FORMAT_RAW_PLAIN,
  FORMAT_RAW_ENCRYPTED,
} from "@/lib/backupFormat";
import { readBackupLocalSettings, writeBackupLocalSettings } from "@/lib/backupKeys";
import { markBackupExportedToday } from "@/lib/dailyTaskSystem";
import { shareFile } from "@/lib/shareFile";
import { saveBlobToPublicDownloads } from "@/lib/nativeMediaStoreSave";
import { isNative } from "@/lib/platform";
import pako from "pako";

// Single source of truth for the localStorage keys that belong in a
// backup lives in src/lib/backupKeys.js — keep the rules and the list
// there so the manual export, the auto-backup, and the recovery raw
// snapshot can't drift apart again (see changelog 0.11.7 for the
// 8-key regression that prompted the refactor).
const exportLocalSettings = readBackupLocalSettings;
const importLocalSettings = writeBackupLocalSettings;

function compressBackup(data) {
  const json = JSON.stringify(data);
  const compressed = pako.deflate(json);
  let binary = "";
  compressed.forEach(b => binary += String.fromCharCode(b));
  return "SYMPHONYZ:" + btoa(binary);
}

// Decompress a SYMPHONYZ:-prefixed string back to the original JSON text.
// Falls back to returning the input unchanged if it lacks the prefix —
// callers can then try parsing it as raw JSON.
function decompressBackup(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("SYMPHONYZ:")) return trimmed;
  const binary = atob(trimmed.slice("SYMPHONYZ:".length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return pako.inflate(bytes, { to: "string" });
}

// Splits a compressed backup string into `numParts` near-equal slices and
// prefixes each with `PART:idx+1:numParts:` so they can be reassembled in
// any order. If numParts === 1, returns the raw text WITHOUT a prefix —
// that way a "single paste" import can paste it straight back without
// having to strip a header. Format invariant: the substring after the
// third colon must be the original ciphertext slice exactly.
function splitBackupIntoParts(backup, numParts) {
  const n = Math.max(1, Math.floor(numParts) || 1);
  if (n === 1) return { parts: [backup] };
  const parts = [];
  const sliceLen = Math.ceil(backup.length / n);
  for (let i = 0; i < n; i++) {
    const slice = backup.slice(i * sliceLen, (i + 1) * sliceLen);
    parts.push(`PART:${i + 1}:${n}:${slice}`);
  }
  return { parts };
}

// Suggested default chunk count: aim for ~50KB per chunk (the value the
// previous implementation hard-coded), but always at least one part.
function recommendedNumParts(textLength) {
  return Math.max(1, Math.ceil(textLength / 50000));
}

// CLAUDE.md NOTE: any new local entity must be added BOTH here (for the
// raw entity allow-list) AND to the matching EXPORT_CATEGORIES entry
// below. An entity that's only in ENTITY_NAMES will never be exported
// because the export iterator walks EXPORT_CATEGORIES.entities, not this
// list. Device-specific entities (FriendIdentity, PushSubscription) are
// intentionally NOT included — they tie a record to one browser/device
// and restoring them onto a different device causes collisions.
//
// Same rule applies to device-bound state stored OUTSIDE the entity
// system, e.g. localStorage keys like `symphony_native_reminder_log_v1`
// (user-reminder native notification ids) and
// `symphony_plan_reminder_log_v1` (plan-reminder native notification
// ids). Those are not exported — the OS notification ids reference the
// scheduler on a specific Android install, so carrying them across
// devices would be meaningless at best and could let a different
// install cancel notifications it didn't schedule.
const ENTITY_NAMES = [
  "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
  "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
  "Symptom", "SymptomDefinition", "SymptomSession", "SymptomCheckIn",
  "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
  "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate",
  "AlterRelationship", "RelationshipType", "InnerWorldLocation",
  "InnerWorldMap", "InnerWorldLayer", "InnerWorldImage", "InnerWorldPlacement",
  "GroundingTechnique", "GroundingPreference",
  "SupportJournalEntry", "LearningProgress", "ReportTemplate", "ReportExport",
  "DiaryTemplate", "Reminder", "ReminderInstance", "Poll", "TriggerType",
  "StatusNote", "Location", "SystemChangeEvent", "GroceryItem", "GroceryFavorite", "GroceryList", "QuickAction",
  "UnblendQuestion", "HiddenUnblendQuestion",
  "SystemChatChannel", "SystemChatMessage", "SystemChatCategory",
  "ImageAsset", "GroupNote",
];

// Module-scope so it can't hit useTerms — `label` and `desc` are resolved
// at render time via resolveCatLabel / resolveCatDesc below.
function resolveCatLabel(cat, terms) {
  if (cat.id === "alters")   return `${terms.Alters} & Profiles`;
  if (cat.id === "fronting") return `${terms.Fronting} History`;
  return cat.label;
}
function resolveCatDesc(cat, terms) {
  if (cat.id === "alters")   return `Bios, avatars, custom fields, relationships, relationship types, inner world`;
  if (cat.id === "fronting") return `${terms.Switch} history`;
  return cat.desc;
}

const EXPORT_CATEGORIES = [
  { id: "alters",        label: "Alters & Profiles",       entities: ["Alter", "CustomField", "AlterRelationship", "RelationshipType", "InnerWorldLocation", "InnerWorldMap", "InnerWorldLayer", "InnerWorldImage", "InnerWorldPlacement"], desc: "Bios, avatars, custom fields, relationships, relationship types, inner-world maps, layers & placements" },
  { id: "fronting",      label: "Fronting History",         entities: ["FrontingSession"],                                                  desc: "Switch history" },
  { id: "journals",      label: "Journals",                 entities: ["JournalEntry", "SupportJournalEntry"],                              desc: "Journal entries" },
  { id: "checkins",      label: "Check-ins & Emotions",     entities: ["EmotionCheckIn", "SystemCheckIn"],                                  desc: "Emotion & system check-ins" },
  { id: "bulletin",      label: "Bulletin Board",           entities: ["Bulletin", "BulletinComment", "Poll"],                              desc: "Posts, comments, polls" },
  { id: "tracking",      label: "Daily Tracking",           entities: ["DiaryCard", "DailyProgress", "ActivityGoal", "DailyTaskTemplate", "DiaryTemplate"], desc: "Diary cards, goals, templates" },
  { id: "activities",    label: "Activities & Sleep",       entities: ["Activity", "Sleep"],                                                 desc: "Activity logs and sleep records" },
  { id: "tasks",         label: "Tasks",                    entities: ["Task"],                                                              desc: "To-do list" },
  { id: "symptoms",      label: "Symptoms & Tracking",      entities: ["Symptom", "SymptomDefinition", "SymptomSession", "SymptomCheckIn"], desc: "Symptom definitions and check-in history" },
  { id: "groups",        label: "Groups",                   entities: ["Group"],                                                             desc: "Alter groups" },
  { id: "grounding",     label: "Grounding & Safety",       entities: ["GroundingTechnique", "GroundingPreference"],                        desc: "Grounding techniques and preferences" },
  { id: "reminders",     label: "Reminders",                entities: ["Reminder", "ReminderInstance"],                                     desc: "Reminders and scheduled instances" },
  { id: "reports",       label: "Therapy Reports",          entities: ["ReportTemplate", "ReportExport"],                                   desc: "Report templates and exports" },
  { id: "learning",      label: "Learning Progress",        entities: ["LearningProgress"],                                                 desc: "Learning module progress" },
  { id: "settings",      label: "Settings & Custom",        entities: ["SystemSettings", "CustomEmotion", "ActivityCategory", "TriggerType", "QuickAction", "UnblendQuestion", "HiddenUnblendQuestion"], desc: "App settings, custom emotions, trigger types, quick actions, unblend questions" },
  { id: "notes",         label: "Notes & Messages",         entities: ["AlterNote", "AlterMessage", "MentionLog", "GroupNote"],             desc: "Notes, DMs, mentions, group notes" },
  { id: "statuses",     label: "Custom Statuses",           entities: ["StatusNote"],                                                          desc: "Timeline status notes" },
  { id: "locations",    label: "Location History",          entities: ["Location"],                                                            desc: "Location log entries" },
  { id: "lineage",      label: "System Change Events",      entities: ["SystemChangeEvent"],                                                   desc: "Fusion, split, dormancy events" },
  { id: "groceries",    label: "Grocery Lists",             entities: ["GroceryList", "GroceryItem", "GroceryFavorite"],                       desc: "Grocery / privacy-cover lists, their items, and frequent-purchase favourites. Lists marked \"available when locked\" live in localStorage and are NOT included here — they ride along with browser data instead." },
  { id: "chat",         label: "System Chat",               entities: ["SystemChatChannel", "SystemChatMessage", "SystemChatCategory"],        desc: "Chat channels, categories, and every message in them (including private/Direct Message channels)." },
  { id: "images",        label: "Local Images & Assets",    entities: ["ImageAsset"],                                                        desc: "Uploaded images + the reusable asset library (local mode only)", isImages: true },
];

async function downloadJson(data, filename, format = "json", mode = "save") {
  // format:
  //   "json"    — plain JSON.stringify (easier to inspect/share)
  //   "compact" — gzip + base64 envelope ("SYMPHONYZ:") for smaller files
  //
  // mode:
  //   "save"  — silent direct-to-disk (MediaStore on native,
  //             anchor-download on web). What users want when they
  //             tap "Save to device".
  //   "share" — force the OS share sheet (Drive / email /
  //             messaging / Send to PC / etc.). What users want
  //             when they tap "Send to a cloud / app".
  const isCompact = format === "compact";
  const text = isCompact ? compressBackup(data) : JSON.stringify(data, null, 2);
  const mime = isCompact ? "application/octet-stream" : "application/json";
  const blob = new Blob([text], { type: mime });

  // SHARE-MODE early-out: skip MediaStore entirely and go straight
  // to the share-sheet pipeline so the user can pick any
  // destination they want (Drive, email, etc.).
  if (mode === "share") {
    return shareFile({
      blob,
      filename,
      title: "Oceans Symphony Backup",
      dialogTitle: "Send backup file",
      // Default "share" preference for shareFile — share sheet on
      // web, share sheet on native.
    });
  }

  // SAVE-MODE on native: silent direct-to-Downloads via MediaStore.
  // Falls back to the share sheet only if MediaStore isn't
  // available (Android 9 or earlier with the plugin not
  // registered, or unforeseen runtime errors).
  if (isNative()) {
    try {
      const mediaRes = await saveBlobToPublicDownloads({
        blob,
        filename,
        subdir: "Oceans Symphony",
      });
      // saveBlobToPublicDownloads returns `result: "filesystem"` on
      // success (matching autoBackup's interpretation), NOT
      // "media-store" — getting this wrong meant every native
      // backup fell through to the share sheet even when MediaStore
      // had silently succeeded.
      if (mediaRes?.result === "filesystem") {
        return {
          result: "downloaded",
          uri: mediaRes.uri,
          location: mediaRes.location || "Downloads/Oceans Symphony",
        };
      }
      console.warn("[downloadJson] MediaStore unavailable, falling back to Share:", mediaRes?.error);
    } catch (e) {
      console.warn("[downloadJson] MediaStore threw, falling back to Share:", e?.message || e);
    }
  }

  // Web path, or native fallback when MediaStore wasn't available.
  // Native (Capacitor) routes through Filesystem.Cache + @capacitor/share;
  // web/TWA keeps the existing navigator.share → anchor-download chain.
  // Returning the result so the caller can distinguish "failed" from
  // "shared" / "downloaded" / "cancelled".
  return shareFile({
    blob,
    filename,
    title: "Oceans Symphony Backup",
    dialogTitle: "Save backup file",
    // Backup callers want "save to my device", not "send to another
    // app" — anchor-download lands the file in the WebView's
    // download folder, which is what users expect when they tap
    // Export. Share sheet is still used as fallback if the anchor
    // path fails (rare).
    prefer: "download",
  });
}

export default function DataBackupRestore() {
  const terms = useTerms();
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState("json"); // "json" | "compact"
  const [importLoading, setImportLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [importMode, setImportMode] = useState("add");
  const [cachingUrls, setCachingUrls] = useState(false);
  const [cacheUrlResult, setCacheUrlResult] = useState(null);
  const [cacheUrlProgress, setCacheUrlProgress] = useState(null);
  const [recompressing, setRecompressing] = useState(false);
  const [recompressResult, setRecompressResult] = useState(null);
  const [recompressProgress, setRecompressProgress] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugJson, setDebugJson] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);

  // Copy/paste backup workflow — restored as a workaround for in-app
  // browsers (Facebook, Instagram, etc.) that silently block file
  // downloads. See PART:N:M:<chunk> format described above
  // splitBackupIntoParts(). showManualCopy is non-null when the
  // "View as Text" panel is open; numParts is user-controlled and
  // defaults to recommendedNumParts() of the compressed length.
  const [showManualCopy, setShowManualCopy] = useState(null);
  const [numParts, setNumParts] = useState(1);
  const [copiedChunks, setCopiedChunks] = useState(() => new Set());
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteMode, setPasteMode] = useState("single"); // "single" | "multi"
  const [pasteText, setPasteText] = useState("");
  const [multiPartChunks, setMultiPartChunks] = useState([]);
  const [multiPartTotal, setMultiPartTotal] = useState(null);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 5000);
  };

  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [selectedCats, setSelectedCats] = useState(() => new Set(EXPORT_CATEGORIES.map(c => c.id)));
  const [catSizes, setCatSizes] = useState(null); // { catId: sizeKB } — lazy loaded

  // Fetch and cache the full dump + images once
  const fullDumpRef = useRef(null);
  const fullImagesRef = useRef(null);

  const fetchFullDump = useCallback(async () => {
    if (fullDumpRef.current) return { dump: fullDumpRef.current, images: fullImagesRef.current };
    const dump = getFullDbDump();
    let images = {};
    try { images = await getAllLocalImages(); } catch {}
    fullDumpRef.current = dump;
    fullImagesRef.current = images;
    return { dump, images };
  }, []);

  const computeCatSizes = useCallback(async () => {
    if (catSizes) return;
    const { dump, images } = await fetchFullDump();
    const sizes = {};
    for (const cat of EXPORT_CATEGORIES) {
      if (cat.isImages) {
        sizes[cat.id] = Math.round(JSON.stringify(images).length / 1024);
      } else {
        let total = 0;
        for (const e of cat.entities) {
          if (dump[e]) total += JSON.stringify(dump[e]).length;
        }
        sizes[cat.id] = Math.round(total / 1024);
      }
    }
    setCatSizes(sizes);
  }, [catSizes, fetchFullDump]);

  const handleToggleSelectiveOpen = () => {
    setSelectiveOpen(v => {
      if (!v) computeCatSizes();
      return !v;
    });
  };

  const allSelected = selectedCats.size === EXPORT_CATEGORIES.length;
  const toggleAll = () => setSelectedCats(allSelected ? new Set() : new Set(EXPORT_CATEGORIES.map(c => c.id)));
  const toggleCat = (id) => setSelectedCats(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const buildExportData = async (overrideSelectedCats) => {
    const activeCats = overrideSelectedCats ?? selectedCats;
    const { dump, images } = await fetchFullDump();

    const filteredDump = {};
    for (const cat of EXPORT_CATEGORIES) {
      if (!cat.isImages && activeCats.has(cat.id)) {
        for (const e of cat.entities) {
          if (dump[e] === undefined) continue;
          // GroundingTechnique default templates are re-seeded on every
          // fresh device boot from src/utils/groundingDefaults.js, so
          // including them in backups produces duplicates when the user
          // imports onto a device that has already seeded its defaults.
          // Only user-authored / user-edited entries (is_default !== true)
          // are exported.
          if (e === "GroundingTechnique") {
            // dump[e] is an object keyed by id ({ id1: rec1, ... }), NOT
            // an array — calling .filter on it threw "filter is not a
            // function" and broke every export path. Walk the entries and
            // rebuild the same object shape.
            const src = dump[e];
            if (Array.isArray(src)) {
              filteredDump[e] = src.filter((t) => t && !t.is_default);
            } else if (src && typeof src === "object") {
              const out = {};
              for (const [id, rec] of Object.entries(src)) {
                if (rec && !rec.is_default) out[id] = rec;
              }
              filteredDump[e] = out;
            } else {
              filteredDump[e] = src;
            }
          } else {
            filteredDump[e] = dump[e];
          }
        }
      }
    }

    const imagesExport = activeCats.has("images") ? images : {};

    return {
      __format: "symphony_backup",
      __version: 1,
      __exported_at: new Date().toISOString(),
      data: filteredDump,
      __local_images: imagesExport,
      __local_settings: exportLocalSettings(),
    };
  };

  // Two-mode export. `mode = "save"` writes the backup straight to
  // the device (MediaStore Downloads on native, browser download on
  // web). `mode = "share"` skips the silent write and pops the OS
  // share sheet so the user can pick a destination (Drive, email,
  // Send to PC, etc.). Buttons in the UI call this with their
  // respective mode.
  // Detect the "stale WebView refers to a chunk hash from an older
  // build that no longer exists" failure mode so we can suggest a
  // hard reload instead of dumping a raw module-loader error string
  // on the user. Triggered by shareFile.js returning
  // `error: "chunk_load_failed"`, or by the dynamic-import string
  // bubbling up from somewhere else.
  const isChunkLoadFailure = (err) => {
    if (!err) return false;
    if (err === "chunk_load_failed") return true;
    const s = String(err).toLowerCase();
    return s.includes("dynamically imported module")
      || s.includes("failed to fetch")
      || s.includes("chunk_load_failed");
  };
  const chunkRecoveryMsg = "Export failed — the app needs to reload to pick up the latest assets. Close and reopen the app, or pull-to-refresh, then try again.";

  const runExport = async (mode = "save") => {
    setExportLoading(true);
    try {
      const exportData = await buildExportData();
      const date = new Date().toISOString().slice(0, 10);
      const ext = exportFormat === "compact" ? "txt" : "json";
      const res = await downloadJson(exportData, `symphony-backup-${date}.${ext}`, exportFormat, mode);
      if (res?.result === "failed") {
        if (isChunkLoadFailure(res.error)) {
          showStatus("error", chunkRecoveryMsg);
        } else {
          showStatus("error", `Export failed${res.error ? `: ${res.error}` : ""}`);
        }
      } else if (res?.result === "cancelled") {
        // User dismissed the share sheet — no toast, no surprise.
      } else {
        const msg = res?.result === "shared"
          ? "Backup ready — pick a destination"
          : res?.location
            ? `Backup saved to ${res.location} 📁`
            : "Backup exported!";
        showStatus("success", msg);
        // Mark today as "backup exported" so a daily task wired to the
        // backup_exported auto-trigger can complete itself.
        try {
          markBackupExportedToday();
        } catch {
          // best-effort — daily task plumbing is non-critical
        }
      }
    } catch (e) {
      if (isChunkLoadFailure(e?.message)) {
        showStatus("error", chunkRecoveryMsg);
      } else {
        showStatus("error", `Export failed: ${e.message}`);
      }
    } finally {
      setExportLoading(false);
    }
  };
  const handleExportFull  = () => runExport("save");
  const handleExportShare = () => runExport("share");

  // Applies an already-parsed { data, localImages?, localSettings? } payload
  // to the in-memory DB. Shared by the standard-backup, raw-plain, and
  // raw-encrypted (post-decryption) paths.
  const applyImportPayload = async ({ data, localImages, localSettings }) => {
    if (localImages) {
      try { await restoreLocalImages(localImages); } catch (e) {
        console.warn("Failed to restore local images:", e);
      }
    }
    if (localSettings) {
      importLocalSettings(localSettings);
    }
    if (importMode === "replace") {
      // Device-bound entities (FriendIdentity, PushSubscription) are
      // deliberately excluded from backups so they can't be restored onto a
      // DIFFERENT device and impersonate the user. But a Replace-All restore
      // must still PRESERVE them on THIS device — wiping the FriendIdentity
      // deletes the user's Friends profile, forcing a re-register that mints
      // a brand-new server userId and leaves a duplicate "ghost" profile on
      // every friend's list (reported bug). Carry the current device's copies
      // forward into the replacement dump. (RecoveryScreen's intentional
      // "fresh start" still wipes everything — it calls loadDbDump directly.)
      const preserved = {};
      try {
        const current = getFullDbDump();
        for (const name of ["FriendIdentity", "PushSubscription"]) {
          if (current[name]) preserved[name] = current[name];
        }
      } catch { /* no current DB to preserve from — nothing to carry forward */ }
      await loadDbDump({ ...data, ...preserved });
      showStatus("success", "Data replaced! The app will reload.");
    } else {
      await mergeDbDump(data);
      showStatus("success", "New records added (existing data preserved)! The app will reload.");
    }
    setTimeout(() => window.location.reload(), 1200);
  };

  // Encrypted raw imports need a password to decrypt before they can be
  // applied. We park the parsed envelope here and surface a small prompt
  // modal; the modal's submit calls applyImportPayload once decrypted.
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState(null);

  const processImport = async (text) => {
    const parsed = parseImportText(text);
    if (parsed.format === FORMAT_STANDARD) {
      await applyImportPayload({
        data: parsed.data,
        localImages: parsed.localImages,
        localSettings: parsed.localSettings,
      });
      return;
    }
    if (parsed.format === FORMAT_RAW_PLAIN) {
      await applyImportPayload({ data: parsed.data });
      return;
    }
    if (parsed.format === FORMAT_RAW_ENCRYPTED) {
      // Defer to the password modal — caller flow resumes there.
      setPendingEncryptedImport(parsed);
      return;
    }
  };

  const handleCacheUrlImages = async () => {
    setCachingUrls(true);
    setCacheUrlResult(null);
    setCacheUrlProgress({ migrated: 0, failed: 0, skipped: 0 });
    try {
      const result = await migrateHttpImagesToLocal((progress) => {
        setCacheUrlProgress({ ...progress });
      });
      setCacheUrlResult({
        type: "success",
        message: `Done! Cached ${result.migrated} image(s) locally.${result.failed > 0 ? ` ${result.failed} could not be fetched (CORS or offline).` : ""}`,
      });
    } catch (e) {
      setCacheUrlResult({ type: "error", message: `Failed: ${e.message}` });
    } finally {
      setCachingUrls(false);
      setCacheUrlProgress(null);
    }
  };

  const handleRecompressImages = async () => {
    setRecompressing(true);
    setRecompressResult(null);
    setRecompressProgress({ processed: 0, total: 0, savedKB: 0 });
    try {
      const result = await recompressAllStoredImages(512, 0.82, (p) => setRecompressProgress({ ...p }));
      setRecompressResult({
        type: "success",
        message: `Done! Processed ${result.processed} image(s), saved ~${result.savedKB}KB.`,
      });
      fullDumpRef.current = null;
      fullImagesRef.current = null;
    } catch (e) {
      setRecompressResult({ type: "error", message: `Failed: ${e.message}` });
    } finally {
      setRecompressing(false);
      setRecompressProgress(null);
    }
  };

  const handleImportFromFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      // Two-stage decode: try the compact (gzip) wrapper first to get
      // the inner JSON text, then hand off to parseImportText which
      // accepts standard backup, raw plain, or raw encrypted shapes.
      const fileText = await file.text();
      const trimmed = fileText.trim();
      let innerJsonText;
      if (trimmed.startsWith("SYMPHONYZ:")) {
        const binary = atob(trimmed.slice(10));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        innerJsonText = pako.inflate(bytes, { to: "string" });
      } else {
        innerJsonText = trimmed;
      }
      await processImport(innerJsonText);
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Copy/Paste Backup Handlers ────────────────────────────────────────
  // Workaround for in-app browsers (Facebook, Instagram) that silently
  // block file downloads. The user can view the compressed backup as
  // text, copy each part, and paste them back later for restore.

  const handleViewAsText = async () => {
    setExportLoading(true);
    try {
      const exportData = await buildExportData();
      const compressed = compressBackup(exportData);
      const n = recommendedNumParts(compressed.length);
      const { parts } = splitBackupIntoParts(compressed, n);
      setShowManualCopy({ parts, compressed });
      setNumParts(n);
      setCopiedChunks(new Set());
    } catch (e) {
      showStatus("error", `Could not build backup text: ${e.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  // Recompute parts whenever numParts changes (no need to re-fetch the dump
  // — the compressed text is already cached on showManualCopy).
  const handleChangeNumParts = (next) => {
    const n = Math.min(50, Math.max(1, Math.floor(Number(next)) || 1));
    setNumParts(n);
    setShowManualCopy((cur) => {
      if (!cur) return cur;
      const { parts } = splitBackupIntoParts(cur.compressed, n);
      return { ...cur, parts };
    });
    setCopiedChunks(new Set());
  };

  const handleCopyPartToClipboard = async (part, idx) => {
    try {
      await navigator.clipboard.writeText(part);
      setCopiedChunks((prev) => {
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
      // For in-app browsers (FB/IG) the copy-paste workflow is the
      // user's actual export path, so a successful copy counts as a
      // backup export for daily-task purposes.
      try {
        markBackupExportedToday();
      } catch {
        // best-effort
      }
    } catch (e) {
      showStatus("error", `Copy failed: ${e.message}. Long-press the text and copy manually.`);
    }
  };

  const handleClosePartsPanel = () => {
    setShowManualCopy(null);
    setCopiedChunks(new Set());
  };

  const handleOpenPasteInput = () => {
    setShowPasteInput(true);
    setPasteMode("single");
    setPasteText("");
    setMultiPartChunks([]);
    setMultiPartTotal(null);
  };

  const handleCancelPasteInput = () => {
    setShowPasteInput(false);
    setPasteText("");
    setMultiPartChunks([]);
    setMultiPartTotal(null);
  };

  const handlePasteImportSingle = async () => {
    const text = pasteText.trim();
    if (!text) {
      showStatus("error", "Paste the backup text first.");
      return;
    }
    if (text.startsWith("PART:")) {
      showStatus("error", "That looks like a multi-part chunk — switch to Multi-Part Paste mode.");
      return;
    }
    setImportLoading(true);
    try {
      const inner = decompressBackup(text);
      await processImport(inner);
      setShowPasteInput(false);
      setPasteText("");
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handlePasteImportAddPart = () => {
    const text = pasteText.trim();
    if (!text) {
      showStatus("error", "Paste a part first.");
      return;
    }
    const match = text.match(/^PART:(\d+):(\d+):([\s\S]*)$/);
    if (!match) {
      showStatus("error", "That doesn't look like a PART:N:M: chunk.");
      return;
    }
    const partNum = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    const body = match[3];
    if (!partNum || !total || partNum < 1 || partNum > total) {
      showStatus("error", `Invalid part numbering (got ${partNum} of ${total}).`);
      return;
    }
    if (multiPartTotal !== null && multiPartTotal !== total) {
      showStatus("error", `Mismatched total: previous parts said ${multiPartTotal}, this one says ${total}.`);
      return;
    }
    setMultiPartTotal(total);
    setMultiPartChunks((prev) => {
      const next = prev.length === total ? [...prev] : new Array(total).fill(null);
      // copy existing values if length changed
      for (let i = 0; i < prev.length && i < total; i++) next[i] = prev[i];
      next[partNum - 1] = body;
      return next;
    });
    setPasteText("");
  };

  const handlePasteImportMulti = async () => {
    if (!multiPartTotal || multiPartChunks.length < multiPartTotal) {
      showStatus("error", "Not all parts have been added yet.");
      return;
    }
    for (let i = 0; i < multiPartTotal; i++) {
      if (!multiPartChunks[i]) {
        showStatus("error", `Missing part ${i + 1} of ${multiPartTotal}.`);
        return;
      }
    }
    setImportLoading(true);
    try {
      const joined = multiPartChunks.join("");
      const inner = decompressBackup(joined);
      await processImport(inner);
      setShowPasteInput(false);
      setMultiPartChunks([]);
      setMultiPartTotal(null);
      setPasteText("");
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  // Submit handler for the encrypted-raw password modal.
  const handleDecryptAndImport = async (password) => {
    if (!pendingEncryptedImport) return;
    setImportLoading(true);
    try {
      const data = await decryptRawEncrypted(pendingEncryptedImport, password);
      setPendingEncryptedImport(null);
      await applyImportPayload({ data });
    } catch (e) {
      showStatus("error", `Decrypt failed: ${e.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <FileJson className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Backup & Export</CardTitle>
            <CardDescription>Export your data to a file, or import from a previous backup.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            status.type === "success"
              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
              : "bg-destructive/5 text-destructive"
          }`}>
            {status.type === "success"
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {status.message}
          </div>
        )}

        <div className="space-y-2 pb-3 border-b border-border/40">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cache URL Images Offline</p>
            <p className="text-xs text-muted-foreground">Download any images stored as external URLs (e.g. avatars pasted as links) into local storage so they display offline.</p>
            {cacheUrlResult && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${cacheUrlResult.type === "success" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-destructive/5 text-destructive"}`}>
                {cacheUrlResult.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {cacheUrlResult.message}
              </div>
            )}
            <Button variant="outline" onClick={handleCacheUrlImages} disabled={cachingUrls} className="w-full gap-2 justify-start">
              {cachingUrls ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              <div className="text-left">
                <p className="font-medium">Cache Images for Offline</p>
                {cachingUrls && cacheUrlProgress ? (
                  <p className="text-xs text-muted-foreground font-normal">
                    {cacheUrlProgress.migrated} cached · {cacheUrlProgress.failed} failed · {cacheUrlProgress.skipped} skipped
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground font-normal">Requires network · saves images locally</p>
                )}
              </div>
            </Button>
          </div>

        <div className="space-y-2 pb-3 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recompress Stored Images</p>
          <p className="text-xs text-muted-foreground">Resize and re-encode all locally stored images to 512px max / JPEG 82%. Run this once to shrink backup size if images are large.</p>
          {recompressResult && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${recompressResult.type === "success" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-destructive/5 text-destructive"}`}>
              {recompressResult.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {recompressResult.message}
            </div>
          )}
          <Button variant="outline" onClick={handleRecompressImages} disabled={recompressing} className="w-full gap-2 justify-start">
            {recompressing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Recompress Images</p>
              {recompressing && recompressProgress ? (
                <p className="text-xs text-muted-foreground font-normal">
                  {recompressProgress.processed}/{recompressProgress.total} · saved {recompressProgress.savedKB}KB so far
                </p>
              ) : (
                <p className="text-xs text-muted-foreground font-normal">Shrinks backup size · irreversible</p>
              )}
            </div>
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export</p>

          {/* Selective export collapsible */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <button type="button" onClick={handleToggleSelectiveOpen}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors">
              <span className="text-muted-foreground">Advanced: Choose what to export</span>
              {selectiveOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {selectiveOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedCats.size} of {EXPORT_CATEGORIES.length} categories selected
                    {catSizes && ` · ~${EXPORT_CATEGORIES.filter(c => selectedCats.has(c.id)).reduce((sum, c) => sum + (catSizes[c.id] || 0), 0)}KB`}
                  </span>
                  <button type="button" onClick={toggleAll} className="text-xs text-primary font-medium hover:underline">
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-1">
                  {EXPORT_CATEGORIES.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-muted/20 cursor-pointer">
                      <input type="checkbox" checked={selectedCats.has(cat.id)} onChange={() => toggleCat(cat.id)}
                        className="w-4 h-4 rounded accent-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{resolveCatLabel(cat, terms)}</span>
                          {cat.isImages && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠️</span>}
                          {catSizes && <span className="text-xs text-muted-foreground ml-auto">{catSizes[cat.id] || 0}KB</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{cat.isImages ? "Excluding this means images won't transfer" : resolveCatDesc(cat, terms)}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export format toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Format:</span>
            <button
              type="button"
              onClick={() => setExportFormat("json")}
              className={`px-3 py-1 rounded-lg border transition-colors ${exportFormat === "json" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
            >
              Plain .json
            </button>
            <button
              type="button"
              onClick={() => setExportFormat("compact")}
              className={`px-3 py-1 rounded-lg border transition-colors ${exportFormat === "compact" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
            >
              Compact (.txt)
            </button>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            {exportFormat === "json"
              ? "Human-readable JSON. Larger file, easy to inspect."
              : "Gzip + base64 envelope. Smaller file, opaque to the eye."}
          </p>

          <Button variant="outline" onClick={handleExportFull} disabled={exportLoading} className="w-full gap-2 justify-start">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Save to device</p>
              <p className="text-xs text-muted-foreground font-normal">
                {selectiveOpen && selectedCats.size < EXPORT_CATEGORIES.length
                  ? `${selectedCats.size} categories · drops in Downloads/Oceans Symphony`
                  : isNative()
                    ? "Drops in Downloads/Oceans Symphony — no share sheet"
                    : "Browser downloads to your default folder"}
              </p>
            </div>
          </Button>

          <Button variant="outline" onClick={handleExportShare} disabled={exportLoading} className="w-full gap-2 justify-start">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Share or send elsewhere</p>
              <p className="text-xs text-muted-foreground font-normal">
                Opens the share sheet — pick Drive, email, Send to PC, etc.
              </p>
            </div>
          </Button>
        </div>

        {/* Alternative: Copy/Paste Backup — workaround for in-app browsers
            (Facebook, Instagram, etc.) that silently block file downloads. */}
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alternative: Copy/Paste Backup</p>
          <p className="text-xs text-muted-foreground">Use this when file downloads aren't available — e.g. when the app is opened inside the Facebook or Instagram in-app browser.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleViewAsText} disabled={exportLoading} className="gap-2 justify-start">
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">View as Text</span>
            </Button>
            <Button variant="outline" onClick={handleOpenPasteInput} disabled={importLoading} className="gap-2 justify-start">
              <ClipboardPaste className="w-4 h-4" />
              <span className="text-sm">Paste Backup</span>
            </Button>
          </div>

          {showManualCopy && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                  <strong>Critical: do not alter the text in any way.</strong> Copy each part EXACTLY as shown — adding line breaks, spaces, or changing any character will corrupt the backup. Keep the <code className="font-mono">PART:N:M:</code> prefix at the start of each part exactly as-is.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-medium">Split into</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={numParts}
                  onChange={(e) => handleChangeNumParts(e.target.value)}
                  className="w-16 px-2 py-1 rounded-md border border-input bg-background text-xs text-center"
                />
                <span className="text-xs font-medium">parts</span>
                <span className="text-xs text-muted-foreground">
                  (~{Math.max(1, Math.round(showManualCopy.compressed.length / numParts / 1024))}kb each)
                </span>
              </div>
              <div className="space-y-2">
                {showManualCopy.parts.map((part, idx) => (
                  <div key={idx} className="rounded-lg border border-border/50 bg-background p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">Part {idx + 1} of {showManualCopy.parts.length}</span>
                      <div className="flex items-center gap-2">
                        {copiedChunks.has(idx) && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✅ Copied</span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleCopyPartToClipboard(part, idx)}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                        </Button>
                      </div>
                    </div>
                    <textarea
                      readOnly
                      value={part}
                      rows={5}
                      onFocus={(e) => e.target.select()}
                      className="w-full px-2 py-1.5 rounded-md border border-input bg-muted/30 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleClosePartsPanel}>Done</Button>
              </div>
            </div>
          )}

          {showPasteInput && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                  <strong>Critical: paste the text exactly as it was copied.</strong> If you edited it, retyped it, or pasted from somewhere that auto-formatted (line breaks, smart quotes, etc.), the import will fail. The <code className="font-mono">PART:N:M:</code> prefix must be intact.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasteMode("single")}
                  className={`px-3 py-1 rounded-lg border text-xs transition-colors ${pasteMode === "single" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
                >
                  Single Paste
                </button>
                <button
                  type="button"
                  onClick={() => setPasteMode("multi")}
                  className={`px-3 py-1 rounded-lg border text-xs transition-colors ${pasteMode === "multi" ? "bg-primary/10 border-primary/40 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
                >
                  Multi-Part Paste
                </button>
              </div>

              {pasteMode === "single" ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Paste the full backup text. If your backup was split into parts, switch to Multi-Part.</p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={6}
                    className="w-full px-2 py-1.5 rounded-md border border-input bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handlePasteImportSingle} disabled={importLoading || !pasteText.trim()}>
                      {importLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      Import
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Paste one part at a time and tap Add Part. Once every part is added, tap Import.</p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={4}
                    className="w-full px-2 py-1.5 rounded-md border border-input bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {multiPartTotal === null
                        ? (multiPartChunks.filter(Boolean).length === 0 ? "0 of ? parts received" : `${multiPartChunks.filter(Boolean).length} of ? parts received`)
                        : `${multiPartChunks.filter(Boolean).length} of ${multiPartTotal} parts received`}
                    </span>
                    <Button size="sm" variant="outline" onClick={handlePasteImportAddPart} disabled={!pasteText.trim()}>
                      Add Part
                    </Button>
                  </div>
                  {multiPartTotal !== null && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Array.from({ length: multiPartTotal }, (_, i) => (
                        <span
                          key={i}
                          className={`text-xs px-2 py-0.5 rounded-md border ${multiPartChunks[i] ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300" : "bg-muted/30 border-border/50 text-muted-foreground"}`}
                        >
                          Part {i + 1} {multiPartChunks[i] ? "✓" : "(waiting)"}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handlePasteImportMulti}
                      disabled={importLoading || !multiPartTotal || multiPartChunks.filter(Boolean).length < multiPartTotal}
                    >
                      {importLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      Import
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleCancelPasteInput}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Import</p>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input type="radio" name="importMode" value="add" checked={importMode === "add"} onChange={(e) => setImportMode(e.target.value)} className="w-4 h-4" />
              <span className="text-xs font-medium">Add New</span>
            </label>
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input type="radio" name="importMode" value="replace" checked={importMode === "replace"} onChange={(e) => setImportMode(e.target.value)} className="w-4 h-4" />
              <span className="text-xs font-medium">Replace All</span>
            </label>
          </div>
          {/* No `accept` filter. Google Drive's "Choose an item"
              picker hands the WebView a content:// URI whose MIME
              is usually application/octet-stream regardless of the
              .json extension on the underlying file, so an
              `accept=".json,.txt"` filter made every Drive-hosted
              backup unselectable. Local files still work because
              the parse step rejects anything that isn't a valid
              backup envelope with a clear error toast. */}
          <input ref={fileInputRef} type="file" onChange={handleImportFromFile} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full gap-2 justify-start">
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Import from File</p>
              <p className="text-xs text-muted-foreground font-normal">Symphony backup .json or .txt file</p>
            </div>
          </Button>
          <p className="text-xs text-muted-foreground">
            {importMode === "replace"
              ? "⚠️ Replace All will delete existing data and import from backup."
              : "⚠️ Add New imports records — it does not replace existing data."}
          </p>
        </div>
        {/* Debug: View Local Data */}
        <div className="space-y-2 pt-1 border-t border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Developer</p>
          <Button
            variant="outline"
            onClick={async () => {
              if (debugOpen) { setDebugOpen(false); setDebugJson(null); return; }
              setDebugLoading(true);
              try {
                const dump = await getRawIdbDump();
                setDebugJson(JSON.stringify(dump, null, 2));
                setDebugOpen(true);
              } catch (e) {
                showStatus("error", "Could not read local data: " + e.message);
              } finally {
                setDebugLoading(false);
              }
            }}
            disabled={debugLoading}
            className="w-full gap-2 justify-start"
          >
            {debugLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Debug: View Local Data</p>
              <p className="text-xs text-muted-foreground font-normal">Inspect raw JSON in IndexedDB</p>
            </div>
          </Button>
          {debugOpen && debugJson && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Raw IndexedDB contents</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(debugJson);
                      setDebugCopied(true);
                      setTimeout(() => setDebugCopied(false), 2000);
                    } catch {}
                  }}
                >
                  {debugCopied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {debugCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <textarea
                readOnly
                value={debugJson}
                className="w-full h-64 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                onFocus={e => e.target.select()}
              />
              <p className="text-xs text-muted-foreground">
                Entities: {Object.keys(JSON.parse(debugJson)).filter(k => !k.startsWith('_')).join(', ')}
              </p>
            </div>
          )}
        </div>
      </CardContent>
      <EncryptedImportPasswordModal
        open={!!pendingEncryptedImport}
        onClose={() => setPendingEncryptedImport(null)}
        onSubmit={handleDecryptAndImport}
        busy={importLoading}
      />
    </Card>
  );
}

function EncryptedImportPasswordModal({ open, onClose, onSubmit, busy }) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4">
        <h3 className="font-semibold text-lg">Encrypted file</h3>
        <p className="text-sm text-muted-foreground">
          This file is an encrypted raw on-device snapshot. Enter the password
          you used when the file was created to decrypt and import it.
        </p>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password) onSubmit(password); }}
            placeholder="Password used to encrypt the file"
            className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPass(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs"
          >
            {showPass ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit(password)} disabled={busy || !password}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Decrypt &amp; Import
          </Button>
        </div>
      </div>
    </div>
  );
}
