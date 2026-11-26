import React, { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, FolderPlus, FileUp, Search, Trash2, MoreHorizontal, Lock, Shuffle, ChevronDown, ChevronRight, Hash } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { confirmFolderDelete } from "@/components/journal/FolderGrid";
import JournalReadBody from "@/components/journal/JournalReadBody";
import { journalDisplayDate, normalizeTag } from "@/lib/journalDate";
import { journalCoAuthorIds } from "@/lib/journalAuthors";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { TRASH_HINT } from "@/lib/trashSettings";
import { clockPattern } from "@/lib/timeFormat";
import { an } from "@/lib/articles";
import "@/styles/pixel/journals.css";

// The Journals page in the pixel look (the "Desktop: journal editor" board).
// Layout only — every action is one of the page's own handlers, passed in:
//   computer: [Journals panel: folders + entry list] [toolbar + reading page] [Info + What this entry did]
//   phone:    the same pieces stacked — toolbar, folders, entries; an entry
//             opens the usual view sheet.
// Writing and editing stay in JournalEditorModal (opened by Edit / + new),
// reading uses JournalReadBody (the view modal's own body), folders use the
// page's rename/delete handlers.

const getParent = (path) => {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
};

function useByLine(altersById) {
  const formatAlter = useAlterLabel();
  const identity = useSystemIdentity();
  return (entry) => {
    const author = altersById?.[entry.author_alter_id || entry.alter_id];
    const co = journalCoAuthorIds(entry).map((id) => altersById?.[id]).filter(Boolean);
    const lead = author ? formatAlter(author) : (co.length ? null : identity.name);
    return { author, co, text: [lead, ...co.map((a) => formatAlter(a))].filter(Boolean).join(", ") };
  };
}

