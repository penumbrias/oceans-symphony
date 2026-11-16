// Settings → Text templates (v0.373.0): every saved template, in folders.
//
// Built to docs/inspector-design-guide.md like CustomEmotionsManager:
// flat rows, and drill-in pages kept in the URL (`?tt=…`) so the phone's
// back gesture steps back one page.
//
//   (none) / folder:<id>   a folder's contents (the top level when none)
//   new[:<folderId>]       write a new template
//   template:<id>          one template: title, folder, text; ⋯ delete
//   move:<folderId>        put a folder inside another one
//
// Writes go only through src/lib/textTemplates.js. Deleting a template goes
// to the trash with an Undo; deleting a folder moves what's inside it up.
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Folder, FileStack, Plus, FolderPlus, Pencil, Trash2, FolderInput, Search } from "lucide-react";
import WysiwygEditor from "@/components/shared/WysiwygEditor";
import RowMenu from "@/components/shared/RowMenu";
import { Group, StackedRow } from "@/components/shared/SettingRows";
import { promptText, confirm } from "@/components/shared/ConfirmDialog";
import { deleteWithUndo } from "@/lib/undoDelete";
import {
  useTextTemplates, createTextTemplate, updateTextTemplate, deleteTextTemplate,
  createTemplateFolder, updateTemplateFolder, deleteTemplateFolder,
} from "@/lib/textTemplates";
import {
  childFolders, templatesIn, templateTitle, templatePlainText, folderPath, searchTemplates,
  countTemplatesUnder, firstLine, indexFolders, descendantFolderIds, effectiveParentId,
} from "@/lib/textTemplateModel";
import { TemplateFolderSelect } from "@/components/templates/TemplateParts";
import { getCommandSign } from "@/lib/commandTerms";

function SubHeader({ title, onBack, menu = null }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button type="button" onClick={onBack} aria-label="Back"
        className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 flex-shrink-0">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <h2 className="text-lg font-semibold leading-tight min-w-0 truncate flex-1">{title}</h2>
      {menu}
    </div>
  );
}

export default function TextTemplatesSettings() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const view = params.get("tt") || "";
  const go = (next, { replace = false } = {}) => {
    const p = new URLSearchParams(location.search);
    if (next) p.set("tt", next); else p.delete("tt");
    const search = p.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace });
  };
  const back = () => {
    const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (idx > 0) navigate(-1); else go("", { replace: true });
  };

  if (view === "new" || view.startsWith("new:")) {
    return <TemplateEditPage key={view} folderId={view.startsWith("new:") ? view.slice(4) : null} back={back} go={go} />;
  }
  if (view.startsWith("move:")) return <MoveFolderPage key={view} id={view.slice(5)} back={back} />;
  if (view.startsWith("template:")) return <TemplateEditPage key={view} id={view.slice(9)} back={back} go={go} />;
  return <FolderPage folderId={view.startsWith("folder:") ? view.slice(7) : null} back={back} go={go} />;
}

const rowCls = "flex items-center gap-3 w-full text-left min-h-[48px] py-1.5 border-b border-border/30 last:border-b-0";

