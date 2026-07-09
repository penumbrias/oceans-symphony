import React, { useState, useRef, useCallback } from "react";
import { useTerms } from "@/lib/useTerms";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Copy, ClipboardPaste, Image as ImageIcon, ChevronDown, ChevronRight, Bug, Share2 } from "lucide-react";
import { getFullDbDump, loadDbDump, mergeDbDump, migrateHttpImagesToLocal, getRawIdbDump } from "@/lib/localDb";
import { getAllLocalImages, restoreLocalImages, recompressAllStoredImages } from "@/lib/localImageStorage";
import { getAllLocalFonts, restoreLocalFonts } from "@/lib/localFontStorage";
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
import { listSystems, getActiveSystemId, getSystemData, createSystemWithData, deleteSystem, setActiveSystem } from "@/lib/systems";
import { mergeSystemsAsGroups, computeUnmatchedExistingSystems } from "@/lib/multiSystemBackup";
import pako from "pako";

// Single source of truth for the localStorage keys that belong in a
// backup lives in src/lib/backupKeys.js — keep the rules and the list
// there so the manual export, the auto-backup, and the recovery raw
// snapshot can't drift apart again (see changelog 0.11.7 for the
// 8-key regression that prompted the refactor).
const exportLocalSettings = readBackupLocalSettings;
const importLocalSettings = writeBackupLocalSettings;

// Detect a non-Symphony external export so the unified importer can hand it
// to the right app's importer. Returns "octocon" | "simplyplural" |
// "openplural" | "ask" (look-alike members file we can't disambiguate) | null
// (null = let the standard Symphony parser handle it).
export function externalKindFromJson(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  if (j.__format === "symphony_backup" || typeof j.__encrypted === "string") return null;
  if (Array.isArray(j.alters) && ("fronts" in j || "tags" in j || "user" in j)) return "octocon";
  if (Array.isArray(j.members)) {
    if (j.frontHistory !== undefined || j.channelCategories !== undefined || j.customFields !== undefined || j.chatMessages !== undefined) return "simplyplural";
    if (j.front_periods !== undefined || j.custom_fields !== undefined || j.relationships !== undefined || j.conversations !== undefined) return "openplural";
    return "ask";
  }
  return null;
}

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
  "ImageAsset", "GroupNote", "Presence",
  "Contact", "ContactNote", "ContactRelationship", "ContactCustomField", "ContactCategory", "ContactRelationshipType", "ContactEncounter",
  "CustomFont",
];

// Module-scope so it can't hit useTerms — `label` and `desc` are resolved
// at render time via resolveCatLabel / resolveCatDesc below. Exported so
// the data inspector (DataInspector.jsx) can render the same labels.
export function resolveCatLabel(cat, terms) {
  if (cat.id === "alters")   return `${terms.Alters} & Profiles`;
  if (cat.id === "fronting") return `${terms.Fronting} History`;
  return cat.label;
}
export function resolveCatDesc(cat, terms) {
  if (cat.id === "alters")   return `Bios, avatars, custom fields, relationships, relationship types, inner world`;
  if (cat.id === "fronting") return `${terms.Switch} history`;
  return cat.desc;
}

export const EXPORT_CATEGORIES = [
  { id: "alters",        label: "Alters & Profiles",       entities: ["Alter", "CustomField", "AlterRelationship", "RelationshipType", "InnerWorldLocation", "InnerWorldMap", "InnerWorldLayer", "InnerWorldImage", "InnerWorldPlacement", "Presence"], desc: "Bios, avatars, custom fields, relationships, relationship types, inner-world maps, layers, placements & new presences" },
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
  { id: "contacts",      label: "Contacts",                 entities: ["Contact", "ContactNote", "ContactRelationship", "ContactCustomField", "ContactCategory", "ContactRelationshipType", "ContactEncounter"], desc: "External people: contact info, safety, boundaries, notes, relationships, custom fields, categories, types & time-together log" },
  { id: "fonts",         label: "Custom Fonts",             entities: ["CustomFont"],                                                        desc: "Uploaded font files (local mode only)", isFonts: true },
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

  // WEB: prefer the File System Access API so the user picks the exact folder +
  // filename (a real "Save As" dialog) instead of the file silently landing in
  // the browser's default download folder — the "it feels sneaky" complaint.
  // Chrome/Edge desktop support it; other browsers (and the native WebView,
  // handled above via MediaStore) fall through to the anchor-download below.
  if (!isNative() && typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Oceans Symphony backup", accept: { [mime]: [isCompact ? ".txt" : ".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { result: "downloaded", location: `“${handle.name}” (where you chose)` };
    } catch (e) {
      if (e && e.name === "AbortError") return { result: "cancelled" }; // user closed the Save dialog
      console.warn("[downloadJson] showSaveFilePicker failed, falling back to download:", e?.message || e);
    }
  }

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

