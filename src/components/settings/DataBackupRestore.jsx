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
  "MentionLog", "ActivityGoal", "Group", "DailyTaskTemplate",
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
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 4000);
  };

  // Full Symphony JSON export (all entities)
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
        // Convert array to map (same shape as localDb)
        for (const name of ENTITY_NAMES) {
          if (Array.isArray(dump[name])) {
            dump[name] = Object.fromEntries(dump[name].map(r => [r.id, r]));
          }
        }
      }
      const exportData = {
        __format: "symphony_backup",
        __version: 1,
        __exported_at: new Date().toISOString(),
        data: dump,
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



  // Import from JSON file
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Handle full Symphony backup
      if (parsed.__format === "symphony_backup" && parsed.data) {
        if (isLocalMode()) {
          await loadDbDump(parsed.data);
          showStatus("success", "Data restored! The app will reload.");
          setTimeout(() => window.location.reload(), 1200);
        } else {
          // Cloud mode: create records for each entity
          let count = 0;
          for (const [entityName, recordsMap] of Object.entries(parsed.data)) {
            if (!ENTITY_NAMES.includes(entityName)) continue;
            const records = Array.isArray(recordsMap) ? recordsMap : Object.values(recordsMap || {});
            for (const record of records) {
              const { id, created_date, updated_date, created_by, ...data } = record;
              try { await base44.entities[entityName].create(data); count++; } catch {}
            }
          }
          showStatus("success", `Imported ${count} records to cloud.`);
        }
        return;
      }



      showStatus("error", "Unknown file format. Expected Symphony backup or Simply Plural export.");
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
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
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
          <p className="text-xs text-muted-foreground">⚠️ Importing adds records — it does not replace existing data. For PluralKit sync, see PluralKit Sync section.</p>
        </div>
      </CardContent>
    </Card>
  );
}