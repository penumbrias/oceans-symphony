// Plural Star file importer — accepts the app's .json or .zip export,
// previews what it'll add, then runs the import. Routes here via
// externalKindFromJson("pluralstar") in DataBackupRestore + the "pluralstar"
// branch in ImportDataSection.

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { parsePluralStarFile, importPluralStar, isPluralStarJson } from "@/lib/pluralStar";
import { useTerms } from "@/lib/useTerms";

export default function PluralStarFileImport({ presetFile = null, settings, onSettingsChange }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [file, setFile] = useState(presetFile || null);
  const [parsed, setParsed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importSummary, setImportSummary] = useState(null);
  const [updateSystemProfile, setUpdateSystemProfile] = useState(true);

  // Parse + preview whenever the file changes.
  useEffect(() => {
    if (!file) { setParsed(null); setPreview(null); setError(""); return; }
    let cancelled = false;
    (async () => {
      setParsing(true); setError("");
      try {
        const { data, media } = await parsePluralStarFile(file);
        if (cancelled) return;
        if (!isPluralStarJson(data)) throw new Error("This doesn't look like a Plural Star export.");
        setParsed({ data, media });
        // Dry run for preview counts.
        const { counts } = await importPluralStar({ data, media }, { dryRun: true, updateSystemProfile: false });
        if (!cancelled) setPreview(counts);
      } catch (e) {
        if (!cancelled) { setError(e?.message || "Couldn't parse file."); setParsed(null); setPreview(null); }
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const handleFile = (f) => { if (f) { setFile(f); setImportSummary(null); } };

  const runImport = async () => {
    if (!parsed || importing) return;
    setImporting(true); setError("");
    try {
      const { counts, warnings } = await importPluralStar(parsed, { updateSystemProfile });
      setImportSummary({ counts, warnings });
      // Refresh every cache the mapper writes into.
      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["customFields"] });
      qc.invalidateQueries({ queryKey: ["frontHistory"] });
      qc.invalidateQueries({ queryKey: ["activeFront"] });
      qc.invalidateQueries({ queryKey: ["journalEntries"] });
      qc.invalidateQueries({ queryKey: ["alterMessages"] });
      qc.invalidateQueries({ queryKey: ["alterRelationships"] });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      onSettingsChange?.();
      const parts = [];
      if (counts.alters) parts.push(`${counts.alters} ${counts.alters === 1 ? t.alter : t.alters}`);
      if (counts.groups) parts.push(`${counts.groups} group${counts.groups === 1 ? "" : "s"}`);
      if (counts.frontingSessions) parts.push(`${counts.frontingSessions} ${t.front} session${counts.frontingSessions === 1 ? "" : "s"}`);
      if (counts.journalEntries) parts.push(`${counts.journalEntries} journal${counts.journalEntries === 1 ? "" : "s"}`);
      toast.success(`Imported from Plural Star: ${parts.join(", ") || "nothing new"}`);
    } catch (e) {
      setError(e?.message || "Import failed.");
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Bring in {t.alters}, groups, custom fields, {t.front} history, journals, and noteboard messages
        from a Plural Star export (.json or .zip). Records are added — nothing existing gets replaced.
      </p>

      {!file && (
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
          <input
            type="file"
            accept=".json,.zip,application/json,application/zip"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Pick a Plural Star export (.json or .zip)</span>
        </label>
      )}

      {file && (
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); setImportSummary(null); }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {parsing && (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Parsing…</p>
          )}
          {error && (
            <p className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}</p>
          )}
          {parsed && !parsing && !error && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="text-foreground font-medium">Detected Plural Star export</p>
              {parsed.data.system?.name && <p>System: <span className="text-foreground">{parsed.data.system.name}</span></p>}
              {preview && (
                <ul className="pl-2 space-y-0.5">
                  <li>{preview.alters} {preview.alters === 1 ? t.alter : t.alters}</li>
                  <li>{preview.groups} group{preview.groups === 1 ? "" : "s"}</li>
                  <li>{preview.customFields} custom field{preview.customFields === 1 ? "" : "s"}</li>
                  <li>{preview.frontingSessions} {t.front} history entr{preview.frontingSessions === 1 ? "y" : "ies"} (+ {preview.activeFront} active)</li>
                  <li>{preview.journalEntries} journal entr{preview.journalEntries === 1 ? "y" : "ies"}</li>
                  <li>{preview.alterMessages} noteboard message{preview.alterMessages === 1 ? "" : "s"}</li>
                  <li>{preview.relationships} relationship{preview.relationships === 1 ? "" : "s"}</li>
                </ul>
              )}
            </div>
          )}

          {parsed?.data?.system && (
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={updateSystemProfile}
                onChange={(e) => setUpdateSystemProfile(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-primary"
              />
              <span className="text-muted-foreground">
                Also fill in the {t.system} name / bio from this export (only if yours are still the default).
              </span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={runImport}
              disabled={importing || parsing || !parsed || !!error}
              className="gap-1"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>

          {importSummary && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs space-y-1">
              <p className="font-medium text-emerald-600 dark:text-emerald-400">Done!</p>
              <p className="text-muted-foreground">
                {importSummary.counts.alters} {t.alters}, {importSummary.counts.groups} groups,{" "}
                {importSummary.counts.frontingSessions} {t.front} sessions,{" "}
                {importSummary.counts.journalEntries} journals,{" "}
                {importSummary.counts.alterMessages} notes,{" "}
                {importSummary.counts.relationships} relationships.
              </p>
              {importSummary.warnings.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-amber-600 dark:text-amber-400">
                    {importSummary.warnings.length} warning{importSummary.warnings.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-1 pl-3 space-y-0.5 text-muted-foreground">
                    {importSummary.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                    {importSummary.warnings.length > 10 && <li>…and {importSummary.warnings.length - 10} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
