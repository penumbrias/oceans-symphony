// Florality importer — the OpenPlural .json export or the "Floralites Data
// Export" .html page. Routed here by DataBackupRestore's auto-detect
// ("florality") through ImportDataSection. Pure parsing lives in
// src/lib/florality.js, the writes in src/lib/floralityImport.js.
//
// Privacy first: Florality's privacy buckets decide who sees a member.
// Here every imported alter starts hidden from friends; the person picks
// which buckets to share.

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X, Check, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { parseFloralityFile, defaultSharedBuckets } from "@/lib/florality";
import { importFlorality, countOpenFloralityFronts } from "@/lib/floralityImport";
import { Group, SwitchRow, Row } from "@/components/shared/SettingRows";
import OpenFrontsCurrentOption from "@/components/settings/OpenFrontsCurrentOption";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function FloralityFileImport({ presetFile = null, onSettingsChange }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [file, setFile] = useState(presetFile || null);
  const [model, setModel] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);

  const [shared, setShared] = useState(defaultSharedBuckets);
  const [bucketsAsGroups, setBucketsAsGroups] = useState(true);
  const [includeFronts, setIncludeFronts] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [makeOpenFrontsCurrent, setMakeOpenFrontsCurrent] = useState(false);

  useEffect(() => {
    if (!file) { setModel(null); setError(""); return; }
    let cancelled = false;
    (async () => {
      setParsing(true); setError(""); setSummary(null);
      try {
        const m = await parseFloralityFile(file);
        if (!cancelled) { setModel(m); setShared(defaultSharedBuckets()); }
      } catch (e) {
        if (!cancelled) { setModel(null); setError(e?.message || "Couldn't read this file."); }
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const options = useMemo(() => ({
    sharedBucketIds: shared, bucketsAsGroups, includeFronts, includeNotes, makeOpenFrontsCurrent,
  }), [shared, bucketsAsGroups, includeFronts, includeNotes, makeOpenFrontsCurrent]);

  // Live preview of what the import will add with the current choices.
  useEffect(() => {
    if (!model) { setPreview(null); return; }
    let cancelled = false;
    importFlorality(model, { ...options, dryRun: true })
      .then(({ counts }) => { if (!cancelled) setPreview(counts); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [model, options]);

  // Buckets someone is in, with how many.
  const buckets = useMemo(() => {
    if (!model) return [];
    return model.buckets
      .map((b) => ({ ...b, count: model.members.filter((m) => m.bucketIds.includes(b.id)).length }))
      .filter((b) => b.count > 0);
  }, [model]);
  const unbucketed = model ? model.members.filter((m) => !m.bucketIds.length).length : 0;
  const openFronts = model ? countOpenFloralityFronts(model) : 0;

  const toggleBucket = (id, on) => setShared((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const runImport = async () => {
    if (!model || importing) return;
    setImporting(true); setError("");
    try {
      const { counts, warnings } = await importFlorality(model, options);
      setSummary({ counts, warnings });
      try { const { localizeRemotePictures } = await import("@/lib/localDb"); await localizeRemotePictures(); } catch { /* links stay as they were */ }
      for (const key of ["alters", "groups", "customFields", "frontHistory", "activeFront", "journalEntries", "alterNotes"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onSettingsChange?.();
      toast.success(`Imported from Florality: ${plural(counts.alters, t.alter, t.alters)}`);
    } catch (e) {
      setError(e?.message || "Import failed.");
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const notImported = model ? Object.entries(model.notImported) : [];
  const NOT_IMPORTED_LABEL = { polls: ["poll", "polls"], gallery: ["gallery picture", "gallery pictures"], statuses: ["member status", "member statuses"], messages: ["chat message", "chat messages"], friends: ["friend", "friends"] };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Bring in {t.alters}, folders, custom fields, privacy buckets and — from the data-export page — {t.front} history and notes.
        Use the OpenPlural .json, the data-export .html, or both. Records are added; nothing here is replaced.
      </p>

      {!file && (
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
          <input type="file" accept=".json,.html,.htm,application/json,text/html" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Pick a Florality export (.json or .html)</span>
        </label>
      )}

      {file && (
        <div className="rounded-lg border border-border/60 p-3 space-y-3" data-testid="florality-import">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {model ? (model.source === "html" ? "Florality data-export page" : "Florality OpenPlural export") : `${(file.size / 1024).toFixed(1)} KB`}
              </p>
            </div>
            <button type="button" onClick={() => { setFile(null); setSummary(null); }}
              className="text-muted-foreground hover:text-foreground p-1" aria-label="Remove file">
              <X className="w-4 h-4" />
            </button>
          </div>

          {parsing && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Reading…</p>}
          {error && <p className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}</p>}

          {model && !parsing && (
            <>
              {preview && (
                <ul className="text-xs text-muted-foreground pl-2 space-y-0.5">
                  <li>{plural(preview.alters, `new ${t.alter}`, `new ${t.alters}`)}{preview.existingAlters ? ` (${preview.existingAlters} already here, left as they are)` : ""}</li>
                  <li>{plural(preview.groups, "group", "groups")}</li>
                  <li>{plural(preview.customFields, "custom field", "custom fields")}</li>
                  {model.fronts.length > 0 && <li>{plural(preview.frontingSessions, `${t.front} history entry`, `${t.front} history entries`)}</li>}
                  {model.notes.length > 0 && <li>{plural(preview.journalEntries + preview.alterNotes, "note", "notes")}</li>}
                </ul>
              )}

              {buckets.length > 0 && (
                <Group title="Privacy" first>
                  <p className="text-xs text-muted-foreground pb-1">
                    Every imported {t.alter} starts hidden from friends. Turn on a bucket to share the {t.alters} in it.
                    Anyone also in a no-access bucket stays hidden.
                  </p>
                  {buckets.map((b) => (b.friendAccess === false ? (
                    <Row key={b.id} label={b.name} hint={`${plural(b.count, t.alter, t.alters)} · no friend access in Florality`}>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" /> Hidden</span>
                    </Row>
                  ) : (
                    <SwitchRow key={b.id} label={b.name}
                      hint={`Share ${plural(b.count, t.alter, t.alters)} with friends${b.friendAccess === true ? " (they could see them in Florality)" : ""}`}
                      checked={shared.has(b.id)} onChange={(on) => toggleBucket(b.id, on)} />
                  )))}
                  {unbucketed > 0 && (
                    <Row label="In no bucket" hint={plural(unbucketed, t.alter, t.alters)}>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3 h-3" /> Hidden</span>
                    </Row>
                  )}
                  <SwitchRow label="Keep buckets as groups" hint="So you can see who was in which bucket"
                    checked={bucketsAsGroups} onChange={setBucketsAsGroups} />
                </Group>
              )}

              {(model.fronts.length > 0 || model.notes.length > 0) && (
                <Group title="Also bring in" first={buckets.length === 0}>
                  {model.fronts.length > 0 && (
                    <>
                      <SwitchRow label={`${t.Front} history`} checked={includeFronts} onChange={setIncludeFronts} />
                      {includeFronts && (
                        <OpenFrontsCurrentOption count={openFronts} checked={makeOpenFrontsCurrent}
                          onChange={setMakeOpenFrontsCurrent} testId="florality-open-fronts" />
                      )}
                    </>
                  )}
                  {model.notes.length > 0 && (
                    <SwitchRow label="Notes" hint={`A note about one ${t.alter} goes on their profile; the rest become journals`}
                      checked={includeNotes} onChange={setIncludeNotes} />
                  )}
                </Group>
              )}

              {model.source === "json" && (
                <p className="text-xs text-muted-foreground">
                  The .json has no {t.front} history or notes. Import the data-export .html as well to bring those in.
                </p>
              )}
              {notImported.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Not brought in: {notImported.map(([k, n]) => plural(n, ...(NOT_IMPORTED_LABEL[k] || [k, k]))).join(", ")}.
                </p>
              )}

              <Button size="sm" onClick={runImport} disabled={importing || !model} className="gap-1">
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {importing ? "Importing…" : "Import"}
              </Button>
            </>
          )}

          {summary && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs space-y-1">
              <p className="font-medium">Done</p>
              <p className="text-muted-foreground">
                {plural(summary.counts.alters, t.alter, t.alters)} ({summary.counts.shared} shared with friends),{" "}
                {plural(summary.counts.groups, "group", "groups")}, {plural(summary.counts.frontingSessions, `${t.front} entry`, `${t.front} entries`)},{" "}
                {plural(summary.counts.journalEntries + summary.counts.alterNotes, "note", "notes")}.
              </p>
              {summary.warnings.length > 0 && (
                <details>
                  <summary className="cursor-pointer">{plural(summary.warnings.length, "warning", "warnings")}</summary>
                  <ul className="mt-1 pl-3 space-y-0.5 text-muted-foreground">
                    {summary.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
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
