import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileJson, Users, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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

// Convert Symphony alters to Simply Plural member format
function toSimplyPluralMember(alter) {
  return {
    id: alter.sp_id || alter.id,
    name: alter.name || "",
    pronouns: alter.pronouns || "",
    description: alter.description || "",
    color: alter.color || "",
    avatarUrl: alter.avatar_url || "",
    roles: alter.role ? [alter.role] : [],
    isCustomFront: false,
    isArchived: alter.is_archived || false,
  };
}

export default function DataBackupRestore() {
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [spExportLoading, setSpExportLoading] = useState(false);
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

  // Simply Plural compatible export
  const handleExportSimplyPlural = async () => {
    setSpExportLoading(true);
    try {
      let alters, settings;
      if (isLocalMode()) {
        const dump = getFullDbDump();
        alters = Object.values(dump["Alter"] || {});
        settings = Object.values(dump["SystemSettings"] || {})[0] || {};
      } else {
        alters = await base44.entities.Alter.list();
        const settingsList = await base44.entities.SystemSettings.list();
        settings = settingsList[0] || {};
      }

      const spData = {
        __format: "simply_plural_compatible",
        version: "1.0",
        exported_at: new Date().toISOString(),
        system: {
          name: settings.system_name || "My System",
          description: settings.system_description || "",
          tag: settings.system_name || "system",
        },
        members: alters.filter(a => !a.is_archived).map(toSimplyPluralMember),
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(spData, `symphony-simply-plural-export-${date}.json`);
      showStatus("success", "Simply Plural–compatible export downloaded.");
    } catch (e) {
      showStatus("error", `Export failed: ${e.message}`);
    } finally {
      setSpExportLoading(false);
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

      // Handle Simply Plural compatible import
      if (parsed.__format === "simply_plural_compatible" || parsed.members) {
        const members = parsed.members || [];
        const systemInfo = parsed.system || {};
        let count = 0;

        // Import system settings
        if (systemInfo.name) {
          try {
            if (isLocalMode()) {
              await base44.entities.SystemSettings.create({ system_name: systemInfo.name, system_description: systemInfo.description || "" });
            } else {
              const existing = await base44.entities.SystemSettings.list();
              if (existing[0]) {
                await base44.entities.SystemSettings.update(existing[0].id, { system_name: systemInfo.name, system_description: systemInfo.description || "" });
              } else {
                await base44.entities.SystemSettings.create({ system_name: systemInfo.name, system_description: systemInfo.description || "" });
              }
            }
          } catch {}
        }

        // Import members as Alters
        for (const m of members) {
          try {
            await base44.entities.Alter.create({
              name: m.name || m.displayName || "Unknown",
              pronouns: m.pronouns || "",
              description: m.description || "",
              color: m.color || "",
              avatar_url: m.avatarUrl || m.avatar_url || "",
              role: (m.roles || [])[0] || "",
              sp_id: m.id || "",
            });
            count++;
          } catch {}
        }
        showStatus("success", `Imported ${count} members from Simply Plural file.`);
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
          <Button variant="outline" onClick={handleExportSimplyPlural} disabled={spExportLoading} className="w-full gap-2 justify-start">
            {spExportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            <div className="text-left">
              <p className="font-medium">Simply Plural Format</p>
              <p className="text-xs text-muted-foreground font-normal">Members & system info — importable into Simply Plural</p>
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
              <p className="text-xs text-muted-foreground font-normal">Symphony backup or Simply Plural JSON</p>
            </div>
          </Button>
          <p className="text-xs text-muted-foreground">⚠️ Importing adds records — it does not replace existing data.</p>
        </div>
      </CardContent>
    </Card>
  );
}