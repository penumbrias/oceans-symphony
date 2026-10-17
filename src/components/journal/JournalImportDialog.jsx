import React, { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Loader2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import SearchableSelect from "@/components/shared/SearchableSelect";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { useTerms } from "@/lib/useTerms";
import {
  JOURNAL_IMPORT_ACCEPT, readJournalImportFile, buildJournalImportPayload, isAlreadyImported,
} from "@/lib/journalFileImport";

// "Import files" for Journals: pick one or many note files, review them,
// then each ticked file becomes a NEW journal entry. Nothing existing is
// changed. Parsing/sanitizing lives in src/lib/journalFileImport.js.

const ROOT = "__root__";

function fmtDate(iso) {
  if (!iso) return "No date";
  try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function snippet(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim().slice(0, 90);
}

export default function JournalImportDialog({ open, onClose, folderPaths = [], defaultFolder = null, alters = [], entries = [] }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [folder, setFolder] = useState(defaultFolder || null);
  const [authorId, setAuthorId] = useState(null);

  const folderOptions = useMemo(() => {
    const paths = [...new Set(folderPaths.filter(Boolean))]
      .sort((a, b) => a.split("/").join("\u0000").localeCompare(b.split("/").join("\u0000")));
    return [
      { id: ROOT, label: "No folder", _depth: 0 },
      ...paths.map((p) => ({ id: p, label: p.split("/").pop(), _path: p, _depth: p.split("/").length - 1 })),
    ];
  }, [folderPaths]);

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);

  const reset = () => { setRows([]); setPicked(new Set()); setReading(false); setImporting(false); };
  const close = () => { if (importing) return; reset(); onClose?.(); };

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setReading(true);
    try {
      const offset = rows.length;
      const read = [];
      for (let i = 0; i < files.length; i++) read.push(await readJournalImportFile(files[i], offset + i));
      setRows((prev) => [...prev, ...read]);
      setPicked((prev) => {
        const next = new Set(prev);
        read.forEach((r) => { if (r.ok && !isAlreadyImported(r, entries)) next.add(r.key); });
        return next;
      });
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggle = (key) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const okRows = rows.filter((r) => r.ok);
  const skipped = rows.filter((r) => !r.ok);
  const chosen = okRows.filter((r) => picked.has(r.key));

  const runImport = async () => {
    if (!chosen.length || importing) return;
    setImporting(true);
    let done = 0;
    const failed = [];
    for (const row of chosen) {
      try {
        await base44.entities.JournalEntry.create(buildJournalImportPayload(row, { folder, authorAlterId: authorId }));
        done++;
      } catch {
        failed.push(row);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
    queryClient.invalidateQueries({ queryKey: ["journals"] });
    const skippedNames = skipped.map((r) => r.fileName);
    const notes = [];
    if (skippedNames.length) notes.push(`Skipped: ${skippedNames.join(", ")}`);
    if (failed.length) notes.push(`Couldn't save: ${failed.map((r) => r.fileName).join(", ")}`);
    if (done) toast.success(`Imported ${done} ${done === 1 ? "entry" : "entries"}`, notes.length ? { description: notes.join(" · ") } : undefined);
    else toast.error("Nothing was imported", notes.length ? { description: notes.join(" · ") } : undefined);
    setImporting(false);
    if (!failed.length) { reset(); onClose?.(); }
    else {
      // Keep only the ones that didn't save, so a retry can't duplicate.
      setRows(failed);
      setPicked(new Set(failed.map((r) => r.key)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-4 h-4 text-primary" />
            Import files
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 -mx-1 px-1">
          <p className="text-xs text-muted-foreground">
            Text (.txt), Markdown (.md) or HTML files. Each file becomes a new entry dated when the file was last changed. Up to 2 MB per file.
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={JOURNAL_IMPORT_ACCEPT}
            className="hidden"
            data-testid="journal-import-input"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button type="button" variant="outline" className="w-full gap-2" disabled={reading || importing}
            onClick={() => inputRef.current?.click()}>
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {rows.length ? "Add more files" : "Choose files"}
          </Button>

          {rows.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Folder</p>
                  <SearchableSelect
                    value={folder || ROOT}
                    onChange={(id) => setFolder(!id || id === ROOT ? null : id)}
                    options={folderOptions}
                    placeholder="No folder"
                    searchPlaceholder="Search folders…"
                    renderOption={(o) => (
                      <span className="flex items-center gap-2 min-w-0">
                        {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
                        <span className="truncate text-sm">{o.label}</span>
                      </span>
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Author</p>
                  <AlterSearchSelect
                    alters={activeAlters}
                    value={authorId}
                    onChange={setAuthorId}
                    terms={terms}
                    placeholder={`No ${terms.alter}`}
                    noneLabel={`No ${terms.alter}`}
                    zIndex={80}
                  />
                </div>
              </div>

              {okRows.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{chosen.length} of {okRows.length} selected</p>
                    <button type="button" className="text-xs text-primary hover:underline"
                      onClick={() => setPicked(chosen.length === okRows.length ? new Set() : new Set(okRows.map((r) => r.key)))}>
                      {chosen.length === okRows.length ? "Select none" : "Select all"}
                    </button>
                  </div>
                  <ul className="rounded-lg border border-border divide-y divide-border/60" data-testid="journal-import-preview">
                    {okRows.map((r) => {
                      const dup = isAlreadyImported(r, entries);
                      return (
                        <li key={r.key}>
                          <label className="flex items-start gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer">
                            <Checkbox checked={picked.has(r.key)} onCheckedChange={() => toggle(r.key)} className="mt-0.5" aria-label={`Import ${r.fileName}`} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium truncate">{r.title}</span>
                              <span className="block text-[0.6875rem] text-muted-foreground truncate">
                                {r.fileName} · {fmtDate(r.date)}{dup ? " · already imported" : ""}
                              </span>
                              <span className="block text-xs text-muted-foreground/80 truncate">{snippet(r.content)}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {skipped.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="w-3.5 h-3.5" /> {skipped.length} {skipped.length === 1 ? "file" : "files"} can't be imported
                  </p>
                  <ul className="text-[0.6875rem] text-muted-foreground space-y-0.5">
                    {skipped.map((r) => <li key={r.key} className="truncate">{r.fileName} — {r.reason}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={close} disabled={importing}>Cancel</Button>
          <Button onClick={runImport} disabled={!chosen.length || importing || reading} className="bg-primary hover:bg-primary/90 gap-1.5">
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            {chosen.length ? `Import ${chosen.length}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
