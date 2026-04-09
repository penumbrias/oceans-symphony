import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Copy, ClipboardPaste } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { getFullDbDump, loadDbDump } from "@/lib/localDb";

const ENTITY_NAMES = [
  "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
  "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
  "Symptom", "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
  "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate",
];

async function downloadJson(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const file = new File([blob], filename, { type: "application/json" });

  // On Android/mobile, share API is the most reliable — try it first
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Symphony Backup" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
      // fall through to other methods
    }
  }

  // Desktop: try File System Access API
  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }

  // Non-mobile share fallback
  if (!isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Symphony Backup" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }

  // Last resort: anchor download (works on desktop, unreliable on Android WebView)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 5000);
  };

  const buildExportData = async () => {
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
    return {
      __format: "symphony_backup",
      __version: 1,
      __exported_at: new Date().toISOString(),
      data: dump,
    };
  };

  const handleExportFull = async () => {
    setExportLoading(true);
    try {
      const exportData = await buildExportData();
      const date = new Date().toISOString().slice(0, 10);
      await downloadJson(exportData, `symphony-backup-${date}.json`);
      showStatus("success", "Backup exported successfully!");
    } catch (e) {
      showStatus("error", `Export failed: ${e.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    setCopyLoading(true);
    try {
      const exportData = await buildExportData();
      const json = JSON.stringify(exportData);
      await navigator.clipboard.writeText(json);
      showStatus("success", "Backup copied to clipboard! Paste it somewhere safe — notes app, email, etc.   Copied data must not be reformatted or changed in any way in order to import.");
    } catch (e) {
      showStatus("error", `Copy failed: ${e.message}`);
    } finally {
      setCopyLoading(false);
    }
  };

  const handleImportFromText = async () => {
    if (!pasteText.trim()) return;
    setImportLoading(true);
    try {
      const parsed = JSON.parse(pasteText.trim());
      await processImport(parsed);
      setShowPasteInput(false);
      setPasteText("");
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

  const handleImportFromFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
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
            <CardDescription>Export your data or import from a backup. Copy/paste exists as an alternative if download fails. Copied data must not be reformatted or changed <strong>in any way</strong> in order to import.</CardDescription>
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

        {/* Export */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export</p>

          <Button
            variant="outline"
            onClick={handleExportFull}
            disabled={exportLoading}
            className="w-full gap-2 justify-start"
          >
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Download Backup</p>
              <p className="text-xs text-muted-foreground font-normal">Save as JSON file</p>
            </div>
          </Button>

          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            disabled={copyLoading}
            className="w-full gap-2 justify-start"
          >
            {copyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Copy Backup to Clipboard</p>
              <p className="text-xs text-muted-foreground font-normal">Paste into notes, email, etc.</p>
            </div>
          </Button>
        </div>

        {/* Import */}
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

          {/* File import */}
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFromFile} className="hidden" />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="w-full gap-2 justify-start"
          >
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Import from File</p>
              <p className="text-xs text-muted-foreground font-normal">Symphony backup JSON</p>
            </div>
          </Button>

          {/* Paste import */}
          {!showPasteInput ? (
            <Button
              variant="outline"
              onClick={() => setShowPasteInput(true)}
              className="w-full gap-2 justify-start"
            >
              <ClipboardPaste className="w-4 h-4" />
              <div className="text-left">
                <p className="font-medium">Paste Backup from Clipboard</p>
                <p className="text-xs text-muted-foreground font-normal">Paste copied backup text</p>
              </div>
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-border/50 p-3">
              <p className="text-sm font-medium">Paste your backup JSON here</p>
              <textarea
                className="w-full h-32 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Paste your copied backup here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowPasteInput(false); setPasteText(""); }} className="flex-1">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleImportFromText}
                  disabled={importLoading || !pasteText.trim()}
                  className="flex-1"
                >
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {importLoading ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
          )}

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