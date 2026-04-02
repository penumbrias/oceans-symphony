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

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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
    setTimeout(() => setStatus(null), 5000);
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
          try { dump[name] = await base44.entities[name].list(); } catch {}
        }
        for (const name of ENTITY_NAMES) {
          if (Array.isArray(dump[name])) {
            dump[name] = Object.fromEntries(dump[name].map((r) => [r.id, r]));
          }
        }
      }
      const exportData = {
        __format: "symphony_backup",
        __version: 1,
        __exported_at: new Date().toISOString(),
        data: dump
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(exportData, `symphony-backup-${date}.json`);
      showStatus("success", "Full backup exported successfully.");
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

      if (parsed.__format === "symphony_backup" && parsed.data) {
        if (isLocalMode()) {
          await loadDbDump(parsed.data);
          showStatus("success", "Data restored! The app will reload.");
          setTimeout(() => window.location.reload(), 1200);
        } else {
          // Cloud mode — replace first if needed
          if (importMode === 'replace') {
            setImportProgress("Deleting existing data...");
            for (const entityName of ENTITY_NAMES) {
              try {
                const records = await base44.entities[entityName].list();
                await Promise.all(records.map(r =>
                  base44.entities[entityName].delete(r.id).catch(() => {})
                ));
              } catch {}
            }
          }

          // Import order matters — entities that others reference come first
          const IMPORT_ORDER = [
            "Alter", "Group", "ActivityCategory", "CustomField", "CustomEmotion",
            "SystemSettings", "DailyTaskTemplate",
            "FrontingSession", "Bulletin", "JournalEntry", "DiaryCard",
            "BulletinComment", "AlterNote", "AlterMessage", "MentionLog",
            "EmotionCheckIn", "SystemCheckIn", "Activity", "Sleep",
            "Task", "DailyProgress", "ActivityGoal", "Symptom"
          ];

          // Fields that contain IDs referencing other records
          const ID_REF_FIELDS = [
            "primary_alter_id", "alter_id", "author_alter_id",
            "mentioned_alter_id", "co_fronter_ids", "fronting_alter_ids",
            "author_alter_ids", "allowed_alter_ids", "member_ids",
          ];

          // Build old->new ID map as we create records
          const idMap = {};

          const remapIds = (data) => {
            const result = { ...data };
            for (const field of ID_REF_FIELDS) {
              if (!result[field]) continue;
              if (Array.isArray(result[field])) {
                result[field] = result[field].map(id => idMap[id] || id);
              } else {
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
            setImportProgress(`Importing ${entityName}...`);
            const records = Array.isArray(recordsMap) ? recordsMap : Object.values(recordsMap || {});

            const CHUNK_SIZE = 5;
            for (let i = 0; i < records.length; i += CHUNK_SIZE) {
              const chunk = records.slice(i, i + CHUNK_SIZE);
              await Promise.allSettled(
                chunk.map(async record => {
                  const { id, created_by_id, is_sample, ...rawData } = record;
                  const data = remapIds(rawData);
                  try {
                    const created = await base44.entities[entityName].create(data);
                    // Store old->new ID mapping
                    if (id && created?.id) idMap[id] = created.id;
                    count++;
                  } catch (err) {
                    console.warn(`Failed: ${entityName}`, err.message);
                    failed++;
                  }
                })
              );
              if (i + CHUNK_SIZE < records.length) {
                await new Promise(res => setTimeout(res, 200));
              }
            }
          }
        }
      } else {
        showStatus("error", "Unknown file format. Expected Symphony backup.");
      }
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
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${status.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-destructive/5 text-destructive'}`}>
            {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
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
              <p className="text-xs text-muted-foreground font-normal">All data as JSON — can be re-imported into Symphony</p>
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
              ? '⚠️ Replace All will delete existing data first, then import from backup.'
              : '⚠️ Add New imports records without replacing existing data.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}