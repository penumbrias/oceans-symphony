import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Copy, ClipboardPaste, Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { getFullDbDump, loadDbDump, migrateBase64AvatarsToLocal } from "@/lib/localDb";
import { getAllLocalImages, restoreLocalImages } from "@/lib/localImageStorage";
import pako from "pako";

function compressBackup(data) {
  const json = JSON.stringify(data);
  const compressed = pako.deflate(json);
  let binary = "";
  compressed.forEach(b => binary += String.fromCharCode(b));
  return "SYMPHONYZ:" + btoa(binary);
}

function decompressBackup(str) {
  if (!str.startsWith("SYMPHONYZ:")) return JSON.parse(str);
  const binary = atob(str.slice(10));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = pako.inflate(bytes, { to: "string" });
  return JSON.parse(json);
}

const ENTITY_NAMES = [
  "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
  "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
  "Symptom", "SymptomSession", "SymptomCheckIn", "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
  "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate",
  "AlterRelationship", "InnerWorldLocation", "GroundingTechnique", "GroundingPreference",
  "SupportJournalEntry", "LearningProgress", "ReportTemplate", "ReportExport",
  "DiaryTemplate", "Reminder", "ReminderInstance", "Poll",
];

const EXPORT_CATEGORIES = [
  { id: "alters",        label: "Alters & Profiles",       entities: ["Alter", "CustomField", "AlterRelationship", "InnerWorldLocation"], desc: "Bios, avatars, custom fields, relationships, inner world" },
  { id: "fronting",      label: "Fronting History",         entities: ["FrontingSession"],                                                  desc: "Switch history" },
  { id: "journals",      label: "Journals",                 entities: ["JournalEntry", "SupportJournalEntry"],                              desc: "Journal entries" },
  { id: "checkins",      label: "Check-ins & Emotions",     entities: ["EmotionCheckIn", "SystemCheckIn"],                                  desc: "Emotion & system check-ins" },
  { id: "bulletin",      label: "Bulletin Board",           entities: ["Bulletin", "BulletinComment", "Poll"],                              desc: "Posts, comments, polls" },
  { id: "tracking",      label: "Daily Tracking",           entities: ["DiaryCard", "DailyProgress", "ActivityGoal", "DailyTaskTemplate", "DiaryTemplate"], desc: "Diary cards, goals, templates" },
  { id: "activities",    label: "Activities & Sleep",       entities: ["Activity", "Sleep"],                                                 desc: "Activity logs and sleep records" },
  { id: "tasks",         label: "Tasks",                    entities: ["Task"],                                                              desc: "To-do list" },
  { id: "symptoms",      label: "Symptoms & Tracking",      entities: ["Symptom", "SymptomSession", "SymptomCheckIn"],                      desc: "Symptom definitions and check-in history" },
  { id: "groups",        label: "Groups",                   entities: ["Group"],                                                             desc: "Alter groups" },
  { id: "grounding",     label: "Grounding & Safety",       entities: ["GroundingTechnique", "GroundingPreference"],                        desc: "Grounding techniques and preferences" },
  { id: "reminders",     label: "Reminders",                entities: ["Reminder", "ReminderInstance"],                                     desc: "Reminders and scheduled instances" },
  { id: "reports",       label: "Therapy Reports",          entities: ["ReportTemplate", "ReportExport"],                                   desc: "Report templates and exports" },
  { id: "learning",      label: "Learning Progress",        entities: ["LearningProgress"],                                                 desc: "Learning module progress" },
  { id: "settings",      label: "Settings & Custom",        entities: ["SystemSettings", "CustomEmotion", "ActivityCategory"],              desc: "App settings, custom emotions" },
  { id: "notes",         label: "Notes & Messages",         entities: ["AlterNote", "AlterMessage", "MentionLog"],                          desc: "Notes, DMs, mentions" },
  { id: "images",        label: "Local Images",             entities: [],                                                                    desc: "Uploaded images (local mode only)", isImages: true },
];

