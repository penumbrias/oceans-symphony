// The house's Write room, Journals (plan step 5.2): board 05-Journals drawn
// by the house itself on /journals. House mode only: the frames draw it
// (houseWriteRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
//   Studio  Journals (left: Find, All entries, the folders, {Switch}
//           journals, then the entries); the page's toolbar and the entry on
//           its page in the middle (Edit turns the page into the editor, in
//           place); Info: this entry and What this entry did (right); the
//           status line (Saved · words · Signed).
//   Phone   (board 05 has no phone; the same pieces in the phone's language)
//           Find and the toolbar, Folders folded, the entries; a tap opens
//           the entry's page (?id=), with Info in the header and Edit ·
//           New entry as the room's bar.
//
// Nothing here writes a record by itself: entries through the editor
// (JournalEditorModal → saveEditedJournal), moves and folder changes
// through src/lib/journalEntry.js, deletes through trashJournalEntry inside
// one trash batch with Undo. Locked entries never show or search their text.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Lock, Shuffle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { TextField } from "@/house/kit/Field";
import Menu from "@/house/kit/Menu";
import { Sheet, ConfirmSheet } from "@/house/kit/Sheet";
import { AlterPicker, NestedPicker } from "@/house/kit/Pickers";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast, trashWithUndo } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { sharedList } from "@/lib/sharedLists";
import { sortJournalsNewestFirst, journalDisplayDate } from "@/lib/journalDate";
import { clockPattern } from "@/lib/timeFormat";
import { useMentionHighlight } from "@/lib/useMentionHighlight";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { trashJournalEntry, updateJournalEntry, moveEntriesOutOfFolder, renameEntriesFolder } from "@/lib/journalEntry";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import JournalReadBody from "@/components/journal/JournalReadBody";
import JournalImportDialog from "@/components/journal/JournalImportDialog";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import {
  SWITCH_FOLDER, readSavedFolders, addSavedFolder, savedFoldersAfter, writeSavedFolders, folderPaths, folderRows,
  parentOf, folderName, filterEntries, allTags, authorIdsOf, byLine, frontingAt, wordCount, entryFacts, effectRows,
  pickEntry, frontIds,
} from "@/house/write/writeModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/write/write.css";

const store = () => (typeof localStorage === "undefined" ? null : localStorage);
const fail = (e, what = "That didn't save.") => showToast({ tone: "failed", message: e?.message || what, detail: "Nothing changed." });
// Locking happens when an entry is first written (the editor's "Make this
// entry private"). Locking one that's already saved would rewrite its text,
// so that waits for its own careful write path; the button says why.
const LOCK_LATER = "Entries are locked when they're first written (New entry → Make this entry private). Locking a saved one isn't here yet.";

