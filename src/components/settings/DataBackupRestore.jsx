import React, { useState, useRef, useCallback } from "react";
import { useTerms } from "@/lib/useTerms";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Copy, Image as ImageIcon, ChevronDown, ChevronRight, Bug } from "lucide-react";
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
import { shareFile } from "@/lib/shareFile";
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

// CLAUDE.md NOTE: any new local entity must be added BOTH here (for the
// raw entity allow-list) AND to the matching EXPORT_CATEGORIES entry
// below. An entity that's only in ENTITY_NAMES will never be exported
// because the export iterator walks EXPORT_CATEGORIES.entities, not this
// list. Device-specific entities (FriendIdentity, PushSubscription) are
// intentionally NOT included — they tie a record to one browser/device
// and restoring them onto a different device causes collisions.
const ENTITY_NAMES = [
  "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
  "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
  "Symptom", "SymptomDefinition", "SymptomSession", "SymptomCheckIn",
  "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
  "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate",
  "AlterRelationship", "RelationshipType", "InnerWorldLocation", "GroundingTechnique", "GroundingPreference",
  "SupportJournalEntry", "LearningProgress", "ReportTemplate", "ReportExport",
  "DiaryTemplate", "Reminder", "ReminderInstance", "Poll", "TriggerType",
  "StatusNote", "Location", "SystemChangeEvent", "GroceryItem", "GroceryFavorite", "QuickAction",
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
  { id: "alters",        label: "Alters & Profiles",       entities: ["Alter", "CustomField", "AlterRelationship", "RelationshipType", "InnerWorldLocation"], desc: "Bios, avatars, custom fields, relationships, relationship types, inner world" },
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
  { id: "settings",      label: "Settings & Custom",        entities: ["SystemSettings", "CustomEmotion", "ActivityCategory", "TriggerType", "QuickAction"], desc: "App settings, custom emotions, trigger types, quick actions" },
  { id: "notes",         label: "Notes & Messages",         entities: ["AlterNote", "AlterMessage", "MentionLog"],                          desc: "Notes, DMs, mentions" },
  { id: "statuses",     label: "Custom Statuses",           entities: ["StatusNote"],                                                          desc: "Timeline status notes" },
  { id: "locations",    label: "Location History",          entities: ["Location"],                                                            desc: "Location log entries" },
  { id: "lineage",      label: "System Change Events",      entities: ["SystemChangeEvent"],                                                   desc: "Fusion, split, dormancy events" },
  { id: "groceries",    label: "Grocery List",              entities: ["GroceryItem", "GroceryFavorite"],                                      desc: "Grocery / privacy-cover list items and frequent-purchase favourites" },
  { id: "images",        label: "Local Images",             entities: [],                                                                    desc: "Uploaded images (local mode only)", isImages: true },
];

async function downloadJson(data, filename, format = "json") {
  // format:
  //   "json"    — plain JSON.stringify (easier to inspect/share)
  //   "compact" — gzip + base64 envelope ("SYMPHONYZ:") for smaller files
  const isCompact = format === "compact";
  const text = isCompact ? compressBackup(data) : JSON.stringify(data, null, 2);
  const mime = isCompact ? "application/octet-stream" : "application/json";
  const blob = new Blob([text], { type: mime });

  // Single delivery pipeline shared with the Auto-backup "Back up now"
  // button and the therapy-report "Save PDF" — see src/lib/shareFile.js.
  // Native (Capacitor) routes through Filesystem.Cache + @capacitor/share;
  // web/TWA keeps the existing navigator.share → anchor-download chain.
  // Returning the result so the caller can distinguish "failed" from
  // "shared" / "downloaded" / "cancelled".
  return shareFile({
    blob,
    filename,
    title: "Oceans Symphony Backup",
    dialogTitle: "Save backup file",
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
          if (dump[e] !== undefined) filteredDump[e] = dump[e];
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

  const handleExportFull = async () => {
    setExportLoading(true);
    try {
      const exportData = await buildExportData();
      const date = new Date().toISOString().slice(0, 10);
      const ext = exportFormat === "compact" ? "txt" : "json";
      const res = await downloadJson(exportData, `symphony-backup-${date}.${ext}`, exportFormat);
      if (res?.result === "failed") {
        showStatus("error", `Export failed${res.error ? `: ${res.error}` : ""}`);
      } else if (res?.result === "cancelled") {
        // User dismissed the share sheet — no toast, no surprise.
      } else {
        showStatus("success", res?.result === "shared" ? "Backup ready — pick a destination" : "Backup exported!");
      }
    } catch (e) {
      showStatus("error", `Export failed: ${e.message}`);
    } finally {
      setExportLoading(false);
    }
  };

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
      await loadDbDump(data);
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
              <p className="font-medium">Download Backup</p>
              <p className="text-xs text-muted-foreground font-normal">{selectiveOpen && selectedCats.size < EXPORT_CATEGORIES.length ? `${selectedCats.size} categories selected` : exportFormat === "compact" ? "All data, compressed (.txt)" : "All data, plain JSON"}</p>
            </div>
          </Button>
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
          <input ref={fileInputRef} type="file" accept=".json,.txt" onChange={handleImportFromFile} className="hidden" />
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