// Filter one raw entity dump ({ EntityName: { id: rec } }) down to the
// selected export categories. GroundingTechnique defaults (re-seeded on every
// fresh boot) are dropped so imports don't duplicate them. Module-scope
// (not component-scoped) so both the main export flow and the data
// inspector's per-category export can share it.
function filterDump(dump, activeCats) {
  const out = {};
  for (const cat of EXPORT_CATEGORIES) {
    if (cat.isImages || !activeCats.has(cat.id)) continue;
    for (const e of cat.entities) {
      if (dump[e] === undefined) continue;
      if (e === "GroundingTechnique") {
        const src = dump[e];
        if (Array.isArray(src)) {
          out[e] = src.filter((t) => t && !t.is_default);
        } else if (src && typeof src === "object") {
          const o = {};
          for (const [id, rec] of Object.entries(src)) if (rec && !rec.is_default) o[id] = rec;
          out[e] = o;
        } else {
          out[e] = src;
        }
      } else {
        out[e] = dump[e];
      }
    }
  }
  return out;
}

// Device-bound entities — deliberately excluded from ENTITY_NAMES /
// EXPORT_CATEGORIES (see the comment block above ENTITY_NAMES). Listed here
// only so the data inspector can show them as "this device only" with a
// count, for transparency, without offering export/delete on them.
const DEVICE_BOUND_ENTITIES = ["FriendIdentity", "PushSubscription"];

// Per-category breakdown (record count + size in KB) for the "See Your
// Data" advanced inspector. Generic over EXPORT_CATEGORIES so it self-adapts
// to any isImages/isFonts-style special-cased category without needing to
// know about them individually.
export async function computeCategoryStats() {
  const dump = getFullDbDump();
  let images = {};
  try { images = await getAllLocalImages(); } catch {}
  let fonts = {};
  try { fonts = await getAllLocalFonts(); } catch {}
  const categories = {};
  for (const cat of EXPORT_CATEGORIES) {
    if (cat.isImages) {
      categories[cat.id] = { sizeKB: Math.round(JSON.stringify(images).length / 1024), count: Object.keys(images).length };
    } else if (cat.isFonts) {
      categories[cat.id] = { sizeKB: Math.round(JSON.stringify(fonts).length / 1024), count: Object.keys(fonts).length };
    } else {
      let total = 0, count = 0;
      for (const e of cat.entities) {
        if (dump[e]) { total += JSON.stringify(dump[e]).length; count += Object.keys(dump[e]).length; }
      }
      categories[cat.id] = { sizeKB: Math.round(total / 1024), count };
    }
  }
  const deviceBound = {};
  for (const e of DEVICE_BOUND_ENTITIES) {
    deviceBound[e] = { count: dump[e] ? Object.keys(dump[e]).length : 0 };
  }
  return { categories, deviceBound };
}

