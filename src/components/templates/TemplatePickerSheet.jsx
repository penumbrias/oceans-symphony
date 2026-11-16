// The Templates sheet the mini toolbar opens (v0.373.0). Two jobs:
//   - paste a saved template where the caret is (browse folders, or search),
//   - save what's selected (or the whole box) as a new template, keeping
//     its formatting.
// Folders are drill-in pages inside the sheet (tap a folder to go in, the
// back arrow to come out), never a row of tabs.
import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, ChevronLeft, ChevronRight, Folder, Search, BookmarkPlus, FileStack } from "lucide-react";
import { usePopupZ } from "@/components/shared/popupLayer";
import { useTextTemplates, createTextTemplate } from "@/lib/textTemplates";
import {
  childFolders, templatesIn, templateTitle, templatePlainText, folderPath, searchTemplates,
  countTemplatesUnder, firstLine, isBlankContent, indexFolders,
} from "@/lib/textTemplateModel";
import { TemplateFolderSelect, TemplatePreview } from "@/components/templates/TemplateParts";

const rowCls = "w-full flex items-center gap-3 min-h-[48px] px-3 py-2 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors border-b border-border/30 last:border-b-0";

function TemplateRow({ t, folders, showPath, onPick }) {
  const preview = templatePlainText(t.content).replace(/\s+/g, " ");
  const path = showPath ? folderPath(t.folder_id, folders).join(" / ") : "";
  return (
    <button type="button" onClick={() => onPick(t)} className={rowCls}>
      <FileStack className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="text-sm font-medium block truncate">{templateTitle(t)}</span>
        <span className="text-xs text-muted-foreground block truncate">{[path, preview].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  );
}

function FolderRow({ f, count, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(f.id)} className={rowCls}>
      <Folder className="w-4 h-4 text-primary flex-shrink-0" />
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{f.name || "Folder"}</span>
      <span className="text-xs text-muted-foreground flex-shrink-0">{count}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

// selectionHtml: what was highlighted when the button was tapped ("" = none).
// boxHtml: everything in the box. onInsert(html): paste at the caret.
export default function TemplatePickerSheet({ selectionHtml = "", boxHtml = "", onInsert, onClose }) {
  const z = usePopupZ(220);
  const { templates, folders, refresh } = useTextTemplates();
  const [folderId, setFolderId] = useState(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(null); // { content } while the save page is open
  const [title, setTitle] = useState("");
  const [saveFolder, setSaveFolder] = useState(null);
  const [busy, setBusy] = useState(false);

  const fmap = useMemo(() => indexFolders(folders), [folders]);
  const here = folderId && fmap.has(folderId) ? fmap.get(folderId) : null;
  const subFolders = useMemo(() => childFolders(here ? here.id : null, folders), [here, folders]);
  const hereTemplates = useMemo(() => templatesIn(here ? here.id : null, templates, folders), [here, templates, folders]);
  const found = useMemo(() => (query.trim() ? searchTemplates(query, templates, folders) : null), [query, templates, folders]);

  const hasSelection = !isBlankContent(selectionHtml);
  const hasBox = !isBlankContent(boxHtml);

  const startSave = (content) => {
    setSaving({ content });
    setTitle("");
    setSaveFolder(here ? here.id : null);
  };

  const save = async () => {
    if (!saving || busy) return;
    setBusy(true);
    try {
      const made = await createTextTemplate({ title, content: saving.content, folderId: saveFolder });
      refresh();
      toast.success(`Saved "${templateTitle(made)}" as a template`);
      setSaving(null);
      setFolderId(saveFolder);
    } catch (e) {
      toast.error(e?.message || "Couldn't save the template");
    } finally {
      setBusy(false);
    }
  };

  const pick = (t) => { onInsert?.(t.content || ""); onClose?.(); };

  const header = (titleText, onBack) => (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 flex-shrink-0">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className="w-8 h-8 -ml-1 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50">
          <ChevronLeft className="w-4 h-4" />
        </button>
      ) : <FileStack className="w-4 h-4 text-primary ml-1" />}
      <h3 className="flex-1 min-w-0 font-semibold text-sm truncate">{titleText}</h3>
      <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  let body;
  if (saving) {
    body = (
      <>
        {header("Save as a template", () => setSaving(null))}
        <div className="overflow-y-auto overscroll-contain p-3 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus
              placeholder={firstLine(saving.content) || "Untitled template"}
              className="mt-1 w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <span className="text-xs text-muted-foreground">Leave it empty to use the first line.</span>
          </label>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Folder</span>
            <div className="mt-1">
              <TemplateFolderSelect value={saveFolder} onChange={setSaveFolder} folders={folders} onFoldersChanged={refresh} />
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">How it will paste</span>
            <div className="mt-1 rounded-lg border border-border/60 bg-muted/20 p-2.5 max-h-48 overflow-y-auto">
              <TemplatePreview content={saving.content} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-3 border-t border-border/50 flex-shrink-0">
          <button type="button" onClick={() => setSaving(null)} className="flex-1 h-10 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save template</button>
        </div>
      </>
    );
  } else {
    const empty = !templates.length && !folders.length;
    body = (
      <>
        {header(here ? here.name || "Folder" : "Text templates", here ? () => setFolderId(here.parent_id && fmap.has(here.parent_id) ? here.parent_id : null) : null)}
        <div className="px-3 pt-2.5 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates and folders…"
              aria-label="Search templates"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
          {!query.trim() && (hasSelection || hasBox) && (
            <div className="px-3 pb-2 space-y-1.5">
              {hasSelection && (
                <button type="button" onClick={() => startSave(selectionHtml)}
                  className="w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium">
                  <BookmarkPlus className="w-4 h-4" /> Save the selected text as a template
                </button>
              )}
              {!hasSelection && hasBox && (
                <button type="button" onClick={() => startSave(boxHtml)}
                  className="w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/40">
                  <BookmarkPlus className="w-4 h-4 text-muted-foreground" /> Save everything in this box as a template
                </button>
              )}
            </div>
          )}
          {found ? (
            found.templates.length || found.folders.length ? (
              <div className="border-t border-border/30">
                {found.folders.map((f) => (
                  <FolderRow key={f.id} f={f} count={countTemplatesUnder(f.id, templates, folders)} onOpen={(id) => { setFolderId(id); setQuery(""); }} />
                ))}
                {found.templates.map((t) => <TemplateRow key={t.id} t={t} folders={fmap} showPath onPick={pick} />)}
              </div>
            ) : <p className="px-4 py-6 text-sm text-muted-foreground text-center">No templates match.</p>
          ) : empty ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center leading-relaxed">
              No templates yet. Highlight some text and tap this button to save it as one. Settings → Text templates holds them all.
            </p>
          ) : (
            <div className="border-t border-border/30">
              {subFolders.map((f) => (
                <FolderRow key={f.id} f={f} count={countTemplatesUnder(f.id, templates, folders)} onOpen={setFolderId} />
              ))}
              {hereTemplates.map((t) => <TemplateRow key={t.id} t={t} folders={fmap} onPick={pick} />)}
              {!subFolders.length && !hereTemplates.length && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">This folder is empty.</p>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-3" style={{ zIndex: z }} onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>,
    document.body,
  );
}
