import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { getFullDbDump, loadDbDump } from "@/lib/localDb";

const ENTITY_NAMES = [
  "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
  "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
  "Symptom", "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
  "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate"
];

const IMPORT_ORDER = [
  "Alter", "Group", "ActivityCategory", "CustomField", "CustomEmotion",
  "SystemSettings", "DailyTaskTemplate",
  "FrontingSession", "Bulletin", "JournalEntry", "DiaryCard",
  "BulletinComment", "AlterNote", "AlterMessage", "MentionLog",
  "EmotionCheckIn", "SystemCheckIn", "Activity", "Sleep",
  "Task", "DailyProgress", "ActivityGoal", "Symptom"
];

const ID_REF_FIELDS = [
  "primary_alter_id", "alter_id", "author_alter_id", "mentioned_alter_id",
  "co_fronter_ids", "fronting_alter_ids", "author_alter_ids",
  "allowed_alter_ids", "member_ids", "bulletin_id", "parent_comment_id",
  "parent_task_id", "read_by_alter_ids", "mentioned_alter_ids",
  "dismissed_by_alter_ids",
];

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function fetchAllRecords(entityName) {
  // Try with high limit first — base44 list(orderBy, limit)
  try {
    const records = await base44.entities[entityName].list(null, 2000);
    if (records && records.length > 0) return records;
  } catch {}
  // Fallback to default
  try {
    return await base44.entities[entityName].list() || [];
  } catch {
    return [];
  }
}

async function deleteAllRecords(entityName) {
  let safety = 0;
  while (safety < 20) {
    const records = await base44.entities[entityName].list(null, 500).catch(() => []);
    if (!records || records.length === 0) break;
    // Sequential deletes with delay — parallel causes 429s
    for (const r of records) {
      await base44.entities[entityName].delete(r.id).catch(() => {});
      await new Promise(res => setTimeout(res, 120)); // ~8 requests/sec
    }
    safety++;
    await new Promise(res => setTimeout(res, 500));
  }
}

export default function DataBackupRestore() {
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [importMode, setImportMode] = useState('add');
  const [importProgress, setImportProgress] = useState(null);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 6000);
  };

  const handleExportFull = async () => {
    setExportLoading(true);
    try {
      let dump;
      if (isLocalMode()) {
        dump = getFullDbDump();
      } else {
        dump = {};
        for (const name of ENTITY_NAMES) {
          const records = await fetchAllRecords(name);
          dump[name] = Object.fromEntries(records.map(r => [r.id, r]));
        }
      }
      const exportData = {
        __format: "symphony_backup",
        __version: 2,
        __exported_at: new Date().toISOString(),
        data: dump
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(exportData, `symphony-backup-${date}.json`);
      const totalRecords = Object.values(dump).reduce((sum, v) => sum + Object.keys(v).length, 0);
      showStatus("success", `Exported ${totalRecords} records successfully.`);
    } catch (e) {
      showStatus("error", `Export failed: ${e.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportProgress("Reading file...");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.__format !== "symphony_backup" || !parsed.data) {
        showStatus("error", "Unknown file format. Expected Symphony backup.");
        return;
      }

      if (isLocalMode()) {
        await loadDbDump(parsed.data);
        showStatus("success", "Data restored! The app will reload.");
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      // Cloud mode
      if (importMode === 'replace') {
        for (const entityName of ENTITY_NAMES) {
          setImportProgress(`Deleting ${entityName}...`);
          await deleteAllRecords(entityName);
        }
      }

      // Build old->new ID map — process ALL records sequentially so map is complete
      const idMap = {};

      const remapIds = (data) => {
        const result = { ...data };
        for (const field of ID_REF_FIELDS) {
          if (result[field] == null) continue;
          if (Array.isArray(result[field])) {
            result[field] = result[field].map(id => idMap[id] || id).filter(Boolean);
          } else if (typeof result[field] === 'string') {
            result[field] = idMap[result[field]] || result[field];
          }
        }
        return result;
      };

      let count = 0;
      let failed = 0;

      for (const entityName of IMPORT_ORDER) {
        const recordsMap = parsed.data[entityName];
        if (!recordsMap) continue;
        const records = Array.isArray(recordsMap)
          ? recordsMap
          : Object.values(recordsMap);
        if (records.length === 0) continue;

        setImportProgress(`Importing ${entityName} (${records.length} records)...`);

        // SEQUENTIAL — not parallel, so idMap is always up to date
        for (const record of records) {
          const { id, created_by_id, is_sample, updated_date, created_date, ...rawData } = record;
          const data = remapIds(rawData);
          try {
            const created = await base44.entities[entityName].create(data);
            if (id && created?.id) idMap[id] = created.id;
            count++;
          } catch (err) {
            console.warn(`Failed ${entityName}:`, err.message, data);
            failed++;
          }
          // Small delay every 10 records to avoid rate limits
          // Rate limit: delay after every record
          await new Promise(res => setTimeout(res, 120));
        }
      }

      setImportProgress(null);
      showStatus("success", `Imported ${count} records${failed > 0 ? ` — ${failed} failed (check console)` : ""}.`);

    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setImportLoading(false);
      setImportProgress(null);
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
            <CardDescription>Export your data or import from a backup</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            status.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
              : 'bg-destructive/5 text-destructive'
          }`}>
            {status.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {status.message}
          </div>
        )}

        {importProgress && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-primary/5 text-primary border border-primary/20">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            {importProgress}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export</p>
          <Button variant="outline" onClick={handleExportFull} disabled={exportLoading} className="w-full gap-2 justify-start">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Full Symphony Backup</p>
              <p className="text-xs text-muted-foreground font-normal">All data as JSON — re-importable into any Symphony account</p>
            </div>
          </Button>
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Import</p>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input type="radio" name="importMode" value="add" checked={importMode === 'add'}
                onChange={(e) => setImportMode(e.target.value)} className="w-4 h-4" />
              <span className="text-xs font-medium">Add New</span>
            </label>
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input type="radio" name="importMode" value="replace" checked={importMode === 'replace'}
                onChange={(e) => setImportMode(e.target.value)} className="w-4 h-4" />
              <span className="text-xs font-medium">Replace All</span>
            </label>
          </div>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full gap-2 justify-start">
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Import from File</p>
              <p className="text-xs text-muted-foreground font-normal">Symphony backup JSON</p>
            </div>
          </Button>
          <p className="text-xs text-muted-foreground">
            {importMode === 'replace'
              ? '⚠️ Replace All deletes existing data first, then imports. Will take a few minutes.'
              : '⚠️ Add New imports records without touching existing data.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}