function FolderPage({ folderId, back, go }) {
  const { templates, folders, refresh } = useTextTemplates();
  const [query, setQuery] = useState("");
  const fmap = useMemo(() => indexFolders(folders), [folders]);
  const here = folderId && fmap.has(folderId) ? fmap.get(folderId) : null;
  const subFolders = useMemo(() => childFolders(here ? here.id : null, folders), [here, folders]);
  const items = useMemo(() => templatesIn(here ? here.id : null, templates, folders), [here, templates, folders]);
  const found = useMemo(() => (query.trim() ? searchTemplates(query, templates, folders) : null), [query, templates, folders]);
  const sign = getCommandSign();

  const newFolder = async () => {
    const name = await promptText({ title: here ? `New folder in "${here.name}"` : "New folder", placeholder: "Folder name", confirmLabel: "Make folder" });
    if (!name) return;
    await createTemplateFolder({ name, parentId: here ? here.id : null });
    refresh();
  };

  const renameFolder = async (f) => {
    const name = await promptText({ title: "Rename folder", defaultValue: f.name || "", confirmLabel: "Rename" });
    if (!name) return;
    await updateTemplateFolder(f.id, { name });
    refresh();
  };

  const removeFolder = async (f) => {
    const n = countTemplatesUnder(f.id, templates, folders);
    const ok = await confirm({
      title: `Delete the folder "${f.name}"?`,
      body: n ? `The ${n} template${n === 1 ? "" : "s"} inside move up a level. Nothing in it is deleted.` : "It's empty.",
      confirmLabel: "Delete folder", destructive: true,
    });
    if (!ok) return;
    await deleteTemplateFolder(f.id);
    refresh();
  };

  const removeTemplate = (t) => deleteWithUndo({ label: `Deleted "${templateTitle(t)}"`, run: () => deleteTextTemplate(t.id), refresh });

  const folderRow = (f) => (
    <div key={f.id} className={rowCls}>
      <button type="button" onClick={() => { setQuery(""); go(`folder:${f.id}`); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Folder className="w-[1.125rem] h-[1.125rem] text-primary flex-shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{f.name || "Folder"}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">{countTemplatesUnder(f.id, templates, folders)}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
      <RowMenu label="Folder actions" items={[
        { label: "Rename", icon: Pencil, onSelect: () => renameFolder(f) },
        { label: "Move to another folder", icon: FolderInput, onSelect: () => go(`move:${f.id}`) },
        { label: "Delete folder", icon: Trash2, onSelect: () => removeFolder(f), destructive: true },
      ]} />
    </div>
  );

  const templateRow = (t, showPath = false) => {
    const preview = templatePlainText(t.content).replace(/\s+/g, " ");
    const path = showPath ? folderPath(t.folder_id, fmap).join(" / ") : "";
    return (
      <div key={t.id} className={rowCls}>
        <button type="button" onClick={() => go(`template:${t.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <FileStack className="w-[1.125rem] h-[1.125rem] text-muted-foreground flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium block truncate">{templateTitle(t)}</span>
            <span className="text-xs text-muted-foreground block truncate">{[path, preview].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
        <RowMenu label="Template actions" items={[
          { label: "Edit", icon: Pencil, onSelect: () => go(`template:${t.id}`) },
          { label: "Delete", icon: Trash2, onSelect: () => removeTemplate(t), destructive: true },
        ]} />
      </div>
    );
  };

  return (
    <div>
      {here && <SubHeader title={here.name || "Folder"} onBack={back} />}
      {/* Adding comes first, so it's never below a long list. */}
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => go(here ? `new:${here.id}` : "new")}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" /> New template
        </button>
        <button type="button" onClick={newFolder}
          className="flex-1 h-10 rounded-xl border border-border/60 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-muted/40">
          <FolderPlus className="w-4 h-4" /> New folder
        </button>
      </div>
      {!here && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          Saved text you can paste into any box, formatting and all. In any text box, tap the templates button
          (<FileStack className="w-3 h-3 inline -mt-0.5" />) on the formatting bar to paste one, or highlight text first to save it as one.
          You can also type <code className="text-foreground">{sign}template:load:</code> and pick one.
        </p>
      )}
      {(templates.length > 0 || folders.length > 0) && (
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates and folders…" aria-label="Search templates"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      )}
      {found ? (
        found.templates.length || found.folders.length ? (
          <div>{found.folders.map(folderRow)}{found.templates.map((t) => templateRow(t, true))}</div>
        ) : <p className="text-sm text-muted-foreground py-6 text-center">No templates match.</p>
      ) : subFolders.length || items.length ? (
        <div>{subFolders.map(folderRow)}{items.map((t) => templateRow(t))}</div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">{here ? "This folder is empty." : "No templates yet."}</p>
      )}
    </div>
  );
}

function TemplateEditPage({ id = null, folderId = null, back }) {
  const { templates, folders, refresh, loading } = useTextTemplates();
  const existing = id ? templates.find((t) => t.id === id) : null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState(folderId);
  const [ready, setReady] = useState(!id);
  const [busy, setBusy] = useState(false);

  // Load the record once, when it arrives.
  useEffect(() => {
    if (ready || !existing) return;
    setTitle(existing.title || "");
    setContent(existing.content || "");
    setFolder(existing.folder_id || null);
    setReady(true);
  }, [existing, ready]);

  if (id && !existing) {
    return (
      <div>
        <SubHeader title="Template" onBack={back} />
        <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "This template isn't here any more. It may be in Recent changes → Trash."}</p>
      </div>
    );
  }

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (existing) {
        await updateTextTemplate(existing.id, { title, content, folderId: folder });
        toast.success("Template saved");
      } else {
        await createTextTemplate({ title, content, folderId: folder });
        toast.success("Template made");
      }
      refresh();
      back();
    } catch (e) {
      toast.error(e?.message || "Couldn't save the template");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const t = existing;
    const ok = await deleteWithUndo({ label: `Deleted "${templateTitle(t)}"`, run: () => deleteTextTemplate(t.id), refresh });
    if (ok) back();
  };

  return (
    <div>
      <SubHeader title={existing ? templateTitle(existing) : "New template"} onBack={back}
        menu={existing ? <RowMenu label="Template actions" items={[{ label: "Delete", icon: Trash2, onSelect: remove, destructive: true }]} /> : null} />
      <Group title="Template" first>
        <StackedRow label="Title" hint="Leave it empty to use the first line.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
            placeholder={firstLine(content) || "Untitled template"}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </StackedRow>
        <StackedRow label="Folder">
          <TemplateFolderSelect value={folder} onChange={setFolder} folders={folders} onFoldersChanged={refresh} />
        </StackedRow>
      </Group>
      <Group title="Text">
        <div className="rounded-xl border border-border/60 overflow-hidden mt-1">
          {ready && <WysiwygEditor value={content} onChange={setContent} placeholder="Write the template…" />}
        </div>
      </Group>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={back} className="flex-1 h-10 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
        <button type="button" onClick={save} disabled={busy} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {existing ? "Save" : "Make template"}
        </button>
      </div>
    </div>
  );
}

function MoveFolderPage({ id, back }) {
  const { folders, refresh } = useTextTemplates();
  const fmap = useMemo(() => indexFolders(folders), [folders]);
  const f = fmap.get(id);
  const [target, setTarget] = useState(undefined);
  const blocked = useMemo(() => { const s = descendantFolderIds(id, folders); s.add(id); return s; }, [id, folders]);
  if (!f) {
    return (<div><SubHeader title="Move folder" onBack={back} /><p className="text-sm text-muted-foreground">This folder isn't here any more.</p></div>);
  }
  const current = target === undefined ? effectiveParentId(f, fmap) : target;
  const save = async () => {
    try { await updateTemplateFolder(id, { parentId: current || null }); refresh(); toast.success("Folder moved"); back(); }
    catch (e) { toast.error(e?.message || "Couldn't move it"); }
  };
  return (
    <div>
      <SubHeader title={`Move "${f.name || "Folder"}"`} onBack={back} />
      <Group title="Put it inside" first>
        <StackedRow label="Folder" hint="Its templates and folders come with it.">
          <TemplateFolderSelect value={current} onChange={setTarget} folders={folders} excludeIds={blocked} allowNew={false} />
        </StackedRow>
      </Group>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={back} className="flex-1 h-10 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
        <button type="button" onClick={save} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Move</button>
      </div>
    </div>
  );
}