// Exports just ONE category, reusing the same envelope shape/format and
// silent "save to device" path as the main selective export. Used by the
// data inspector's per-category export and, ahead of any per-category
// delete, as the safety-net backup that must succeed before the delete
// proceeds.
export async function exportSingleCategory(catId) {
  const cat = EXPORT_CATEGORIES.find((c) => c.id === catId);
  if (!cat) throw new Error(`Unknown category: ${catId}`);
  const dump = getFullDbDump();
  const images = cat.isImages ? await getAllLocalImages() : {};
  const fonts = cat.isFonts ? await getAllLocalFonts() : {};
  const activeCats = new Set([catId]);
  const exportData = {
    __format: "symphony_backup",
    __version: 1,
    __exported_at: new Date().toISOString(),
    data: filterDump(dump, activeCats),
    __local_images: images,
    __local_fonts: fonts,
    __local_settings: {},
  };
  const date = new Date().toISOString().slice(0, 10);
  return downloadJson(exportData, `oceans-symphony-${catId}-${date}.json`, "json", "save");
}

export default function DataBackupRestore({ section = "all", onExternalFile, exportExtras = [] }) {
  const terms = useTerms();
  // Which slice to render — lets Settings split this into separate accordion
  // sections (export / import / storage tools) without forking the logic.
  // "all" keeps the original single-card layout for any other caller.
  const showStorageTools = section === "all" || section === "storage";
  const showExport = section === "all" || section === "export";
  const showImport = section === "all" || section === "import";
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState("json"); // "json" | "compact" | <extra key>
  // Standard (Symphony-native) formats show the full export UI; non-standard
  // extras (OpenPlural / Simply Plural) render their own exporter inline.
  const isStdFormat = exportFormat === "json" || exportFormat === "compact";
  const [importLoading, setImportLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [importMode, setImportMode] = useState("add");
  // Multi-system "Replace all": when the backup doesn't include some systems the
  // user currently has, park the pending import here and show a keep/clear
  // prompt. `replaceResolveRef` holds the promise resolver `processImport`
  // awaits — called with the Set of system ids to KEEP (or null to cancel).
  const [replaceSystemsPrompt, setReplaceSystemsPrompt] = useState(null);
  const replaceResolveRef = useRef(null);
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
  // Multi-system export scope (Symphony format only): "active" (this system),
  // "separate" (every system, kept distinct), or "merged" (all flattened into
  // one, each system becoming a group). Only surfaced when >1 system exists.
  const allSystems = listSystems();
  const hasManySystems = allSystems.length > 1;
  const [systemsScope, setSystemsScope] = useState("active");
  const [catSizes, setCatSizes] = useState(null); // { catId: sizeKB } — lazy loaded

  // Fetch and cache the full dump + images + fonts once
  const fullDumpRef = useRef(null);
  const fullImagesRef = useRef(null);
  const fullFontsRef = useRef(null);

  const fetchFullDump = useCallback(async () => {
    if (fullDumpRef.current) return { dump: fullDumpRef.current, images: fullImagesRef.current, fonts: fullFontsRef.current };
    const dump = getFullDbDump();
    let images = {};
    try { images = await getAllLocalImages(); } catch {}
    let fonts = {};
    try { fonts = await getAllLocalFonts(); } catch {}
    fullDumpRef.current = dump;
    fullImagesRef.current = images;
    fullFontsRef.current = fonts;
    return { dump, images, fonts };
  }, []);

  const computeCatSizes = useCallback(async () => {
    if (catSizes) return;
    const { dump, images, fonts } = await fetchFullDump();
    const sizes = {};
    for (const cat of EXPORT_CATEGORIES) {
      if (cat.isImages) {
        sizes[cat.id] = Math.round(JSON.stringify(images).length / 1024);
      } else if (cat.isFonts) {
        sizes[cat.id] = Math.round(JSON.stringify(fonts).length / 1024);
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
    const { dump, images, fonts } = await fetchFullDump();
    const imagesExport = activeCats.has("images") ? images : {};
    const fontsExport = activeCats.has("fonts") ? fonts : {};
    const nowIso = new Date().toISOString();

    // Multi-system scope (Symphony format only; "active" = just this system).
    const systems = listSystems();
    if (systems.length > 1 && systemsScope !== "active") {
      const activeSystemId = getActiveSystemId();
      const perSystem = [];
      for (const s of systems) {
        // Active system's data is the in-memory dump we already fetched; other
        // systems are read (and decrypted, if unlocked) from their own blobs.
        const raw = s.id === activeSystemId ? dump : await getSystemData(s);
        if (!raw) continue;
        perSystem.push({ name: s.name, avatar: s.avatar || null, data: filterDump(raw, activeCats) });
      }
      if (systemsScope === "separate") {
        // Symphony multi-system container — each system restored as its own.
        return {
          __format: "symphony_backup",
          __version: 1,
          __multisystem: 1,
          __exported_at: nowIso,
          systems: perSystem,
          __local_images: imagesExport,
          __local_fonts: fontsExport,
          __local_settings: exportLocalSettings(),
        };
      }
      // "merged" — flatten every system into one, each becoming a group.
      return {
        __format: "symphony_backup",
        __version: 1,
        __exported_at: nowIso,
        data: mergeSystemsAsGroups(perSystem),
        __local_images: imagesExport,
        __local_fonts: fontsExport,
        __local_settings: exportLocalSettings(),
      };
    }

    // Single (active) system — unchanged behaviour.
    return {
      __format: "symphony_backup",
      __version: 1,
      __exported_at: nowIso,
      data: filterDump(dump, activeCats),
      __local_images: imagesExport,
      __local_fonts: fontsExport,
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

  // Applies an already-parsed { data, localImages?, localFonts?, localSettings? }
  // payload to the in-memory DB. Shared by the standard-backup, raw-plain, and
  // raw-encrypted (post-decryption) paths.
  const applyImportPayload = async ({ data, localImages, localFonts, localSettings }) => {
    // Replace-all only swaps the ACTIVE system. Any OTHER systems aren't in this
    // (single-system) backup — offer the same keep/clear choice as the
    // multi-system flow so "Replace all" doesn't silently leave them behind (or
    // wipe them). Done first, before touching anything, so cancelling is clean.
    let clearOtherSystemIds = null;
    if (importMode === "replace") {
      const others = listSystems().filter((s) => s.id !== getActiveSystemId());
      if (others.length > 0) {
        const decision = await promptKeepClearSystems(others);
        if (decision === null) { setImportLoading(false); return; } // cancelled
        const keepSet = new Set(decision);
        clearOtherSystemIds = others.filter((s) => !keepSet.has(s.id)).map((s) => s.id);
      }
    }
    if (localImages) {
      try { await restoreLocalImages(localImages); } catch (e) {
        console.warn("Failed to restore local images:", e);
      }
    }
    if (localFonts) {
      try { await restoreLocalFonts(localFonts); } catch (e) {
        console.warn("Failed to restore local fonts:", e);
      }
    }
    if (localSettings) {
      importLocalSettings(localSettings);
    }
    if (importMode === "replace") {
      // Remove the other systems the user chose to clear (all non-active, so
      // deleteSystem is safe). Kept ones are left untouched.
      if (clearOtherSystemIds) {
        for (const id of clearOtherSystemIds) {
          try { await deleteSystem(id); } catch (e) { console.warn("delete system failed", e); }
        }
      }
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

  // Show the keep/clear prompt for existing systems a Replace-all backup doesn't
  // include. Resolves to a Set of system ids to KEEP, or null if cancelled.
  const promptKeepClearSystems = (unmatched) => new Promise((resolve) => {
    replaceResolveRef.current = resolve;
    // Default every system to KEEP (checked) — safest start: a system is only
    // removed when the user deliberately unchecks it.
    setReplaceSystemsPrompt({ unmatched, keepIds: new Set(unmatched.map((s) => s.id)) });
  });

  // Full REPLACE of a multi-system backup: recreate the backup's systems fresh,
  // then delete every current system except the ones the user chose to keep.
  // Matching is by name (the format carries no ids), so a clean round-trip
  // (export all → replace-all import) ends with exactly the backup's systems and
  // no duplicates.
  const executeMultiSystemReplace = async (importedSystems, keepIds) => {
    const keepSet = new Set(keepIds || []);
    const activeId = getActiveSystemId();
    const deleteIds = listSystems().filter((s) => !keepSet.has(s.id)).map((s) => s.id);

    let created = 0;
    for (const s of importedSystems) {
      await createSystemWithData(s.name, s.data);
      created++;
    }
    // deleteSystem refuses the active system — if it's being removed, land on a
    // surviving (freshly-created or kept) system first.
    if (deleteIds.includes(activeId)) {
      const survivor = listSystems().find((s) => !deleteIds.includes(s.id));
      if (survivor) await setActiveSystem(survivor.id);
    }
    for (const id of deleteIds) {
      try { await deleteSystem(id); } catch (e) { console.warn("delete system failed", e); }
    }
    return created;
  };

  const toggleKeepSystem = (id) => setReplaceSystemsPrompt((p) => {
    if (!p) return p;
    const next = new Set(p.keepIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...p, keepIds: next };
  });
  const setAllKeepSystems = (keep) => setReplaceSystemsPrompt((p) =>
    p ? { ...p, keepIds: keep ? new Set(p.unmatched.map((s) => s.id)) : new Set() } : p);
  const resolveReplacePrompt = (keepIdsOrNull) => {
    const resolve = replaceResolveRef.current;
    replaceResolveRef.current = null;
    setReplaceSystemsPrompt(null);
    if (resolve) resolve(keepIdsOrNull);
  };

  const processImport = async (text) => {
    // Detect a multi-system Symphony backup up front so we can honour the
    // Replace-vs-Add choice (and surface its own errors) instead of silently
    // falling through to the single-dump parser.
    let maybe = null;
    try { maybe = JSON.parse(text); } catch { /* not JSON — normal parse below */ }
    if (maybe && maybe.__multisystem && Array.isArray(maybe.systems)) {
      try {
        const importedSystems = maybe.systems.filter((s) => s && s.data);
        if (!importedSystems.length) { showStatus("error", "No systems found in the archive."); return; }
        if (maybe.__local_images) { try { await restoreLocalImages(maybe.__local_images); } catch (e) { console.warn("restore images failed", e); } }
        if (maybe.__local_fonts) { try { await restoreLocalFonts(maybe.__local_fonts); } catch (e) { console.warn("restore fonts failed", e); } }
        if (maybe.__local_settings) { try { importLocalSettings(maybe.__local_settings); } catch (e) { console.warn("restore settings failed", e); } }

        if (importMode === "replace") {
          // Ask about existing systems the backup doesn't include before wiping.
          const unmatched = computeUnmatchedExistingSystems(importedSystems, listSystems());
          let keepIds = new Set();
          if (unmatched.length > 0) {
            const decision = await promptKeepClearSystems(unmatched);
            if (decision === null) { setImportLoading(false); return; } // cancelled
            keepIds = decision;
          }
          const created = await executeMultiSystemReplace(importedSystems, keepIds);
          showStatus("success", `Replaced with ${created} ${created === 1 ? terms.system : terms.systems}! The app will reload.`);
          setTimeout(() => window.location.reload(), 1200);
          return;
        }

        // Add New — additive; existing systems untouched.
        let created = 0;
        for (const s of importedSystems) { await createSystemWithData(s.name, s.data); created++; }
        showStatus("success", `Imported ${created} ${created === 1 ? terms.system : terms.systems}! The app will reload.`);
        setTimeout(() => window.location.reload(), 1200);
        return;
      } catch (e) {
        showStatus("error", e?.message || "Import failed");
        return;
      }
    }

    const parsed = parseImportText(text);
    if (parsed.format === FORMAT_STANDARD) {
      await applyImportPayload({
        data: parsed.data,
        localImages: parsed.localImages,
        localFonts: parsed.localFonts,
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

  // Read a picked file NATIVELY (Capacitor) so Android's content resolver
  // streams the real bytes. This is why it matters: a Google Drive file is a
  // cloud placeholder — a native content-resolver read (what Ampersand does)
  // makes Drive hydrate and stream the bytes, but a WebView `<input type=file>`
  // gets a 0-byte snapshot. So on native we pick via the FilePicker plugin and
  // hand a real, byte-filled File to the same importer.
  const handleNativeImportPick = async () => {
    try {
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      const res = await FilePicker.pickFiles({ readData: true });
      const picked = res?.files?.[0];
      if (!picked) return;
      let bytes = null;
      const b64ToBytes = (b64) => {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      if (picked.data) {
        bytes = b64ToBytes(picked.data);
      } else if (picked.path) {
        // Fallback: read the content URI via Filesystem if readData didn't inline it.
        const { Filesystem } = await import("@capacitor/filesystem");
        const r = await Filesystem.readFile({ path: picked.path });
        bytes = typeof r.data === "string" ? b64ToBytes(r.data) : new Uint8Array(await r.data.arrayBuffer());
      }
      if (!bytes) throw new Error("couldn't read the file's contents");
      const fileObj = new File([bytes], picked.name || "import", { type: picked.mimeType || "application/octet-stream" });
      await handleImportFromFile(fileObj);
    } catch (err) {
      const msg = err?.message || String(err);
      if (/cancel/i.test(msg)) return; // user dismissed the picker
      showStatus("error", `Import failed: ${msg}`);
    }
  };

  const handleImportFromFile = async (file) => {
    if (!file) return;
    const lname = (file.name || "").toLowerCase();
    setImportLoading(true);
    try {
      // Read the raw bytes ONCE, then decide the format. We detect binary
      // formats by MAGIC BYTES rather than the filename, because Android
      // content:// pickers (Google Drive especially) frequently hand the
      // WebView a file whose `.name` has lost its real extension — so
      // `name.endsWith(".ampar")` alone silently missed real archives and
      // they fell through to the JSON parser ("File is not valid JSON").
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const head = bytes.subarray(0, 10);
      const hasMagic = (sig) => sig.every((b, i) => head[i] === b);

      // Ampersand .ampar archive — binary msgpack behind an "AMPAR" magic.
      // Recreate each Ampersand system as its own Symphony system (additive —
      // existing systems untouched).
      const isAmpar = lname.endsWith(".ampar") || hasMagic([0x41, 0x4d, 0x50, 0x41, 0x52]); // "AMPAR"
      if (isAmpar) {
        const { parseAmpar, ampersandToSystemDumps } = await import("@/lib/ampersand");
        const sysDumps = ampersandToSystemDumps(parseAmpar(buf));
        let created = 0;
        for (const s of sysDumps) {
          if (!s || !s.data) continue;
          await createSystemWithData(s.name, s.data);
          created++;
        }
        if (created === 0) throw new Error("no systems found in the archive");
        showStatus("success", `Imported ${created} ${created === 1 ? terms.system : terms.systems} from Ampersand! The app will reload.`);
        setTimeout(() => window.location.reload(), 1400);
        return;
      }

      // OpenPlural .zip — binary (PK magic). Hand straight to the OpenPlural
      // importer via the connector dispatcher; it can't be read as text.
      const isZip = lname.endsWith(".zip") || hasMagic([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
      if (onExternalFile && isZip) {
        onExternalFile(file, "openplural");
        return;
      }

      // Text formats. Two-stage decode: try the compact (gzip) wrapper first to
      // get the inner JSON text, then hand off to parseImportText which accepts
      // standard backup, raw plain, or raw encrypted shapes.
      const trimmed = new TextDecoder("utf-8").decode(bytes).trim();
      let innerJsonText;
      if (trimmed.startsWith("SYMPHONYZ:")) {
        const binary = atob(trimmed.slice(10));
        const zbytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) zbytes[i] = binary.charCodeAt(i);
        innerJsonText = pako.inflate(zbytes, { to: "string" });
      } else {
        innerJsonText = trimmed;
      }
      // Probe for a non-Symphony external export and hand it off to the right
      // app's importer before running the Symphony parser. (The `finally`
      // already clears loading + the input.)
      if (onExternalFile) {
        let probe = null;
        try { probe = JSON.parse(innerJsonText); } catch {}
        const kind = externalKindFromJson(probe);
        if (kind) { onExternalFile(file, kind); return; }
        onExternalFile(null, null); // not external → clear any leftover dispatcher panel
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

  const inner = (
    <>
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

        {showStorageTools && (<>
        <div className="space-y-2 pb-3 border-b border-border/40">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cache URL Images Offline</p>
            <p className="text-xs text-muted-foreground">Download any images stored as external URLs (e.g. avatars pasted as links) into local storage so they display offline.</p>
            {cacheUrlResult && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${cacheUrlResult.type === "success" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-destructive/5 text-destructive"}`}>
                {cacheUrlResult.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {cacheUrlResult.message}
              </div>
            )}
            <Button variant="outline" onClick={handleCacheUrlImages} disabled={cachingUrls} className="w-full gap-2 justify-start h-auto py-2.5">
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
          <Button variant="outline" onClick={handleRecompressImages} disabled={recompressing} className="w-full gap-2 justify-start h-auto py-2.5">
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
        </>)}

        {showExport && (<>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export</p>

          {/* Multi-system scope — only when more than one system exists, and only
              for the Symphony format (which can carry multiple systems). */}
          {hasManySystems && isStdFormat && (
            <div className="rounded-xl border border-border/50 px-3 py-2.5 space-y-1.5">
              <label className="text-xs font-medium text-foreground block">{terms.Systems} to include</label>
              <select
                value={systemsScope}
                onChange={(e) => setSystemsScope(e.target.value)}
                className="w-full h-9 px-2 text-sm rounded-lg border border-border bg-background"
              >
                <option value="active">This {terms.system} only</option>
                <option value="separate">All {terms.systems} — kept separate</option>
                <option value="merged">All {terms.systems} — merged into one (grouped)</option>
              </select>
              <p className="text-[0.6875rem] text-muted-foreground">
                {systemsScope === "separate"
                  ? `Each ${terms.system} is restored as its own ${terms.system}.`
                  : systemsScope === "merged"
                  ? `All ${terms.systems} become one ${terms.system}, each turned into a group of its name — works with any format.`
                  : `Only your current ${terms.system} is exported.`}
              </p>
            </div>
          )}

          {/* Selective export collapsible — Symphony-native formats only. */}
          {isStdFormat && (
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
          )}

          {/* Export format toggle — standard Symphony formats plus any
              cross-app exporter chips (OpenPlural / Simply Plural). */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
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
            {exportExtras.map((ex) => (
              <button
                key={ex.key}
                type="button"
                onClick={() => setExportFormat(ex.key)}
                className={`px-3 py-1 rounded-lg border transition-colors ${exportFormat === ex.key ? "bg-primary/10 border-primary/40 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {isStdFormat && (
            <p className="text-xs text-muted-foreground -mt-1">
              {exportFormat === "json"
                ? "Human-readable JSON. Larger file, easy to inspect."
                : "Gzip + base64 envelope. Smaller file, opaque to the eye."}
            </p>
          )}

          {isStdFormat && (
            <Button variant="outline" onClick={handleExportFull} disabled={exportLoading} className="w-full gap-2 justify-start h-auto py-2.5">
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <div className="text-left min-w-0">
                <p className="font-medium">Save to device</p>
                <p className="text-xs text-muted-foreground font-normal">
                  {selectiveOpen && selectedCats.size < EXPORT_CATEGORIES.length
                    ? `${selectedCats.size} categories · ${isNative() ? "→ Downloads/Oceans Symphony" : (typeof window !== "undefined" && window.showSaveFilePicker) ? "you pick where to save" : "→ your Downloads folder"}`
                    : isNative()
                      ? "Saves to Downloads/Oceans Symphony (you'll see a confirmation)"
                      : (typeof window !== "undefined" && window.showSaveFilePicker)
                        ? "Pick where to save it — opens a Save-As dialog"
                        : "Downloads to your browser's default folder"}
                </p>
              </div>
            </Button>
          )}

          {isStdFormat && (
            <Button variant="outline" onClick={handleExportShare} disabled={exportLoading} className="w-full gap-2 justify-start h-auto py-2.5">
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <div className="text-left min-w-0">
                <p className="font-medium">Share or send elsewhere</p>
                <p className="text-xs text-muted-foreground font-normal">
                  Opens the share sheet — pick Drive, email, Send to PC, etc.
                </p>
              </div>
            </Button>
          )}

          {!isStdFormat && (
            <div className="pt-1">
              {exportExtras.find((e) => e.key === exportFormat)?.node}
            </div>
          )}
        </div>

        {/* Alternative: Copy/Paste Backup — workaround for in-app browsers
            (Facebook, Instagram, etc.) that silently block file downloads.
            Symphony-native formats only. */}
        {isStdFormat && (
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
        )}
        </>)}

        {showImport && (<>
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
          <input ref={fileInputRef} type="file" onChange={(e) => handleImportFromFile(e.target.files?.[0])} className="hidden" />
          <Button variant="outline" onClick={() => { if (isNative()) { handleNativeImportPick(); } else { fileInputRef.current?.click(); } }} disabled={importLoading} className="w-full gap-2 justify-start h-auto py-2.5">
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <div className="text-left min-w-0">
              <p className="font-medium">Import from File</p>
              <p className="text-xs text-muted-foreground font-normal whitespace-normal break-words">Symphony backup, Simply Plural, Octocon, PluralSpace (.json), OpenPlural (.zip) or Ampersand (.ampar) — auto-detected</p>
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
            className="w-full gap-2 justify-start h-auto py-2.5"
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
        </>)}
    </>
  );
  const modal = (
    <>
      <EncryptedImportPasswordModal
        open={!!pendingEncryptedImport}
        onClose={() => setPendingEncryptedImport(null)}
        onSubmit={handleDecryptAndImport}
        busy={importLoading}
      />
      {replaceSystemsPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-border/60">
              <h3 className="text-base font-semibold">
                {replaceSystemsPrompt.unmatched.length} {replaceSystemsPrompt.unmatched.length === 1 ? terms.System : terms.Systems} not in this backup
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                These {terms.systems} aren’t in the backup you’re importing with “Replace all”. Choose which to keep — unchecked ones are permanently removed.
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40">
              <button type="button" onClick={() => setAllKeepSystems(true)} className="text-xs px-2.5 py-1 rounded-lg border border-border/50 hover:bg-muted/40">Keep all</button>
              <button type="button" onClick={() => setAllKeepSystems(false)} className="text-xs px-2.5 py-1 rounded-lg border border-border/50 hover:bg-muted/40">Clear all</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {replaceSystemsPrompt.unmatched.map((s) => {
                const keep = replaceSystemsPrompt.keepIds.has(s.id);
                const showImg = s.avatar && /^(data:|https?:)/.test(s.avatar);
                return (
                  <label key={s.id} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer ${keep ? "bg-primary/5" : "bg-muted/20"}`}>
                    <input type="checkbox" checked={keep} onChange={() => toggleKeepSystem(s.id)} className="w-4 h-4 flex-shrink-0" />
                    <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-muted text-xs font-semibold flex-shrink-0">
                      {showImg ? <img src={s.avatar} alt="" className="w-full h-full object-cover" /> : (s.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 text-sm truncate">{s.name || "Unnamed"}</span>
                    <span className={`text-[0.625rem] font-medium uppercase tracking-wide ${keep ? "text-primary" : "text-destructive"}`}>{keep ? "Keep" : "Remove"}</span>
                  </label>
                );
              })}
            </div>
            <div className="p-3 border-t border-border/60 flex items-center justify-end gap-2">
              <button type="button" onClick={() => resolveReplacePrompt(null)} className="px-3 py-2 text-sm rounded-xl border border-border/50 hover:bg-muted/40">Cancel</button>
              <button type="button" onClick={() => resolveReplacePrompt(replaceSystemsPrompt.keepIds)} className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium">Continue import</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  if (section !== "all") {
    return <div className="space-y-3">{inner}{modal}</div>;
  }
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
      <CardContent className="space-y-3">{inner}</CardContent>
      {modal}
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
