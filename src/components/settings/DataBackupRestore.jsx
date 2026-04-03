import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, FileJson, Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { getFullDbDump, loadDbDump } from "@/lib/localDb";

const EMAILJS_SERVICE_ID = "service_j1nb40i";
const EMAILJS_TEMPLATE_ID = "template_63zdij6";
const EMAILJS_PUBLIC_KEY = "WFh9c50YLCtFt1Rly";

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

  // Try Web Share API first (works in APK/mobile)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Symphony Backup" });
      return true;
    } catch (e) {
      if (e.name === "AbortError") return true;
    }
  }

  // Fallback for desktop browsers
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

async function sendBackupEmail(toEmail, data, date) {
  // Load EmailJS via script tag if not already loaded
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  const json = JSON.stringify(data, null, 2);
  const maxChars = 40000;
  const truncated = json.length > maxChars
    ? json.slice(0, maxChars) + "\n\n... [TRUNCATED - too large for email, use download instead]"
    : json;

  await window.emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      email: toEmail,
      backup_data: truncated,
      date: date,
    }
  );
}

export default function DataBackupRestore() {
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [importMode, setImportMode] = useState("add");
  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);

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

  const handleEmailBackup = async () => {
    if (!email.trim() || !email.includes("@")) {
      showStatus("error", "Please enter a valid email address.");
      return;
    }
    setEmailLoading(true);
    try {
      const exportData = await buildExportData();
      const date = new Date().toISOString().slice(0, 10);
      await sendBackupEmail(email.trim(), exportData, date);
      showStatus("success", `Backup sent to ${email}!`);
      setShowEmailInput(false);
      setEmail("");
    } catch (e) {
      showStatus("error", `Email failed: ${e.message}`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.__format === "symphony_backup" && parsed.data) {
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
        return;
      }

      showStatus("error", "Unknown file format. Expected Symphony backup.");
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

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export</p>

          {/* Download button */}
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

          {/* Email button */}
          {!showEmailInput ? (
            <Button
              variant="outline"
              onClick={() => setShowEmailInput(true)}
              className="w-full gap-2 justify-start"
            >
              <Mail className="w-4 h-4" />
              <div className="text-left">
                <p className="font-medium">Email Backup</p>
                <p className="text-xs text-muted-foreground font-normal">Send backup to your email</p>
              </div>
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-border/50 p-3">
              <p className="text-sm font-medium">Send backup to email</p>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowEmailInput(false); setEmail(""); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleEmailBackup}
                  disabled={emailLoading || !email.trim()}
                  className="flex-1"
                >
                  {emailLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {emailLoading ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Import</p>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="add"
                checked={importMode === "add"}
                onChange={(e) => setImportMode(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-xs font-medium">Add New</span>
            </label>
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="replace"
                checked={importMode === "replace"}
                onChange={(e) => setImportMode(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-xs font-medium">Replace All</span>
            </label>
          </div>
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