// Outside component — no state needed here
async function downloadJson(data, filename) {
  const compressed = compressBackup(data);
  const blob = new Blob([compressed], { type: "application/octet-stream" });

  // Try Web Share API (works on Android APK)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/octet-stream" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Oceans Symphony Backup" });
        return; // Share succeeded
      } catch (e) {
        // Share was cancelled or failed — fall through to clipboard
        if (e.name === "AbortError") {
          // User cancelled — try clipboard instead
          try {
            await navigator.clipboard.writeText(data);
            throw new Error("__clipboard_success__");
          } catch (clipErr) {
            if (clipErr.message === "__clipboard_success__") throw clipErr;
            throw new Error("__clipboard_fallback__");
          }
        }
        // Other share errors — fall through to desktop fallback
      }
    }
  }

  // Desktop fallback: anchor click
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DataBackupRestore() {
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [importMode, setImportMode] = useState("add");
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showManualCopy, setShowManualCopy] = useState(null); // holds single string or parts array
  const [copiedChunks, setCopiedChunks] = useState(new Set()); // tracks which parts have been copied
  const [multiPartChunks, setMultiPartChunks] = useState([]); // for multi-part import
  const [showMultiPartImport, setShowMultiPartImport] = useState(false);
  const [migratingAvatars, setMigratingAvatars] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 5000);
  };

  const [sizeWarning, setSizeWarning] = useState(null);
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [selectedCats, setSelectedCats] = useState(() => new Set(EXPORT_CATEGORIES.map(c => c.id)));
  const [catSizes, setCatSizes] = useState(null); // { catId: sizeKB } — lazy loaded

  // Fetch and cache the full dump + images once
  const fullDumpRef = useRef(null);
  const fullImagesRef = useRef(null);

  const fetchFullDump = useCallback(async () => {
    if (fullDumpRef.current) return { dump: fullDumpRef.current, images: fullImagesRef.current };
    let dump;
    if (isLocalMode()) {
      dump = getFullDbDump();
    } else {
      dump = {};
      for (const name of ENTITY_NAMES) {
        try { dump[name] = await base44.entities[name].list(); } catch {}
      }
      for (const name of ENTITY_NAMES) {
        if (Array.isArray(dump[name])) {
          dump[name] = Object.fromEntries(dump[name].map((r) => [r.id, r]));
        }
      }
    }
    let images = {};
    if (isLocalMode()) {
      try { images = await getAllLocalImages(); } catch {}
    }
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
      if (!v) computeCatSizes(); // lazy compute on first open
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

    // Build filtered dump
    const filteredDump = {};
    for (const cat of EXPORT_CATEGORIES) {
      if (!cat.isImages && activeCats.has(cat.id)) {
        for (const e of cat.entities) {
          if (dump[e] !== undefined) filteredDump[e] = dump[e];
        }
      }
    }

    const imagesExport = activeCats.has("images") ? images : {};

    const exportData = {
      __format: "symphony_backup",
      __version: 1,
      __exported_at: new Date().toISOString(),
      data: filteredDump,
      __local_images: imagesExport,
    };

    // Size warning — check before compression
    const rawSize = JSON.stringify(exportData).length;
    if (rawSize > 500 * 1024) {
      setSizeWarning(`Your backup is large (${(rawSize / 1024).toFixed(0)}KB). Run "Migrate All Images" first to reduce size.`);
    } else {
      setSizeWarning(null);
    }

    return exportData;
  };

  // Inside component — needs setExportLoading, buildExportData, showStatus
const handleExportFull = async () => {
  setExportLoading(true);
  try {
    const exportData = await buildExportData();
    const date = new Date().toISOString().slice(0, 10);
    await downloadJson(exportData, `symphony-backup-${date}.sympbak`);
    showStatus("success", "Backup exported!");
  } catch (e) {
    if (e.message === "__clipboard_fallback__") {
      showStatus("success", "Share dialog unavailable — backup copied to clipboard. Paste it into Google Drive or a notes app, then share/export as .txt to reimport.");
    } else if (e.message === "__clipboard_success__") {
      showStatus("success", "Backup copied to clipboard (share was cancelled). Paste it into Google Drive or a notes app, then share/export as .txt to reimport.");
    } else {
      showStatus("error", `Export failed: ${e.message}`);
    }
  } finally {
    setExportLoading(false);
  }
};

  const splitBackupIntoParts = (backup, chunkSize = 50000) => {
    if (backup.length <= chunkSize) {
      return { isSinglePart: true, parts: [backup] };
    }
    const parts = [];
    for (let i = 0; i < backup.length; i += chunkSize) {
      parts.push(backup.slice(i, i + chunkSize));
    }
    const prefixedParts = parts.map((part, idx) => `PART:${idx + 1}:${parts.length}:${part}`);
    return { isSinglePart: false, parts: prefixedParts };
  };

  const handleCopyToClipboard = async () => {
    setCopyLoading(true);
    try {
      const exportData = await buildExportData();
      const compressed = compressBackup(exportData);

      let copied = false;

      // Try modern clipboard API
      try {
        await navigator.clipboard.writeText(compressed);
        copied = true;
      } catch {}

      // Try execCommand fallback
      if (!copied) {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = compressed;
          textarea.style.position = "fixed";
          textarea.style.top = "0";
          textarea.style.left = "0";
          textarea.style.opacity = "0.01";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(textarea);
          if (ok) copied = true;
        } catch {}
      }

      if (copied) {
        showStatus("success", "Backup copied to clipboard! Paste it somewhere safe — notes app, email, etc.");
      } else {
        // Both methods failed — split into parts if needed
        const { isSinglePart, parts } = splitBackupIntoParts(compressed);
        setShowManualCopy(parts);
        setCopiedChunks(new Set());
      }
    } catch (e) {
      showStatus("error", `Export failed: ${e.message}`);
    } finally {
      setCopyLoading(false);
    }
  };

  const handleCopyPartToClipboard = async (part, idx) => {
    try {
      await navigator.clipboard.writeText(part);
      setCopiedChunks(prev => new Set([...prev, idx]));
      showStatus("success", `Part ${idx + 1} copied ✅`);
    } catch {
      showStatus("error", "Failed to copy part — use manual select & copy");
    }
  };

  const handleImportFromText = async () => {
    if (!pasteText.trim()) return;
    setImportLoading(true);
    try {
      const trimmed = pasteText.trim();
      // Check if multi-part
      if (trimmed.startsWith("PART:")) {
        showStatus("error", "This is a multi-part backup. Use Multi-part paste mode instead.");
        setImportLoading(false);
        return;
      }
      const parsed = decompressBackup(trimmed);
      await processImport(parsed);
      setShowPasteInput(false);
      setPasteText("");
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleMultiPartPasteAdd = async () => {
    if (!pasteText.trim()) return;
    try {
      const trimmed = pasteText.trim();
      if (!trimmed.startsWith("PART:")) {
        showStatus("error", "This doesn't look like a multi-part backup (missing PART: prefix)");
        return;
      }
      // Parse PART:X:Y:data
      const match = trimmed.match(/^PART:(\d+):(\d+):/);
      if (!match) {
        showStatus("error", "Invalid part format");
        return;
      }
      const [, partNum, totalParts] = match;
      const data = trimmed.slice(match[0].length);
      setMultiPartChunks(prev => {
        const updated = [...prev];
        updated[parseInt(partNum) - 1] = data;
        return updated;
      });
      showStatus("success", `Part ${partNum}/${totalParts} added`);
      setPasteText("");
    } catch (e) {
      showStatus("error", `Failed to add part: ${e.message}`);
    }
  };

  const handleMultiPartImport = async () => {
    if (!multiPartChunks.length || multiPartChunks.some(c => !c)) return;
    setImportLoading(true);
    try {
      const reassembled = multiPartChunks.join("");
      const parsed = decompressBackup(reassembled);
      await processImport(parsed);
      setShowMultiPartImport(false);
      setMultiPartChunks([]);
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const processImport = async (parsed) => {
    if (parsed.__format !== "symphony_backup" || !parsed.data) {
      throw new Error("Unknown format. Expected Symphony backup.");
    }

    if (isLocalMode()) {
      // Restore local images before loading DB dump
      if (parsed.__local_images) {
        try {
          await restoreLocalImages(parsed.__local_images);
        } catch (e) {
          console.warn("Failed to restore local images:", e);
        }
      }
      await loadDbDump(parsed.data);
      showStatus("success", "Data restored! The app will reload.");
      setTimeout(() => window.location.reload(), 1200);
    } else {
      if (importMode === "replace") {
        for (const entityName of ENTITY_NAMES) {
          try {
            let hasMore = true;
            while (hasMore) {
              const records = await base44.entities[entityName].list();
              if (records.length === 0) {
                hasMore = false;
              } else {
                for (const record of records) {
                  await base44.entities[entityName].delete(record.id);
                }
              }
            }
          } catch {}
        }
      }

      let count = 0;
      for (const [entityName, recordsMap] of Object.entries(parsed.data)) {
        if (!ENTITY_NAMES.includes(entityName)) continue;
        const records = Array.isArray(recordsMap) ? recordsMap : Object.values(recordsMap || {});
        for (const record of records) {
          const { id, ...data } = record;
          try { await base44.entities[entityName].create(data); count++; } catch {}
        }
      }
      showStatus("success", `${importMode === "replace" ? "Replaced" : "Imported"} ${count} records.`);
    }
  };

  const handleMigrateAvatars = async () => {
    setMigratingAvatars(true);
    setMigrateResult(null);
    try {
      if (isLocalMode()) {
        const count = await migrateBase64AvatarsToLocal();
        setMigrateResult({ type: "success", message: `Done! Migrated ${count} avatar(s) to local storage.` });
      } else {
        // Cloud mode: scan all entities/fields for base64 data URLs and upload them
        let migrated = 0;
        for (const entityName of ENTITY_NAMES) {
          let records = [];
          try { records = await base44.entities[entityName].list(); } catch { continue; }
          for (const record of records) {
            const updates = {};
            for (const [field, value] of Object.entries(record)) {
              if (typeof value === "string" && value.startsWith("data:")) {
                try {
                  const res = await fetch(value);
                  const blob = await res.blob();
                  const file = new File([blob], `${entityName}-${record.id}-${field}.jpg`, { type: blob.type || "image/jpeg" });
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  updates[field] = file_url;
                  migrated++;
                } catch {}
              }
            }
            if (Object.keys(updates).length > 0) {
              await base44.entities[entityName].update(record.id, updates);
            }
          }
        }
        setMigrateResult({ type: "success", message: `Done! Migrated ${migrated} image(s) to hosted URLs.` });
      }
    } catch (e) {
      setMigrateResult({ type: "error", message: `Migration failed: ${e.message}` });
    } finally {
      setMigratingAvatars(false);
    }
  };

  const handleImportFromFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const parsed = decompressBackup(text.trim());
      await processImport(parsed);
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
            <CardDescription>Export your data or import from a backup. Copy/paste exists as an alternative if download fails. Copied data must not be reformatted or changed <strong>in any way</strong> in order to paste. <p>I suggest pasting copied backup data into google Drive or similar, then share/export as a .txt to reimport the backup data</p></CardDescription>
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

        {sizeWarning && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300/50">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {sizeWarning}
          </div>
        )}

        <div className="space-y-2 pb-3 border-b border-border/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avatar Migration</p>
          <p className="text-xs text-muted-foreground">If avatars were uploaded on Android, they may be stored as large base64 strings that bloat backups. Run this once to migrate them to proper URLs.</p>
          {migrateResult && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${migrateResult.type === "success" ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : "bg-destructive/5 text-destructive"}`}>
              {migrateResult.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {migrateResult.message}
            </div>
          )}
          <Button variant="outline" onClick={handleMigrateAvatars} disabled={migratingAvatars} className="w-full gap-2 justify-start">
            {migratingAvatars ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Migrate All Images</p>
              <p className="text-xs text-muted-foreground font-normal">Convert any base64 images to hosted URLs</p>
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
                          <span className="text-xs font-medium">{cat.label}</span>
                          {cat.isImages && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠️</span>}
                          {catSizes && <span className="text-xs text-muted-foreground ml-auto">{catSizes[cat.id] || 0}KB</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{cat.isImages ? "Excluding this means images won't transfer" : cat.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={handleExportFull} disabled={exportLoading} className="w-full gap-2 justify-start">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Download Backup</p>
              <p className="text-xs text-muted-foreground font-normal">{selectiveOpen && selectedCats.size < EXPORT_CATEGORIES.length ? `${selectedCats.size} categories selected` : "All data, compressed"}</p>
            </div>
          </Button>
          <div className="flex gap-2">
           <Button variant="outline" onClick={handleCopyToClipboard} disabled={copyLoading} className="flex-1 gap-2 justify-start">
             {copyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
             <div className="text-left">
               <p className="font-medium">Copy to Clipboard</p>
               <p className="text-xs text-muted-foreground font-normal">Copy backup</p>
             </div>
           </Button>
           <Button 
             variant="outline" 
             onClick={async () => {
  try {
    const exportData = await buildExportData();
    const compressed = compressBackup(exportData);
    const { parts } = splitBackupIntoParts(compressed);
    setShowManualCopy(parts);
    setCopiedChunks(new Set());
  } catch (e) {
    showStatus("error", `Export failed: ${e.message}`);
  }
}}
             className="flex-1 gap-2 justify-start"
           >
             <FileJson className="w-4 h-4" />
             <div className="text-left">
               <p className="font-medium">View as Text</p>
               <p className="text-xs text-muted-foreground font-normal">Manual copy</p>
             </div>
           </Button>
          </div>
          {Array.isArray(showManualCopy) && showManualCopy.length > 1 ? (
            <div className="rounded-xl border border-amber-400/50 bg-amber-50/10 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">⚠️ Backup is large — split into {showManualCopy.length} parts</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Copy each part in order, paste into a notes app before moving to the next part</p>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {showManualCopy.map((part, idx) => {
                  const isCopied = copiedChunks.has(idx);
                  return (
                    <div key={idx} className="rounded-lg border border-border/50 bg-card p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Part {idx + 1} of {showManualCopy.length}</p>
                        {isCopied && <span className="text-xs font-semibold text-green-600 dark:text-green-400">✅ Copied</span>}
                      </div>
                      <textarea
                        readOnly
                        value={part}
                        className="w-full h-20 px-2 py-1.5 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                        onFocus={e => e.target.select()}
                      />
                      <Button size="sm" onClick={() => handleCopyPartToClipboard(part, idx)} className="w-full text-xs">
                        {isCopied ? "✅ Copied" : `Copy Part ${idx + 1}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
              {copiedChunks.size === showManualCopy.length && (
                <div className="flex items-center gap-2 rounded-lg bg-green-100/50 dark:bg-green-900/30 px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">All parts copied ✅</p>
                </div>
              )}
              <Button size="sm" variant="outline" className="w-full" onClick={() => { setShowManualCopy(null); setCopiedChunks(new Set()); }}>
                Done
              </Button>
            </div>
          ) : showManualCopy && typeof showManualCopy === "string" ? (
            <div className="rounded-xl border border-amber-400/50 bg-amber-50/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">⚠️ Clipboard unavailable — select all text below and copy manually (long-press → Select All → Copy)</p>
              <textarea
                readOnly
                value={showManualCopy}
                className="w-full h-32 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                onFocus={e => e.target.select()}
              />
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowManualCopy(null)}>
                Done
              </Button>
            </div>
          ) : null}
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
          <input ref={fileInputRef} type="file" accept=".json,.txt,.sympbak" onChange={handleImportFromFile} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full gap-2 justify-start">
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Import from File</p>
              <p className="text-xs text-muted-foreground font-normal">Symphony backup .sympbak, .JSON or .txt file</p>
            </div>
          </Button>
          {!showPasteInput && !showMultiPartImport ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPasteInput(true)} className="flex-1 gap-2 justify-start">
                <ClipboardPaste className="w-4 h-4" />
                <div className="text-left">
                  <p className="font-medium text-xs">Single-part</p>
                  <p className="text-xs text-muted-foreground font-normal">Paste backup</p>
                </div>
              </Button>
              <Button variant="outline" onClick={() => setShowMultiPartImport(true)} className="flex-1 gap-2 justify-start">
                <ClipboardPaste className="w-4 h-4" />
                <div className="text-left">
                  <p className="font-medium text-xs">Multi-part</p>
                  <p className="text-xs text-muted-foreground font-normal">Paste chunks</p>
                </div>
              </Button>
            </div>
          ) : showPasteInput ? (
            <div className="space-y-2 rounded-xl border border-border/50 p-3">
               <p className="text-sm font-medium">Paste your backup here</p>
               <textarea
                className="w-full h-32 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Paste your copied backup here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowPasteInput(false); setPasteText(""); }} className="flex-1">Cancel</Button>
                <Button size="sm" onClick={handleImportFromText} disabled={importLoading || !pasteText.trim()} className="flex-1">
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {importLoading ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
          ) : showMultiPartImport ? (
            <div className="space-y-2 rounded-xl border border-border/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Multi-part Import</p>
                <p className="text-xs text-muted-foreground">{multiPartChunks.filter(Boolean).length} part(s) added</p>
              </div>
              <p className="text-xs text-muted-foreground">Paste each part in order. Import starts when all parts are present.</p>
              <textarea
                className="w-full h-24 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Paste part here (PART:X:Y:...)..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button size="sm" onClick={handleMultiPartPasteAdd} disabled={!pasteText.trim()} className="w-full">
                Add Part
              </Button>
              {multiPartChunks.some(Boolean) && (
                <div className="space-y-1.5 rounded-lg bg-muted/30 p-2">
                  <p className="text-xs font-semibold text-muted-foreground">Parts collected:</p>
                  <div className="flex flex-wrap gap-1">
                    {multiPartChunks.map((chunk, idx) => (
                      <span key={idx} className={`px-2 py-1 rounded text-xs font-medium ${chunk ? "bg-green-100/50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                        Part {idx + 1}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowMultiPartImport(false); setMultiPartChunks([]); setPasteText(""); }} className="flex-1">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleMultiPartImport} disabled={!multiPartChunks.every(Boolean) || importLoading} className="flex-1">
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {importLoading ? "Importing..." : "Import All"}
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {importMode === "replace"
              ? "⚠️ Replace All will delete existing data and import from backup."
              : "⚠️ Add New imports records — it does not replace existing data."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}