export default function HouseJournals({ size = "full", tokens }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const identity = useSystemIdentity();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const phone = size === "phone";
  const [params, setParams] = useSearchParams();

  // ── Records ──
  const { data: raw = [], isLoading } = useQuery({ ...sharedList("journalEntries") });
  const entries = useMemo(() => sortJournalsNewestFirst(raw), [raw]);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const { data: allSessions = [] } = useQuery({ queryKey: ["frontSessionsAll"], queryFn: () => base44.entities.FrontingSession.filter({}), staleTime: 60000 });
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const nowIds = useMemo(() => frontIds(activeSessions), [activeSessions]);
  const primary = activeSessions.find((s) => s.is_primary) || activeSessions[0];
  const currentAlterId = primary?.alter_id || primary?.primary_alter_id || null;

  // ── Folders (the old page's saved list plus every entry's own) ──
  const [saved, setSaved] = useState(() => readSavedFolders(store()));
  const paths = useMemo(() => folderPaths(entries, saved), [entries, saved]);
  const [folded, setFolded] = useState([]);
  const rows = useMemo(() => folderRows(paths, entries, folded), [paths, entries, folded]);
  const switchCount = useMemo(() => entries.filter((e) => e.entry_type === "switch_log").length, [entries]);

  // ── The view ──
  const [folder, setFolder] = useState(() => params.get("folder") || null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(null);
  const [authorId, setAuthorId] = useState(() => params.get("author") || null);
  const [fronterIds, setFronterIds] = useState(null); // null = off
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const shown = useMemo(() => filterEntries(entries, { folder, search, tag, authorId, fronterIds }), [entries, folder, search, tag, authorId, fronterIds]);
  const tags = useMemo(() => allTags(entries), [entries]);
  const authorIds = useMemo(() => authorIdsOf(entries), [entries]);
  const filterCount = (tag ? 1 : 0) + (authorId ? 1 : 0);

  // ── The entry on the page ──
  const urlId = params.get("id");
  const [pickedId, setPickedId] = useState(urlId);
  useEffect(() => { if (urlId) setPickedId(urlId); }, [urlId]);
  // A deep link to an entry a filter or folder hides: show everything so it lands.
  useEffect(() => {
    if (!urlId || !entries.length) return;
    if (entries.some((e) => e.id === urlId) && !shown.some((e) => e.id === urlId)) {
      setFolder(null); setSearch(""); setTag(null); setAuthorId(null); setFronterIds(null);
    }
  }, [urlId, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = phone
    ? (urlId ? entries.find((e) => e.id === urlId) || null : null)
    : pickEntry(shown, pickedId);
  const pick = (e) => {
    if (phone) { navigate(`/journals?id=${e.id}`); return; }
    setPickedId(e.id);
    setEditing(null);
    setParams((prev) => { const n = new URLSearchParams(prev); n.set("id", e.id); return n; }, { replace: true });
  };
  useMentionHighlight("id", entries.length > 0);
  useHighlightScroll([shown.length]);

  // ── Writing: the one editor, in place on a computer, its dialog on a phone ──
  const [editing, setEditing] = useState(null); // { entry, folder, authorId }
  const openNew = useCallback((opts = {}) => setEditing({ entry: null, folder: opts.folder ?? (folder && folder !== SWITCH_FOLDER ? folder : null), authorId: opts.authorId || null }), [folder]);
  const openEdit = (entry) => setEditing({ entry, folder: null, authorId: null });
  const [importOpen, setImportOpen] = useState(false);

  // ?compose=1 (Write from the rail or Do sheet) and ?import=1 open once.
  const compose = params.get("compose");
  const importParam = params.get("import");
  useEffect(() => {
    if (compose !== "1" && importParam !== "1") return;
    if (compose === "1") openNew({ folder: params.get("folder") || null, authorId: params.get("author") || null });
    if (importParam === "1") setImportOpen(true);
    setParams((prev) => { const n = new URLSearchParams(prev); n.delete("compose"); n.delete("import"); return n; }, { replace: true });
  }, [compose, importParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const folderParam = params.get("folder");
  useEffect(() => { if (folderParam != null) setFolder(folderParam || null); }, [folderParam]);

  // ── Folder actions ──
  const [folderSheet, setFolderSheet] = useState(null); // { mode: "new"|"rename", path, name }
  const [deleteFolder, setDeleteFolder] = useState(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["journalEntries"] }); qc.invalidateQueries({ queryKey: ["journals"] }); };
  const saveFolder = async () => {
    const name = String(folderSheet?.name || "").trim();
    if (!name) return;
    if (name.includes("/")) { fail({ message: "Folder names can't contain '/'." }); return; }
    if (folderSheet.mode === "new") {
      const base = folderSheet.path;
      const full = base ? `${base}/${name}` : name;
      setSaved(addSavedFolder(store(), full));
      setFolder(full);
      setFolderSheet(null);
      return;
    }
    const from = folderSheet.path;
    const parent = parentOf(from);
    const to = parent ? `${parent}/${name}` : name;
    if (to === from) { setFolderSheet(null); return; }
    if (paths.includes(to)) { fail({ message: `A folder named "${name}" is already here.` }); return; }
    try {
      await renameEntriesFolder(entries, from, to);
      const next = savedFoldersAfter(saved, { rename: { from, to } });
      writeSavedFolders(store(), next); setSaved(next);
      if (folder === from || (folder && folder.startsWith(`${from}/`))) setFolder(to + (folder || "").slice(from.length));
      refresh(); setFolderSheet(null);
      showToast({ message: `Renamed to ${name}.` });
    } catch (e) { fail(e); }
  };
  const removeFolder = async () => {
    const path = deleteFolder;
    await moveEntriesOutOfFolder(entries, path);
    const next = savedFoldersAfter(saved, { remove: path });
    writeSavedFolders(store(), next); setSaved(next);
    if (folder === path || (folder && folder.startsWith(`${path}/`))) setFolder(parentOf(path));
    refresh(); setDeleteFolder(null);
    showToast({ message: "Folder removed. Its entries moved up a level; none were deleted." });
  };

  // ── Entry actions ──
  const [moveFor, setMoveFor] = useState(null);
  const [moveTo, setMoveTo] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const moveEntry = async () => {
    try {
      await updateJournalEntry(moveFor.id, { folder: moveTo === "__none__" ? null : moveTo || null });
      refresh(); setMoveFor(null);
      showToast({ message: moveTo && moveTo !== "__none__" ? `Moved to ${folderName(moveTo)}.` : "Moved out of its folder." });
    } catch (e) { fail(e); }
  };
  const removeEntry = async (entry) => {
    setDeleteFor(null);

    await trashWithUndo({ thing: `"${entry.title || "This entry"}"`, run: () => trashJournalEntry(entry.id), refresh });
    if (phone) navigate("/journals", { replace: true });
  };

  // ── Words about the entry ──
  const label = (a) => formatAlter(a);
  const lineOf = (e) => byLine(e, { altersById, label, systemName: identity.name });
  const { data: notices = [] } = useQuery({
    queryKey: ["journalEntryNotices", current?.id],
    queryFn: () => base44.entities.MentionLog.filter({ source_id: current.id }),
    enabled: !!current?.id,
  });
  const facts = useMemo(() => {
    if (!current) return [];
    const by = lineOf(current);
    const then = frontingAt(allSessions, journalDisplayDate(current).getTime()).map((id) => altersById[id]).filter(Boolean).map(label);
    return entryFacts(current, {
      terms: t,
      folderWords: current.folder ? current.folder.split("/").join(" / ") : "None",
      writtenBy: by.lead || identity.name,
      withWords: by.co.join(", "),
      frontingWords: then.join(", "),
      dayWords: format(journalDisplayDate(current), clockPattern("EEE MMM d, yyyy · h:mm a")),
      readers: (current.allowed_alter_ids || []).map((id) => altersById[id]).filter(Boolean).map(label),
    });
  }, [current, allSessions, altersById, identity.name, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const effects = useMemo(() => effectRows(notices, { altersById, label, someone: an(t.alter) }), [notices, altersById, t.alter]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryMenu = (entry) => [
    { id: "edit", label: "Edit", onSelect: () => openEdit(entry) },
    { id: "move", label: "Move to a folder…", onSelect: () => { setMoveFor(entry); setMoveTo(entry.folder || "__none__"); } },
    { id: "changes", label: "Recent changes (undo)…", onSelect: () => navigate("/history") },
    { id: "delete", label: `Delete "${entry.title || "this entry"}"`, danger: true, onSelect: () => setDeleteFor(entry) },
  ];

  // ── Pieces ──
  const find = (
    <div className="hw-find">
      <TextField label="Find" value={search} onChange={setSearch} placeholder="Title or words…" type="search" />
    </div>
  );
  const fronterOn = fronterIds != null;
  const toggleFronter = async () => {
    if (fronterOn) { setFronterIds(null); return; }
    let ids = nowIds;
    try { ids = frontIds(await base44.entities.FrontingSession.filter({ is_active: true })); } catch { /* the cached list */ }
    setFronterIds(ids);
  };
  const toolbar = (
    <div className="hw-toolbar" role="toolbar" aria-label="Journal tools" data-tour="journals-filters">
      <span data-tour="journals-new-entry"><Button rank="primary" onClick={() => openNew()}>+ New entry</Button></span>
      {!phone && current && !editing ? <Button rank="secondary" onClick={() => openEdit(current)}>Edit</Button> : null}
      <Button rank={fronterOn ? "primary" : "secondary"} aria-pressed={fronterOn} onClick={toggleFronter}
        title={`Only entries by who's ${t.fronting} now`}>{`${t.Fronter} view${fronterOn && fronterIds.length !== nowIds.length ? ` (${fronterIds.length})` : ""}`}</Button>
      {fronterOn ? <Button rank="quiet" onClick={() => setRefineOpen(true)}>Pick who…</Button> : null}
      <Button rank={filterCount ? "primary" : "secondary"} onClick={() => setFiltersOpen(true)}>{`Filter${filterCount ? ` (${filterCount})` : ""}`}</Button>
      <span className="hw-flex" />
      <span data-tour="journals-import"><Button rank="quiet" onClick={() => setImportOpen(true)}>Import files</Button></span>
    </div>
  );

  const folderTree = (
    <ul className="hw-tree" aria-label="Folders" data-tour="journals-folder-panel">
      <li className="hw-tree-row" data-selected={!folder || undefined}>
        <span className="hw-tree-arrow" aria-hidden="true" />
        <Button rank="quiet" className="hw-tree-pick" aria-pressed={!folder} onClick={() => setFolder(null)}>
          <span className="hw-tree-name">All entries</span><span className="hw-count">{entries.length}</span>
        </Button>
      </li>
      {rows.map((r) => (
        <li key={r.path} className="hw-tree-row" data-selected={folder === r.path || undefined} style={{ paddingLeft: `${r.depth * 0.75}rem` }}>
          {r.hasKids
            ? <IconButton icon={r.open ? ChevronDown : ChevronRight} label={`${r.open ? "Fold" : "Unfold"} ${r.name}`} aria-expanded={r.open} className="hw-tree-arrow"
                onClick={() => setFolded((f) => (f.includes(r.path) ? f.filter((x) => x !== r.path) : [...f, r.path]))} />
            : <span className="hw-tree-arrow" aria-hidden="true" />}
          <Button rank="quiet" className="hw-tree-pick" aria-pressed={folder === r.path} onClick={() => setFolder(r.path)}>
            <span className="hw-tree-name">{r.name}</span><span className="hw-count">{r.count}</span>
          </Button>
          <Menu label={`Folder ${r.name}`} rank="quiet" items={[
            { id: "sub", label: "New folder inside…", onSelect: () => setFolderSheet({ mode: "new", path: r.path, name: "" }) },
            { id: "ren", label: "Rename…", onSelect: () => setFolderSheet({ mode: "rename", path: r.path, name: r.name }) },
            { id: "del", label: `Delete folder ${r.name}`, danger: true, onSelect: () => setDeleteFolder(r.path) },
          ]} />
        </li>
      ))}
      {switchCount ? (
        <li className="hw-tree-row" data-selected={folder === SWITCH_FOLDER || undefined} data-tour="journals-tabs">
          <span className="hw-tree-arrow" aria-hidden="true" />
          <Button rank="quiet" className="hw-tree-pick" aria-pressed={folder === SWITCH_FOLDER} onClick={() => setFolder(SWITCH_FOLDER)}>
            <span className="hw-tree-name">{`${t.Switch} journals`}</span><span className="hw-count">{switchCount}</span>
          </Button>
        </li>
      ) : null}
    </ul>
  );

  const entryList = (
    <ul className="hw-entries" aria-label="Entries">
      {shown.map((e) => {
        const sel = !phone && current?.id === e.id;
        return (
          <li key={e.id} id={`item-${e.id}`} data-highlight-id={e.id} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3rem" }}>
            <Button rank="quiet" className="hw-entry" aria-pressed={phone ? undefined : sel} data-selected={sel || undefined} onClick={() => pick(e)}>
              <span className="hw-entry-top">
                <b className="hw-entry-title">
                  {e.entry_type === "switch_log" ? <Shuffle className="hw-ico" aria-label={`${t.Switch} journal`} /> : null}
                  {e.is_encrypted ? <Lock className="hw-ico" aria-label="Locked" /> : null}
                  {e.title || "Untitled"}
                </b>
                <span className="hw-entry-date">{format(journalDisplayDate(e), "MMM d")}</span>
              </span>
              {lineOf(e).text ? <span className="hw-entry-by">{lineOf(e).text}</span> : null}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  const empty = (
    <EmptyBlock compact
      title={fronterOn ? `No entries from who's ${t.fronting}` : search || filterCount ? "No entries match" : folder ? "This folder is empty" : "No journal entries yet"}
      body={fronterOn ? `Turn off ${t.Fronter} view to see every entry.` : search || filterCount ? "Try other words, or clear the filters." : "Start writing to keep your thoughts and experiences."}
      action={fronterOn ? { label: `Turn off ${t.Fronter} view`, onClick: () => setFronterIds(null) }
        : search || filterCount ? { label: "Clear filters", onClick: () => { setSearch(""); setTag(null); setAuthorId(null); } }
        : { label: folder && folder !== SWITCH_FOLDER ? "Write an entry here" : "Write your first entry", onClick: () => openNew() }} />
  );

  const by = current ? lineOf(current) : null;
  const page = current ? (
    <article className="hw-page" aria-label={current.title || "Entry"}>
      <h2 className="hw-page-title house-label">{current.title || "Untitled"}</h2>
      <p className="hw-page-meta house-label">
        {format(journalDisplayDate(current), clockPattern("EEE MMM d, h:mm a"))}
        {by?.lead ? `  ·  written by ${by.lead}` : ""}
        {by?.co.length ? `${by.lead ? ", with" : "  ·  written by"} ${by.co.join(", ")}` : ""}
      </p>
      <div className="hw-old hw-page-body">
        <JournalReadBody key={current.id} entry={current} altersById={altersById} className="prose prose-sm dark:prose-invert max-w-none" />
      </div>
    </article>
  ) : null;

  const editor = editing ? (
    <div className="hw-old hw-editor">
      <JournalEditorModal key={editing.entry?.id || "new"} inline={!phone} open onClose={() => setEditing(null)}
        entry={editing.entry} alters={alters} groups={groups}
        currentAlterId={(!editing.entry && editing.authorId) || currentAlterId} defaultFolder={editing.folder} />
    </div>
  ) : null;

  const infoPanel = current ? (
    <Panel className="hw-info" headingLevel={2} title="Info: this entry" tools={<Menu label={`More for ${current.title || "this entry"}`} rank="quiet" items={entryMenu(current)} />}>
      <div className="hw-info-body" data-tour="journal-info-panel">
        <dl className="hw-facts">
          {facts.map(([k, v]) => <div key={k} className="hw-fact"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="hw-actions">
          <Button rank="secondary" disabledReason={current.is_encrypted ? "Already locked: it opens with its password" : LOCK_LATER}>{current.is_encrypted ? "Locked" : "Lock entry"}</Button>
          <Button rank="secondary" onClick={() => { setMoveFor(current); setMoveTo(current.folder || "__none__"); }}>Move</Button>
        </div>
      </div>
    </Panel>
  ) : (
    <Panel className="hw-info" headingLevel={2} title="Info: this entry">
      <div className="hw-info-body"><p className="hw-muted">Pick an entry to see where it lives and who wrote it.</p></div>
    </Panel>
  );
  const didPanel = (
    <Panel className="hw-did" headingLevel={2} title="What this entry did"
      tools={<Button rank="quiet" onClick={() => navigate("/history")} title="Undo any change in Recent changes">undo any</Button>}>
      <div className="hw-info-body">
        {current && effects.length ? (
          <ul className="hw-effects">
            {effects.map((r) => (
              <li key={r.id}><span className="hw-sq" style={{ background: r.color || "var(--house-muted)" }} aria-hidden="true" /><span>{r.text}</span></li>
            ))}
          </ul>
        ) : <p className="hw-muted">{current ? "Nothing yet. When an entry @mentions or is signed by someone, it shows here." : ""}</p>}
        <p className="hw-small hw-muted">Commands run when you save. Each one makes its own record; Recent changes can undo them.</p>
      </div>
    </Panel>
  );

  const words = current ? wordCount(current) : null;
  const signers = current ? [by?.lead, ...(by?.co || [])].filter(Boolean) : [];
  const statusLine = (
    <div className="hw-status house-label" role="status">
      {current?.updated_date || current?.created_date
        ? <span>{`Saved ${format(new Date(current.updated_date || current.created_date), clockPattern("h:mm a"))}`}</span> : null}
      {words != null ? <span>{`${words} word${words === 1 ? "" : "s"}`}</span> : current?.is_encrypted ? <span>Locked</span> : null}
      {signers.length ? <span>{`Signed: ${signers.join(", ")}`}</span> : null}
      <span className="hw-flex" />
      <span>{`${shown.length} of ${entries.length} entries`}</span>
    </div>
  );

  // ── Phone: an entry's own page publishes Info and its bar to the frame ──
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => { setInfoOpen(false); }, [urlId]);
  const phoneEntry = phone && current;
  const bar = useMemo(() => (phoneEntry ? (
    <div className="hw-roombar">
      <Button rank="primary" onClick={() => openEdit(current)}>Edit entry</Button>
      <Button rank="secondary" onClick={() => openNew()}>New entry</Button>
    </div>
  ) : null), [phoneEntry, current?.id, openNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const tools = useMemo(() => (phoneEntry ? {
    info: { label: "Info", ariaLabel: "Info: this entry", pressed: infoOpen, tour: "journal-info-panel", onSelect: () => setInfoOpen((o) => !o) },
    items: entryMenu(current).map((i) => ({ ...i })),
    bar,
  } : null), [phoneEntry, current?.id, current?.is_encrypted, infoOpen, bar]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(phone ? tools : null);

  const sheets = (
    <>
      {phone ? editor : null}
      {importOpen ? (
        <JournalImportDialog open onClose={() => setImportOpen(false)} folderPaths={paths}
          defaultFolder={folder && folder !== SWITCH_FOLDER ? folder : null} alters={alters} entries={raw} />
      ) : null}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter entries" size="half"
        footer={<Button rank="secondary" onClick={() => { setTag(null); setAuthorId(null); }}>Clear filters</Button>}>
        <div className="hw-sheet-body">
          <AlterPicker label="Written by" value={authorId} onChange={(v) => setAuthorId(v || null)} alters={alters.filter((a) => authorIds.includes(a.id))}
            noneLabel="Every author" placeholder="Every author" />
          {tags.length ? (
            <NestedPicker label="Tag" value={tag} onChange={(v) => setTag(v || null)} allowClear placeholder="Every tag"
              options={tags.map((x) => ({ id: x, label: `#${x}`, _depth: 0 }))} />
          ) : <p className="hw-muted">No tags yet. Type a #word in an entry to tag it.</p>}
        </div>
      </Sheet>
      <Sheet open={refineOpen} onClose={() => setRefineOpen(false)} title={`${t.Fronter} view: whose entries`} size="half"
        footer={<>
          <Button rank="secondary" onClick={() => setFronterIds(nowIds)}>{`Who's ${t.fronting} now`}</Button>
          <Button rank="primary" onClick={() => setRefineOpen(false)}>Done</Button>
        </>}>
        <div className="hw-old">
          <AlterTreeSelect isSelected={(id) => (fronterIds || []).includes(id)}
            onToggle={(a) => setFronterIds((cur) => { const s = new Set(cur || []); if (s.has(a.id)) s.delete(a.id); else s.add(a.id); return [...s]; })}
            onSetMany={(arr, on) => setFronterIds((cur) => { const s = new Set(cur || []); for (const a of arr) { if (on) s.add(a.id); else s.delete(a.id); } return [...s]; })}
            maxHeight="48vh" />
        </div>
      </Sheet>
      <Sheet open={!!folderSheet} onClose={() => setFolderSheet(null)} size="half"
        title={folderSheet?.mode === "rename" ? `Rename ${folderName(folderSheet.path)}` : folderSheet?.path ? `New folder in ${folderName(folderSheet.path)}` : "New folder"}
        footer={<Button rank="primary" disabledReason={String(folderSheet?.name || "").trim() ? undefined : "Give it a name first"} onClick={saveFolder}>Save</Button>}>
        <TextField label="Folder name" value={folderSheet?.name || ""} onChange={(v) => setFolderSheet((s) => ({ ...s, name: v }))}
          onKeyDown={(e) => { if (e.key === "Enter") saveFolder(); }} autoFocus />
      </Sheet>
      {/* Not a ConfirmSheet: nothing is deleted or trashed, the entries only move up a level. */}
      <Sheet open={!!deleteFolder} onClose={() => setDeleteFolder(null)} size="half" title={`Delete folder ${deleteFolder ? folderName(deleteFolder) : ""}?`}
        footer={<>
          <Button rank="secondary" onClick={() => setDeleteFolder(null)}>Keep it</Button>
          <Button rank="danger" onClick={() => removeFolder().catch((e) => fail(e))}>Delete folder</Button>
        </>}>
        <p className="hw-p">Its entries move up a level. No entry is deleted.</p>
      </Sheet>
      <ConfirmSheet open={!!deleteFor} thing={deleteFor ? `"${deleteFor.title || "this entry"}"` : ""} onConfirm={() => removeEntry(deleteFor)} onCancel={() => setDeleteFor(null)} />
      <Sheet open={!!moveFor} onClose={() => setMoveFor(null)} title={`Move "${moveFor?.title || "this entry"}"`} size="half"
        footer={<Button rank="primary" onClick={moveEntry}>Save</Button>}>
        <NestedPicker label="Folder" value={moveTo} onChange={(v) => setMoveTo(v || "__none__")} placeholder="Choose a folder…"
          options={[{ id: "__none__", label: "No folder", _depth: 0 }, ...paths.map((p) => ({ id: p, label: folderName(p), _depth: Math.min(p.split("/").length - 1, 6) }))]} />
        <p className="hw-muted">New folders are made from the folder list (⋯ on a folder, or + folder).</p>
      </Sheet>
      {phone && current ? (
        <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title="Info: this entry" size="half">
          <div className="hw-sheet-stack">{infoPanel}{didPanel}</div>
        </Sheet>
      ) : null}
    </>
  );

  if (isLoading) {
    return <HouseScope tokens={tokens} className={`hw hw-j hw--${phone ? "phone" : "studio"}`} data-house-size={size}><LoadingBlock label="Loading journals" /></HouseScope>;
  }

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hw hw-j hw--phone" data-house-size="phone" data-write-room="journals" data-tour="journals-list">
        {current ? (
          <div className="hw-stack">{page}</div>
        ) : (
          <div className="hw-stack">
            <section className="hw-panelish" aria-label="Find and filter">{find}{toolbar}</section>
            <Panel className="hw-folders" headingLevel={2} title="Folders" collapsible defaultOpen={false}
              tools={<span data-tour="journals-folder-btn"><Button rank="quiet" onClick={() => setFolderSheet({ mode: "new", path: folder && folder !== SWITCH_FOLDER ? folder : null, name: "" })}>+ folder</Button></span>}>
              {folderTree}
            </Panel>
            <Panel className="hw-list" headingLevel={2} title={folder === SWITCH_FOLDER ? `${t.Switch} journals` : folder ? folderName(folder) : "All entries"}>
              {shown.length ? entryList : empty}
            </Panel>
            {statusLine}
          </div>
        )}
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hw hw-j hw--studio" data-house-size={size} data-write-room="journals" data-tour="journals-list">
      <aside className="hw-left" aria-label="Journals">
        <Panel className="hw-side" headingLevel={2} title="Journals"
          tools={<>
            <span data-tour="journals-folder-btn"><Button rank="quiet" onClick={() => setFolderSheet({ mode: "new", path: folder && folder !== SWITCH_FOLDER ? folder : null, name: "" })}>+ folder</Button></span>
            <Button rank="quiet" onClick={() => openNew()}>+ new</Button>
          </>}>
          <div className="hw-side-body">
            {find}
            <div className="hw-side-tree">{folderTree}</div>
            <div className="hw-split" aria-hidden="true" />
            <div className="hw-side-list">{shown.length ? entryList : empty}</div>
          </div>
        </Panel>
      </aside>
      <section className="hw-main" aria-label={current?.title || "Journal"}>
        <div className="hw-bar">{editing ? (
          <div className="hw-toolbar"><span className="house-label">{editing.entry ? `Editing "${editing.entry.title || "Untitled"}"` : "New entry"}</span><span className="hw-flex" />
            <span className="hw-muted hw-small">The writing toolbar (and Text templates) is on the page below.</span></div>
        ) : toolbar}</div>
        <div className="hw-floor">
          {editing ? <div className="hw-page hw-page--edit">{editor}</div> : page || empty}
        </div>
      </section>
      <aside className="hw-right" aria-label="Info">
        {infoPanel}
        {didPanel}
      </aside>
      <div className="hw-foot">{statusLine}</div>
      {sheets}
    </HouseScope>
  );
}