// A fixed-position menu anchored to a button (escapes the scrolling tree).
function FolderMenu({ anchor, onClose, items }) {
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - 180, window.innerWidth - 188));
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="pj-menu" role="menu" style={{ position: "fixed", top: r.bottom + 4, left, width: 180, zIndex: 50 }}>
        {items.map((it) => (
          <button key={it.label} type="button" role="menuitem" className={`pj-menu-item${it.danger ? " danger" : ""}`}
            onClick={() => { onClose(); it.onClick(); }}>
            {it.icon}{it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function FolderTree({ entries, allFolderPaths, viewingFolder, setViewingFolder, onNewFolder, onRenameFolder, onDeleteFolder }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { path, anchor }
  const paths = useMemo(() => [...allFolderPaths].sort((a, b) => a.localeCompare(b)), [allFolderPaths]);
  const hasChildren = (p) => paths.some((q) => getParent(q) === p);
  const hidden = (p) => {
    let cur = getParent(p);
    let guard = 0;
    while (cur && guard++ < 32) { if (collapsed.has(cur)) return true; cur = getParent(cur); }
    return false;
  };
  const toggle = (p) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const folderInfo = (p) => ({
    path: p,
    name: p.split("/").pop(),
    count: entries.filter((e) => e.folder === p || (e.folder || "").startsWith(`${p}/`)).length,
    hasChildren: hasChildren(p),
  });

  return (
    <div className="pj-folders" data-tour="journals-folder-panel">
      <button type="button" className={`pj-row${!viewingFolder ? " sel" : ""}`} aria-pressed={!viewingFolder} onClick={() => setViewingFolder(null)}>
        <span className="pj-arrow" aria-hidden="true"><ChevronDown className="w-3 h-3" /></span>
        <span className="pj-name">All entries</span><span className="pj-count">{entries.length}</span>
      </button>
      {paths.filter((p) => !hidden(p)).map((p) => {
        const depth = Math.min(p.split("/").length - 1, 8);
        const sel = viewingFolder === p;
        const kids = hasChildren(p);
        const info = folderInfo(p);
        return (
          <div key={p} className={`pj-row pj-folder${sel ? " sel" : ""}`} style={{ paddingLeft: 4 + (depth + 1) * 12 }}>
            {kids ? (
              <button type="button" className="pj-arrow" aria-label={collapsed.has(p) ? `Open ${info.name}` : `Fold ${info.name}`}
                aria-expanded={!collapsed.has(p)} onClick={() => toggle(p)}>
                {collapsed.has(p) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : <span className="pj-arrow" />}
            <button type="button" className="pj-pick" aria-pressed={sel} onClick={() => setViewingFolder(p)}>
              <span className="pj-name">{info.name}</span><span className="pj-count">{info.count}</span>
            </button>
            <button type="button" className="pj-more" aria-label={`Folder actions for ${info.name}`}
              onClick={(e) => setMenu({ path: p, anchor: e.currentTarget })}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {paths.length === 0 && <p className="pj-empty">No folders yet.</p>}
      <button type="button" className="pj-row pj-addfolder" onClick={onNewFolder}>
        <span className="pj-arrow" aria-hidden="true"><FolderPlus className="w-3 h-3" /></span>
        <span className="pj-name">{viewingFolder ? "New subfolder" : "New folder"}</span>
      </button>
      <FolderMenu
        anchor={menu?.anchor}
        onClose={() => setMenu(null)}
        items={menu ? [
          { label: "New subfolder", icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: () => { setViewingFolder(menu.path); onNewFolder(); } },
          { label: "Rename", icon: <Pencil className="w-3.5 h-3.5" />, onClick: async () => {
            const name = await promptText({ title: "Rename folder", defaultValue: menu.path.split("/").pop() });
            if (name) onRenameFolder(menu.path, name);
          } },
          { label: "Delete folder", danger: true, icon: <Trash2 className="w-3.5 h-3.5" />, onClick: async () => {
            const info = folderInfo(menu.path);
            if (await confirmFolderDelete(info)) onDeleteFolder(menu.path);
          } },
        ] : []}
      />
    </div>
  );
}

function EntryRows({ list, altersById, selectedId, onPick, terms }) {
  const byLine = useByLine(altersById);
  return (
    <div className="pj-entries">
      {list.map((entry) => {
        const sel = entry.id === selectedId;
        const { text } = byLine(entry);
        return (
          <button key={entry.id} id={`item-${entry.id}`} data-highlight-id={entry.id} type="button"
            className={`pj-entry${sel ? " sel" : ""}`} aria-pressed={sel} onClick={() => onPick(entry)}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 46px" }}>
            <span className="pj-entry-top">
              <b className="pj-entry-title">
                {entry.entry_type === "switch_log" && <Shuffle className="w-3 h-3 inline mr-1" aria-label={`${terms.Switch} log`} />}
                {entry.is_encrypted && <Lock className="w-3 h-3 inline mr-1" aria-label="Locked" />}
                {entry.title}
              </b>
              <span className="pj-entry-date">{format(journalDisplayDate(entry), "MMM d")}</span>
            </span>
            {text && <span className="pj-entry-by">{text}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TagMenu({ allTags, selectedTag, setSelectedTag }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (allTags.length === 0) return null;
  return (
    <div className="pj-tagwrap">
      <button ref={ref} type="button" className={`pj-tagbtn${selectedTag ? " on" : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Hash className="w-3.5 h-3.5" />{selectedTag || "Tags"}<ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <FolderMenu
          anchor={ref.current}
          onClose={() => setOpen(false)}
          items={[
            { label: "Every tag", onClick: () => setSelectedTag(null) },
            ...allTags.map((t) => ({ label: `#${t}${selectedTag === t ? "  ✓" : ""}`, onClick: () => setSelectedTag(selectedTag === t ? null : t) })),
          ]}
        />
      )}
    </div>
  );
}

function EntryInfo({ entry, altersById, terms, onEdit, onDelete }) {
  const byLine = useByLine(altersById);
  const formatAlter = useAlterLabel();
  const { data: notices = [] } = useQuery({
    queryKey: ["journalEntryNotices", entry?.id],
    queryFn: () => base44.entities.MentionLog.filter({ source_id: entry.id }),
    enabled: !!entry?.id,
  });
  if (!entry) {
    return (
      <div className="pj-panel"><div className="pj-ttl"><span>Info: this entry</span></div>
        <p className="pj-note" style={{ padding: 10 }}>Pick an entry to see where it lives and who wrote it.</p></div>
    );
  }
  const { author, co } = byLine(entry);
  const identity = byLine({ ...entry, co_author_alter_ids: [], author_alter_ids: [] }).text;
  const tags = [...new Set((entry.tags || []).map(normalizeTag).filter(Boolean))];
  const readers = (entry.allowed_alter_ids || []).map((id) => altersById?.[id]).filter(Boolean);
  const facts = [
    ["Folder", entry.folder ? entry.folder.split("/").join(" / ") : "None"],
    ["Written by", author ? formatAlter(author) : identity],
    co.length ? ["With", co.map((a) => formatAlter(a)).join(", ")] : null,
    ["Kind", entry.entry_type === "switch_log" ? `${terms.Switch} log` : "Journal"],
    ["Day", format(journalDisplayDate(entry), clockPattern("EEE MMM d, yyyy · h:mm a"))],
    tags.length ? ["Tags", tags.map((t) => `#${t}`).join(" ")] : null,
    entry.is_encrypted ? ["Locked", "With a password"] : null,
    readers.length ? ["Who can read", readers.map((a) => formatAlter(a)).join(", ")] : null,
  ].filter(Boolean);

  const rows = notices
    .filter((n) => n.source_type === "journal")
    .map((n) => {
      const who = altersById?.[n.mentioned_alter_id || n.author_alter_id || n.alter_id];
      const name = who ? formatAlter(who) : an(terms.alter);
      if (n.log_type === "authored") return { id: n.id, color: who?.color, text: `Signed the entry for ${name}` };
      if (String(n.source_label || "").startsWith("Whisper")) return { id: n.id, color: null, text: "Sent a private whisper" };
      return { id: n.id, color: who?.color, text: `Let ${name} know they were mentioned` };
    });

  return (
    <>
      <div className="pj-panel">
        <div className="pj-ttl"><span>Info: this entry</span></div>
        <div className="pj-info">
          {facts.map(([k, v]) => (
            <div key={k} className="pj-fact"><span className="pj-k">{k}</span><span className="pj-v">{v}</span></div>
          ))}
          <div className="pj-actions">
            <button type="button" className="pj-btn" onClick={() => onEdit(entry)}><Pencil className="w-3.5 h-3.5" />Edit</button>
            <button type="button" className="pj-btn danger" onClick={async () => {
              if (!(await confirm(`Delete "${entry.title || "this entry"}"? ${TRASH_HINT}`))) return;
              onDelete(entry);
            }}><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
          <p className="pj-note">Lock, move or re-sign it from Edit.</p>
        </div>
      </div>
      <div className="pj-panel pj-grow">
        <div className="pj-ttl"><span>What this entry did</span></div>
        <div className="pj-info">
          {rows.length === 0 && <p className="pj-note">Nothing yet. When an entry @mentions or is signed by someone, it shows here.</p>}
          {rows.map((r) => (
            <div key={r.id} className="pj-effect">
              <span className="pj-dot" style={{ background: r.color || "var(--px-text-2)" }} />
              <span>{r.text}</span>
            </div>
          ))}
          <p className="pj-note">Notices this entry sent when it was saved. Each one is its own record.</p>
        </div>
      </div>
    </>
  );
}

export default function JournalPixel({
  desk, terms, entries, filtered, allFolderPaths, viewingFolder, setViewingFolder,
  altersById, search, setSearch, allTags, selectedTag, setSelectedTag,
  authorFilterEl, fronterFilterEl, tabsEl,
  selectedId, setSelectedId,
  onNew, onEdit, onOpen, onDelete, onNewFolder, onImport, onRenameFolder, onDeleteFolder,
  fronterOnly, onClearFronter,
}) {
  const current = desk ? (filtered.find((e) => e.id === selectedId) || filtered[0] || null) : null;
  const byLine = useByLine(altersById);

  // Keep the selection on a real row (a deleted or filtered-out entry falls
  // back to the newest one shown).
  useEffect(() => {
    if (desk && current && current.id !== selectedId) setSelectedId(current.id);
  }, [desk, current, selectedId, setSelectedId]);

  const folderLabel = viewingFolder ? viewingFolder.split("/").pop() : null;

  const empty = (
    <div className="pj-emptybox">
      <p className="pj-empty-title">
        {fronterOnly
          ? `No entries from currently-${terms.fronting} ${terms.alters}`
          : viewingFolder ? "This folder is empty" : "No journal entries yet"}
      </p>
      <p className="pj-note">
        {fronterOnly
          ? `Tap "${terms.Fronter} view" again to clear the filter and see every entry.`
          : viewingFolder ? "Add your first entry to this folder." : "Start writing to capture your thoughts and experiences."}
      </p>
      {fronterOnly
        ? <button type="button" className="pj-btn" onClick={onClearFronter}>Clear {terms.fronter} view</button>
        : <button type="button" className="pj-btn on" onClick={() => onNew(viewingFolder)}>{viewingFolder ? "Add entry here" : "Write your first entry"}</button>}
    </div>
  );

  const toolbar = (
    <div className="pj-panel pj-toolbar" data-tour="journals-filters">
      <button type="button" className="pj-tb on" data-tour="journals-new-entry" aria-label="New entry" title={viewingFolder ? `New entry in ${folderLabel}` : "New entry"}
        onClick={() => onNew(viewingFolder)}><Plus className="w-4 h-4" /></button>
      {desk && (
        <button type="button" className="pj-tb" aria-label="Edit this entry" title="Edit this entry" disabled={!current}
          onClick={() => current && onEdit(current)}><Pencil className="w-4 h-4" /></button>
      )}
      <button type="button" className="pj-tb" data-tour="journals-folder-btn" aria-label={viewingFolder ? "New subfolder" : "New folder"}
        title={viewingFolder ? "New subfolder" : "New folder"} onClick={onNewFolder}><FolderPlus className="w-4 h-4" /></button>
      <button type="button" className="pj-tb" data-tour="journals-import" aria-label="Import files" title="Import files"
        onClick={onImport}><FileUp className="w-4 h-4" /></button>
      <label className="pj-search">
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <input placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search entries" />
      </label>
      {authorFilterEl}
      {fronterFilterEl}
      <span className="pj-spacer" />
      <TagMenu allTags={allTags} selectedTag={selectedTag} setSelectedTag={setSelectedTag} />
    </div>
  );

  const listPanel = (
    <div className="pj-panel pj-side">
      <div className="pj-ttl">
        <span>Journals{folderLabel ? `: ${folderLabel}` : ""}</span>
        <button type="button" className="pj-ttl-act" onClick={() => onNew(viewingFolder)}>+ new</button>
      </div>
      <FolderTree entries={entries} allFolderPaths={allFolderPaths} viewingFolder={viewingFolder} setViewingFolder={setViewingFolder}
        onNewFolder={onNewFolder} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder} />
      <div className="pj-split" />
      {filtered.length > 0
        ? <EntryRows list={filtered} altersById={altersById} selectedId={desk ? current?.id : null} terms={terms}
            onPick={(e) => (desk ? setSelectedId(e.id) : onOpen(e))} />
        : (!desk && empty)}
    </div>
  );

  if (!desk) {
    return (
      <div className="pj-phone">
        {tabsEl}
        {toolbar}
        {listPanel}
      </div>
    );
  }

  const meta = current ? byLine(current) : null;
  return (
    <div className="pj-desk">
      {tabsEl}
      <div className="pj-grid">
        {listPanel}
        <div className="pj-center">
          {toolbar}
          <div className="pj-canvas">
            {current ? (
              <article className="pj-page" aria-label={current.title}>
                <h2 className="pj-page-title">{current.title}</h2>
                <p className="pj-page-meta">
                  {format(journalDisplayDate(current), clockPattern("EEE MMM d, h:mm a"))}
                  {meta?.text ? `  ·  written by ${meta.author ? meta.text.split(", ")[0] : meta.text}` : ""}
                  {meta?.author && meta.co.length ? `, with ${meta.text.split(", ").slice(1).join(", ")}` : ""}
                </p>
                <JournalReadBody key={current.id} entry={current} altersById={altersById} className="pj-page-body prose prose-sm dark:prose-invert max-w-none" />
              </article>
            ) : empty}
          </div>
        </div>
        <div className="pj-right">
          <EntryInfo entry={current} altersById={altersById} terms={terms} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}
