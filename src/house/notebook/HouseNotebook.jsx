// The house's Notebook room: board 19-Notebook (the overview), board
// 20-NotebookPage (a page) and board 18-NotebookPhone, drawn by the house
// itself on /goals. House mode only: the frames draw it
// (houseNotebookRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
//   Studio  Pages on the left (Goals nested, Finished, Notes & lists, Flash
//           cards; drag a page onto another to nest it). Overview: the
//           title bar with the range (This week · 1M · 6M · 1Y · All time),
//           Info and Edit page; four balances; time on pages stacked by
//           page; the ledger of everything that moved a page (By opens who
//           did it); this week's targets with the pace tick, Coming due,
//           Repeats and + Add to this page. A page: Notebook › crumbs, its
//           icon, title, status, by date, tags, Work on it · Info · Edit
//           page; the words or points so far against an even pace; the
//           page's lines (Outline · Board · Map), its note and its ledger;
//           Linked here, Points, Work on it and the notes filed in it.
//   Phone   The week in one panel with the range, Pages with their
//           balances, Recent from the ledger. A page stacks the same
//           pieces, with Info in the header and Work on it · Edit page as
//           the room's bar.
//
// The person's own boards are kept, not redrawn: the Notebook's front board
// (?view=board, "Edit page" and "+ Add to this page"), a page's own layout
// (?page=…&view=layout) and the Notes & lists board (?notes=1) mount the
// old boards inside a house panel. Lists, notes and decks open in the old
// list sheet (?list=). Nothing here writes a record by itself: every write
// goes through the workspace's `run` and the goal write paths (goalTree.js,
// goals.js, goalStarters.js, goalActivities.js, noteLists.js) or
// activityWho.js for "who did it".

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { TextField, DateField } from "@/house/kit/Field";
import Menu from "@/house/kit/Menu";
import { Sheet, ConfirmSheet } from "@/house/kit/Sheet";
import { AlterPicker } from "@/house/kit/Pickers";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useNoteLists, notesFiledIn, isDeck } from "@/lib/noteLists";
import {
  ancestorsOf, descendantIds, updatePage, deletePage, movePage, orderAfter, pageEntries, rootPages, formatMinutes,
  goalBoardPageId,
} from "@/lib/goalTree";
import { GOAL_STATUSES, goalStatusLabel, setGoalStatus, isOpenGoal } from "@/lib/goals";
import { pageTags } from "@/lib/goalWriting";
import { runningOnPage, startPageActivity, stopPageActivity } from "@/lib/goalActivities";
import { useGoalXp } from "@/lib/useGoalXp";
import { sumXp } from "@/lib/goalXp";
import { goalWeekWindow } from "@/lib/goalCounting";
import { shareFile } from "@/lib/shareFile";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { WorkspaceProvider, useWorkspace } from "@/components/goals/workspace/WorkspaceContext";
import { useNotebookWorkspace } from "@/components/goals/workspace/useNotebookWorkspace";
import {
  NOTEBOOK_PAGES, NOTEBOOK_ICONS, GOAL_PAGE_REGISTRY, useHasOwnBoard, useEditWhenShown,
} from "@/components/goals/workspace/notebookBoards";
import { EntryList } from "@/components/goals/workspace/Outline";
import BoardView from "@/components/goals/workspace/BoardView";
import MapView from "@/components/goals/workspace/MapView";
import ActivityStrip, { useActiveSessions } from "@/components/goals/workspace/ActivityStrip";
import { PageNote, Connections } from "@/components/goals/workspace/PageView";
import PageInfoSheet from "@/components/goals/workspace/PageInfoSheet";
import MovePageDialog from "@/components/goals/workspace/MovePageDialog";
import { TagEditorBody } from "@/components/goals/workspace/TagEditor";
import { FiledNotesList } from "@/components/goals/workspace/FiledNotes";
import GoalsXpSwitch from "@/components/goals/GoalsXpSwitch";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";
import { GOAL_PAGE_PAGES, GoalPageContext } from "@/v2/goalPageWidgets";
import ListSheet from "@/components/notes/ListSheet";
import { NotesView } from "@/pages/Notes";
import {
  PagesList, NewPageSheet, StatCards, TimeChart, LedgerTable, WhoSheet, TargetsPanel, DuePanel, RepeatsPanel,
  MeasureRow, PointsPanel, RangeRow, Swatch, Bar, usePageColors, useNumbers, useLedger, useMeasures, useWhoOf,
} from "@/house/notebook/NotebookParts";
import { notebookView, ledgerCsv, whoShares, whenLabel, amountOf, isRange, RANGE_WORDS, VS_WORDS, plusMinutes, LIST_COLOR, DECK_COLOR } from "@/house/notebook/notebookModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/notebook/notebook.css";

export default function HouseNotebook({ size = "full", tokens }) {
  const [params] = useSearchParams();
  // ?new=1 ("New goal" links): the house asks for the new page's name.
  const [newOpen, setNewOpen] = useState(() => params.get("new") === "1");
  // Also when a "New goal" link lands while the room is already open (runs
  // before the workspace tidies ?new out of the address).
  const asksNew = params.get("new") === "1";
  useEffect(() => { if (asksNew) setNewOpen(true); }, [asksNew]);
  const ws = useNotebookWorkspace({ onNew: null });
  return (
    <WorkspaceProvider value={ws.value}>
      <Room size={size} tokens={tokens} ws={ws} newOpen={newOpen} setNewOpen={setNewOpen} />
    </WorkspaceProvider>
  );
}

const LINE_VIEWS = [{ id: "outline", label: "Outline" }, { id: "board", label: "Board" }, { id: "map", label: "Map" }];

function Room({ size, tokens, ws, newOpen, setNewOpen }) {
  const phone = size === "phone";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { goals, open, isFetched, run, alters, settings } = useWorkspace();
  const { lists } = useNoteLists();
  const view = notebookView(`?${params.toString()}`);
  const page = ws.page;
  const [range, setRangeState] = useState(() => {
    try { const r = sessionStorage.getItem("symphony_house_notebook_range"); return isRange(r) ? r : "week"; } catch { return "week"; }
  });
  const setRange = (r) => { setRangeState(r); try { sessionStorage.setItem("symphony_house_notebook_range", r); } catch { /* fine */ } };
  const [infoOpen, setInfoOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [whoFor, setWhoFor] = useState(null);
  useEffect(() => { setInfoOpen(false); setPagesOpen(false); }, [view.kind, view.pageId]);
  useHighlightScroll([isFetched, page?.id]);

  const setView = (v, extra = {}) => {
    const n = new URLSearchParams();
    if (extra.page) n.set("page", extra.page);
    if (v) n.set("view", v);
    setParams(n);
  };
  const [editBoard, setEditBoard] = useState(false);
  const openBoard = (edit = false) => { setEditBoard(edit); setView("board"); };

  const sheets = (
    <>
      <NewPageSheet open={newOpen} onClose={() => setNewOpen(false)} onMade={(id) => open(id)} />
      {whoFor ? <WhoSheet activity={whoFor} onClose={() => setWhoFor(null)} /> : null}
      <ListSheet listId={ws.listId} onClose={() => ws.openList(null)} />
      {phone ? (
        <Sheet open={pagesOpen} onClose={() => setPagesOpen(false)} title="Notebook pages" size="full">
          <PagesList currentId={page?.id || null} onOpen={open} onNewPage={() => setNewOpen(true)} onPicked={() => setPagesOpen(false)} />
        </Sheet>
      ) : null}
    </>
  );

  if (!isFetched) {
    return <HouseScope tokens={tokens} className={`hn hn--${phone ? "phone" : "studio"}`} data-house-size={size}><LoadingBlock label="Loading the Notebook" /></HouseScope>;
  }

  const missing = view.kind === "page" && !page;
  let main;
  if (view.kind === "page" && page && view.layout) {
    main = <OwnLayout key={page.id} page={page} phone={phone} edit={editBoard} onBack={() => setView(null, { page: page.id })} />;
  } else if (view.kind === "page" && page) {
    main = <PageRoom key={page.id} page={page} phone={phone} onWho={setWhoFor}
      onLayout={(edit) => { setEditBoard(edit); setView("layout", { page: page.id }); }} />;
  } else if (view.kind === "notes") {
    main = (
      <section className="hn-boardwrap" aria-label="Notes & lists">
        <Panel className="hn-boardpanel" headingLevel={1} title="Notes & lists"
          tools={<Button rank="quiet" onClick={() => open(null)}>Back to the Notebook</Button>}>
          <div className="hn-old hn-boardbody"><NotesView onOpenNotebook={() => open(null)} /></div>
        </Panel>
      </section>
    );
  } else if (view.kind === "board") {
    main = <FrontBoard phone={phone} edit={editBoard} onBack={() => setView(null)} />;
  } else {
    main = (
      <Overview phone={phone} range={range} setRange={setRange} onWho={setWhoFor} onInfo={() => setInfoOpen(true)}
        onBoard={openBoard} onNew={() => setNewOpen(true)} onPages={() => setPagesOpen(true)} missing={missing}
        carry={ws.toCarry.length ? <CarryPanel toCarry={ws.toCarry} onCarry={ws.carry} carrying={ws.carrying} /> : null} />
    );
  }

  const info = (
    <NotebookInfo open={infoOpen} onClose={() => setInfoOpen(false)} onBoard={() => openBoard(false)} goals={goals} lists={lists} alters={alters} settings={settings} navigate={navigate} run={run} />
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hn hn--phone" data-house-size="phone" data-notebook-room="" data-tour="goals-page">
        <div className="hn-stack">
          {missing && view.kind === "page" ? <p className="hn-empty">That page isn't here any more. It may be in the trash.</p> : null}
          {main}
        </div>
        {info}
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hn hn--studio" data-house-size={size} data-notebook-room="" data-tour="goals-page">
      <aside className="hn-left" aria-label="Pages">
        <Panel className="hn-side" headingLevel={2} title="Pages" tools={<Button rank="quiet" onClick={() => setNewOpen(true)}>+ new page</Button>}>
          <div className="hn-side-body">
            <PagesList currentId={page?.id || null} onOpen={open} onNewPage={() => setNewOpen(true)} />
            <p className="hn-foot-note">Drag a page onto another to nest it (or Move, in its Info). Notes can be filed inside any page from their ⋯.</p>
          </div>
        </Panel>
      </aside>
      <section className="hn-main" aria-label={page?.title || "Notebook"}>
        {missing ? <p className="hn-empty">That page isn't here any more. It may be in the trash.</p> : null}
        {main}
      </section>
      {info}
      {sheets}
    </HouseScope>
  );
}

// ── The weekly-goals carry-over offer ───────────────────────────────

function CarryPanel({ toCarry, onCarry, carrying }) {
  const [hide, setHide] = useState(false);
  if (hide) return null;
  return (
    <Panel className="hn-carry" headingLevel={2} title="Keep the weekly goals here?">
      <div className="hn-pad hn-col">
        <p className="hn-note">
          {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
          {" "}can become goals that count up each week. The old weekly goals stay as they are.
        </p>
        <div className="hn-actions">
          <Button rank="primary" busy={carrying} onClick={onCarry}>Keep them as goals</Button>
          <Button rank="secondary" onClick={() => setHide(true)}>Not now</Button>
        </div>
      </div>
    </Panel>
  );
}

// ── The overview (boards 19 and 18) ─────────────────────────────────

function Overview({ phone, range, setRange, onWho, onInfo, onBoard, onNew, onPages, carry, missing }) {
  const nums = useNumbers(range);
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { alters, index, open, openList, openNotes } = useWorkspace();
  const { lists, byId: listsById } = useNoteLists();
  const [who, setWho] = useState(null);
  const [whoPick, setWhoPick] = useState(false);
  const ledger = useLedger(null, who);
  const [all, setAll] = useState(false);
  const colors = usePageColors();
  const measure = useMeasures();
  const whoOf = useWhoOf();

  const exportLedger = async () => {
    const csv = ledgerCsv(ledger, {
      pageName: (a) => (a.goal_id ? index.byId.get(a.goal_id)?.title || "Untitled" : listsById.get(a.study_list_id)?.name || ""),
      whoName: (a) => whoOf(a)?.label || "",
    });
    const res = await shareFile({ blob: new Blob([csv], { type: "text/csv" }), filename: `notebook-ledger-${format(new Date(), "yyyy-MM-dd")}.csv`, title: "Notebook ledger" });
    if (res?.result === "failed") showToast({ tone: "failed", message: "Couldn't save the file.", detail: "Nothing changed." });
  };
  const whoName = who === "__none" ? "not signed" : who ? formatAlter(alters.find((a) => a.id === who) || { name: "?" }) : null;
  const vs = VS_WORDS[range];

  // Phone: the room's header tools (+ for a new page; the rest in ⋯).
  const tools = useMemo(() => (phone ? {
    info: { label: "+", ariaLabel: "New page, note or deck", tour: "notebook-new", onSelect: onNew },
    items: [
      { id: "pages", label: "All pages…", onSelect: onPages },
      { id: "notes", label: "Notes & lists board", onSelect: openNotes },
      { id: "board", label: "Your Notebook board", onSelect: () => onBoard(false) },
      { id: "info", label: "Info: Notebook", onSelect: onInfo },
      { id: "export", label: "Export the ledger…", onSelect: exportLedger },
    ],
  } : null), [phone, ledger]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(phone ? tools : null);

  const ledgerPanel = (limit) => (
    <Panel className="hn-ledgerpanel" headingLevel={2} title="Ledger: everything that moved a page"
      tools={<>
        <Button rank={who ? "primary" : "quiet"} onClick={() => setWhoPick(true)} title={`Only what one ${t.alter} did`}>{whoName ? `By ${whoName}` : t.Alter}</Button>
        {ledger.length ? <Button rank="quiet" onClick={exportLedger}>export</Button> : null}
      </>}>
      <div data-tour="notebook-ledger">
        {ledger.length === 0 ? <p className="hn-empty">{who ? "Nothing by them here." : "Nothing yet. Time on a page, words written, and study sessions land here."}</p>
          : <LedgerTable rows={ledger} limit={all ? 500 : limit} onWho={onWho} />}
        {ledger.length > limit ? <Button rank="quiet" className="hn-more" onClick={() => setAll((v) => !v)}>{all ? "Fewer rows" : `All ${ledger.length} rows`}</Button> : null}
        <p className="hn-note hn-pad">Nothing here is typed twice: rows come from your activities, word counts and study sessions. Tap "By" to change who did it.</p>
      </div>
    </Panel>
  );
  const whoSheet = (
    <Sheet open={whoPick} onClose={() => setWhoPick(false)} size="half" title={`Only what one ${t.alter} did`}
      footer={<>
        <Button rank="secondary" onClick={() => { setWho("__none"); setWhoPick(false); }}>Not signed</Button>
        <Button rank="secondary" onClick={() => { setWho(null); setWhoPick(false); }}>Everyone</Button>
      </>}>
      <AlterPicker label={t.Alter} value={who && who !== "__none" ? who : null} alters={alters} showNone={false}
        onChange={(v) => { setWho(v || null); setWhoPick(false); }} />
    </Sheet>
  );

  if (phone) {
    const roots = rootPages(index).filter((p) => isOpenGoal(p));
    const loose = lists.filter((l) => !l.notebook_page_id || !index.byId.has(l.notebook_page_id));
    const rows = [
      ...roots.map((p) => ({ key: p.id, name: p.title || "Untitled", icon: p.icon, color: colors.color(p.id), m: measure.page(p), go: () => open(p.id) })),
      ...loose.map((l) => ({ key: `l-${l.id}`, name: l.name || "Untitled", color: isDeck(l) ? DECK_COLOR : LIST_COLOR, m: measure.list(l), go: () => openList(l.id) })),
    ];
    const vals = nums.spark.minutes;
    const max = Math.max(1, ...vals);
    const w = 340 / Math.max(1, vals.length);
    let area = "M0 40 ";
    let line = "";
    vals.forEach((v, i) => {
      const y = 36 - Math.round((v / max) * 30);
      area += `V${y} H${((i + 1) * w).toFixed(1)} `;
      line += `M${(i * w).toFixed(1)} ${y}h${w.toFixed(1)}v2h-${w.toFixed(1)}z`;
    });
    area += "V40 Z";
    return (
      <>
        {missing ? <p className="hn-empty">That page isn't here any more. It may be in the trash.</p> : null}
        <section className="hn-sum" aria-label="The Notebook, in numbers">
          <div className="hn-sum-top">
            <span className="hn-k house-label">{`${RANGE_WORDS[range][0].toUpperCase()}${RANGE_WORDS[range].slice(1)}, all pages`}</span>
            {vs ? <span className="hn-good hn-pf hn-small">{`${plusMinutes(nums.minutes - nums.prevMinutes)} ${vs.replace("vs last week", "vs last")}`}</span> : null}
          </div>
          <div className="hn-sum-main">
            <span className="hn-big">{formatMinutes(nums.minutes)}</span>
            <span className="hn-muted hn-pf">{`${nums.words.toLocaleString()} words · ${formatMinutes(nums.study)} study`}</span>
          </div>
          <svg width="100%" height="40" viewBox="0 0 340 40" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
            <path d={area} style={{ fill: "var(--house-accent)", fillOpacity: 0.35 }} /><path d={line} style={{ fill: "var(--house-accent)" }} />
          </svg>
          <RangeRow range={range} setRange={setRange} phone />
        </section>
        {carry}
        <Panel className="hn-phonepages" headingLevel={2} title="Pages" tools={<Button rank="quiet" onClick={onPages}>{`all ${rows.length}`}</Button>}>
          {rows.length === 0 ? (
            <EmptyBlock compact title="No pages yet" body="A page holds a goal, a project or a story: sections, notes, to-dos and trackers."
              action={{ label: "+ New page", onClick: onNew }} />
          ) : (
            <ul className="hn-tiles" data-tour="notebook-pages">
              {rows.slice(0, 8).map((r) => (
                <li key={r.key}>
                  <Button rank="quiet" className="hn-tile" onClick={r.go}>
                    <Swatch color={r.color} className="hn-letter">{r.icon || (r.name[0] || "?").toUpperCase()}</Swatch>
                    <span className="hn-tile-mid"><span className="hn-ell">{r.name}</span><Bar pct={r.m.pct} color={r.color} /></span>
                    <span className="hn-num hn-tile-val">{r.m.val}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 8 ? <Button rank="quiet" className="hn-more" onClick={onPages}>{`Show all ${rows.length}`}</Button> : null}
        </Panel>
        <Panel className="hn-recent" headingLevel={2} title="Recent" tools={<span className="hn-muted hn-small">ledger</span>}>
          <div data-tour="notebook-ledger">
            {ledger.length === 0 ? <p className="hn-empty">Nothing yet. Time on a page and study sessions land here.</p> : ledger.slice(0, all ? 50 : 4).map(({ a, when }, i) => {
              const pg = a.goal_id ? index.byId.get(a.goal_id) : null;
              const whoR = whoOf(a);
              return (
                <div key={a.id || i} className="hn-recent-row">
                  <span className="hn-recent-mark" style={{ background: pg ? colors.color(pg.id) : DECK_COLOR }} aria-hidden="true" />
                  <Button rank="quiet" className="hn-recent-what" onClick={() => (pg ? open(pg.id) : a.study_list_id && openList(a.study_list_id))}>
                    <span className="hn-ell">{a.activity_name || "Session"}</span>
                  </Button>
                  <Button rank="quiet" className="hn-recent-who" onClick={() => onWho(a)} aria-label={`By ${whoR ? whoR.label : "no one yet"}: change who did it`}>
                    <span className="hn-muted hn-small">{whenLabel(when)}{" · "}</span>
                    {whoR ? <span className="hn-small" style={whoR.color ? { color: whoR.color } : undefined}>{whoR.label}</span> : <i className="hn-muted hn-small">no one yet</i>}
                  </Button>
                  <span className="hn-num hn-good">{amountOf(a)}</span>
                </div>
              );
            })}
            {ledger.length > 4 ? <Button rank="quiet" className="hn-more" onClick={() => setAll((v) => !v)}>{all ? "Fewer" : `All ${ledger.length}`}</Button> : null}
          </div>
        </Panel>
        <Panel className="hn-phonemore" headingLevel={2} title="This week" collapsible defaultOpen={false}>
          <div className="hn-stack-in"><TargetsPanel /><DuePanel /><RepeatsPanel /></div>
        </Panel>
        {whoSheet}
      </>
    );
  }

  return (
    <div className="hn-over">
      <div className="hn-titlebar">
        <h1 className="sr-only">Notebook</h1>
        <span className="hn-flex" />
        <RangeRow range={range} setRange={setRange} />
        <Button rank="secondary" onClick={onInfo} data-tour="goals-info-btn">Info</Button>
        <span data-tour="notebook-layout-btn"><Button rank="secondary" onClick={() => onBoard(true)}>Edit page</Button></span>
      </div>
      <div className="hn-over-body">
        <StatCards nums={nums} range={range} />
        {carry}
        <div className="hn-split">
          <div className="hn-col hn-gap hn-minw0">
            <TimeChart nums={nums} range={range} />
            {ledgerPanel(7)}
          </div>
          <div className="hn-side-col">
            <TargetsPanel />
            <DuePanel />
            <RepeatsPanel />
            <span data-tour="notebook-tabs"><Button rank="quiet" className="hn-dashed" onClick={() => onBoard(true)}>+ Add to this page</Button></span>
          </div>
        </div>
      </div>
      {whoSheet}
    </div>
  );
}

// ── Info: the Notebook (the overview's Info door) ───────────────────

function NotebookInfo({ open, onClose, onBoard, goals, lists, navigate }) {
  const { ctx, openNotes } = useWorkspace();
  const xp = useGoalXp();
  const live = goals.filter((g) => !g.removed_at && !g.trashed_at);
  const tops = live.filter((g) => !g.parent_id);
  const finished = tops.filter((g) => !isOpenGoal(g)).length;
  const decks = lists.filter(isDeck).length;
  const { start } = goalWeekWindow(new Date());
  const weekXp = xp.on ? sumXp(xp.events, { from: format(start, "yyyy-MM-dd") }) : 0;
  const allMin = useMemo(() => (ctx.activities || []).filter((a) => a?.goal_id && !a.trashed_at).reduce((n, a) => n + (Number(a.duration_minutes) || 0), 0), [ctx.activities]);
  const facts = [
    ["Pages", `${tops.length - finished} going, ${finished} finished`],
    ["Sections inside them", String(live.length - tops.length)],
    ["Notes & lists", String(lists.length - decks)],
    ["Flash-card decks", String(decks)],
    ["Time on pages, all time", formatMinutes(allMin)],
    ["Goal XP this week", xp.on ? `${weekXp} XP` : "Off"],
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Info: Notebook" size="half">
      <div className="hn-sheet-body">
        <dl className="hn-facts">{facts.map(([k, v]) => <div key={k} className="hn-fact"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="hn-old"><GoalsXpSwitch /></div>
        <div className="hn-actions">
          <Button rank="secondary" onClick={() => { onClose(); openNotes(); }}>Notes & lists board</Button>
          <Button rank="secondary" onClick={() => { onClose(); onBoard(); }}>Your Notebook board</Button>
          <Button rank="secondary" onClick={() => navigate("/settings#privacy-cover")}>Quick taps & privacy screen</Button>
        </div>
        <p className="hn-muted hn-small">Balances and the ledger are read from your pages, activities, lists and study sessions. Nothing is typed twice.</p>
      </div>
    </Sheet>
  );
}

// ── The person's own boards, kept as they are ───────────────────────

function FrontBoard({ phone, edit, onBack }) {
  const boardPage = useProfilePageState(NOTEBOOK_PAGES);
  useEditWhenShown(boardPage.layoutEditing, edit);
  return (
    <section className="hn-boardwrap" aria-label="Your Notebook board">
      <Panel className="hn-boardpanel" headingLevel={1} title="Your Notebook board"
        tools={<>
          <Button rank="secondary" onClick={openPageLayoutEditor}>{boardPage.layoutEditing ? "Editing" : "Edit page"}</Button>
          <Button rank="quiet" onClick={onBack}>{phone ? "Back" : "Back to the overview"}</Button>
        </>}>
        <p className="hn-note hn-pad">Your own board: Add a goal, the goal cards and anything you put here. It stays as you laid it out.</p>
        <div className="hn-old hn-boardbody">
          <PageBoardCanvas pageId="notebook" pages={NOTEBOOK_PAGES} page={boardPage} pageIcons={NOTEBOOK_ICONS} />
        </div>
      </Panel>
    </section>
  );
}

function OwnLayout({ page, phone, edit, onBack }) {
  const boardPage = useProfilePageState(GOAL_PAGE_PAGES);
  useEditWhenShown(boardPage.layoutEditing, edit);
  return (
    <section className="hn-boardwrap" aria-label={`${page.title || "Page"}: your own layout`} data-highlight-id={page.id}>
      <Panel className="hn-boardpanel" headingLevel={1} title={`${page.title || "Untitled"}: your own layout`}
        tools={<>
          <Button rank="secondary" onClick={openPageLayoutEditor} data-tour="goals-layout-btn">{boardPage.layoutEditing ? "Editing" : "Edit page"}</Button>
          <Button rank="quiet" onClick={onBack}>{phone ? "Back" : "Back to the page"}</Button>
        </>}>
        <div className="hn-old hn-boardbody">
          <GoalPageContext.Provider value={page}>
            <PageBoardCanvas pageId={goalBoardPageId(page.id)} pages={GOAL_PAGE_PAGES} page={boardPage} registry={GOAL_PAGE_REGISTRY} />
          </GoalPageContext.Provider>
        </div>
      </Panel>
    </section>
  );
}

// ── A page (boards 20 and the phone's stack) ────────────────────────

function PageRoom({ page, phone, onWho, onLayout }) {
  const { index, steps, run, busy, open, showTag } = useWorkspace();
  const { lists } = useNoteLists();
  const colors = usePageColors();
  const sessions = useActiveSessions();
  const running = runningOnPage(page.id, sessions);
  const working = running.length > 0;
  const own = useHasOwnBoard(goalBoardPageId(page.id));
  const xp = useGoalXp();
  const pageIds = useMemo(() => [page.id, ...descendantIds(index, page.id)], [index, page.id]);
  const ledger = useLedger(pageIds);
  const whoOf = useWhoOf();
  const [all, setAll] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [icon, setIcon] = useState(page.icon || "");
  const [dateOpen, setDateOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const isTop = !index.parent.get(page.id);
  const crumbs = ancestorsOf(index, page.id).reverse();
  const viewId = ["outline", "board", "map"].includes(page.view) ? page.view : "outline";
  const status = page.status ? goalStatusLabel(page.status) : "No status";
  const filedHere = notesFiledIn(lists, page.id, index);
  const shares = useMemo(() => { const r = whoShares(ledger, whoOf); return { total: r.total, rows: r.rows.slice(0, 4) }; }, [ledger, whoOf]);
  const pageXp = useMemo(() => {
    if (!xp.on) return null;
    const ids = new Set(pageIds);
    const n = (xp.events || []).filter((e) => ids.has(e.goalId)).reduce((s, e) => s + (e.xp || 0), 0);
    return n ? `This page has earned ${n} XP for the recurring-tasks level.` : "Ticks, tracked activities and reaching it earn XP for the recurring-tasks level.";
  }, [xp.on, xp.events, pageIds]);

  const work = () => run(() => (working ? Promise.all(running.map((s) => stopPageActivity(s))) : startPageActivity(page, null)), working ? "Logged" : null);
  const remove = async () => {
    setDeleting(false);
    setInfoOpen(false);
    const parent = index.parent.get(page.id) || null;
    await run(() => deletePage(index, steps, page.id), "Moved to the trash");
    open(parent);
  };

  // Phone: Info in the header, the rest in ⋯, Work on it · Edit page as the room's bar.
  const bar = useMemo(() => (phone ? (
    <div className="hn-roombar">
      <Button rank={working ? "secondary" : "primary"} onClick={work} busy={busy}>{working ? "Stop working" : "Work on it"}</Button>
      <Button rank="secondary" onClick={() => onLayout(true)}>Edit page</Button>
    </div>
  ) : null), [phone, working, busy, page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tools = useMemo(() => (phone ? {
    info: { label: "Info", ariaLabel: "Info: this page", pressed: infoOpen, tour: "goals-info-btn", onSelect: () => setInfoOpen((o) => !o) },
    items: [
      { id: "layout", label: own ? "Your own layout" : "Lay this page out yourself", onSelect: () => onLayout(false) },
      { id: "move", label: "Move to…", onSelect: () => setMoving(true) },
      { id: "pin", label: page.pinned ? "Unpin from Pages" : "Pin to Pages", onSelect: () => run(() => updatePage(page.id, { pinned: !page.pinned })) },
      { id: "up", label: "Back to the Notebook", onSelect: () => open(null) },
      { id: "delete", label: `Delete "${page.title || "this page"}"`, danger: true, onSelect: () => setDeleting(true) },
    ],
    bar,
  } : null), [phone, infoOpen, own, page.pinned, page.title, bar]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(phone ? tools : null);

  const head = (
    <header className="hn-pagehead" data-tour="notebook-page-head">
      <div className="hn-pagehead-row">
        <nav aria-label="Where this page is" className="hn-crumbs">
          <Button rank="quiet" onClick={() => open(null)}>Notebook</Button>
          {crumbs.map((c) => (
            <React.Fragment key={c.id}>
              <span aria-hidden="true">›</span>
              <Button rank="quiet" onClick={() => open(c.id)}>{c.title || "Untitled"}</Button>
            </React.Fragment>
          ))}
          <span aria-hidden="true">›</span>
        </nav>
        <Button rank="quiet" className="hn-iconsq" style={{ background: colors.color(page.id) }} aria-label={page.icon ? "Change the icon" : "Choose an icon"}
          onClick={() => { setIcon(page.icon || ""); setIconOpen(true); }}>{page.icon || (page.title || "?")[0].toUpperCase()}</Button>
        <h1 className="hn-pagetitle house-label">{page.title || "Untitled"}</h1>
        <Menu label={`Status: ${status}`} rank="secondary" items={[
          ...GOAL_STATUSES.map((st) => ({ id: st.id, label: st.label, onSelect: () => run(() => setGoalStatus(page, st.id), st.id === "done" ? "Reached 🎉" : null) })),
          ...(!isTop ? [{ id: "none", label: "No status", onSelect: () => run(() => updatePage(page.id, { status: null })) }] : []),
        ]}>{status}</Menu>
        <Button rank="secondary" onClick={() => setDateOpen(true)}>{page.target_date ? `by ${format(new Date(`${page.target_date}T12:00:00`), "MMM d")}` : "by…"}</Button>
        {pageTags(page).map((tg) => <Button key={tg} rank="quiet" className="hn-tag" onClick={() => showTag(tg)}>{`#${tg}`}</Button>)}
        <Button rank="secondary" onClick={() => setTagsOpen(true)}>+ Tag</Button>
        {phone ? null : (
          <>
            <span className="hn-flex" />
            <Button rank={working ? "secondary" : "primary"} onClick={work} busy={busy}>{working ? "Stop working" : "Work on it"}</Button>
            <Button rank={infoOpen ? "primary" : "secondary"} aria-pressed={infoOpen} data-tour="goals-info-btn" onClick={() => setInfoOpen((o) => !o)}>Info</Button>
            <span data-tour="goals-layout-btn"><Button rank="secondary" onClick={() => onLayout(true)}>Edit page</Button></span>
            <Menu label={`More for ${page.title || "this page"}`} rank="quiet" items={[
              { id: "layout", label: own ? "Your own layout" : "Lay this page out yourself", onSelect: () => onLayout(false) },
              { id: "move", label: "Move to…", onSelect: () => setMoving(true) },
              { id: "pin", label: page.pinned ? "Unpin from Pages" : "Pin to Pages", onSelect: () => run(() => updatePage(page.id, { pinned: !page.pinned })) },
              { id: "delete", label: `Delete "${page.title || "this page"}"`, danger: true, onSelect: () => setDeleting(true) },
            ]} />
          </>
        )}
      </div>
      <MeasureRow page={page} pageIds={pageIds} />
    </header>
  );

  const lines = (
    <Panel className="hn-lines" headingLevel={2} title="Page"
      tools={(
        <span className="hn-ranges hn-ranges--tiny" role="group" aria-label="Show the page as">
          {LINE_VIEWS.map((v) => (
            <Button key={v.id} rank={viewId === v.id ? "primary" : "secondary"} aria-pressed={viewId === v.id}
              onClick={() => { if (viewId !== v.id) run(() => updatePage(page.id, { view: v.id })); }}>{v.label}</Button>
          ))}
        </span>
      )}>
      <div className="hn-old hn-scroll hn-pad" data-tour="page-add-line">
        {viewId === "outline" ? <EntryList pageId={page.id} page={page} /> : null}
        {viewId === "board" ? <BoardView page={page} /> : null}
        {viewId === "map" ? <MapView page={page} /> : null}
      </div>
    </Panel>
  );
  const weekRows = ledger.filter((r) => r.when >= goalWeekWindow(new Date()).start);
  const weekWords = weekRows.reduce((n, r) => n + (Number(r.a.words_written) || 0), 0);
  const note = (
    <Panel className="hn-notepanel" headingLevel={2} title={page.title || "Note"}
      tools={!noteEditing ? <Button rank="quiet" onClick={() => setNoteEditing(true)}>{page.why ? "edit" : "write"}</Button> : null}>
      <div className="hn-old hn-paper"><PageNote page={page} editing={noteEditing} setEditing={setNoteEditing} emptyPrompt /></div>
      <div className="hn-notestatus house-label" role="status">
        {page.updated_date ? <span>{`Saved ${format(new Date(page.updated_date), "h:mm a")}`}</span> : null}
        {weekWords > 0 ? <span className="hn-good">{`+${weekWords.toLocaleString()} this week`}</span> : null}
        {own ? <span>Your own layout is kept (⋯)</span> : null}
        <span className="hn-flex" />
        <span>{filedHere.length ? `notes filed here (${filedHere.length})` : "no notes filed here"}</span>
      </div>
    </Panel>
  );
  const ledgerPanel = (
    <Panel className="hn-pageledger" headingLevel={2} title="Ledger for this page"
      tools={ledger.length > 3 ? <Button rank="quiet" onClick={() => setAll((v) => !v)}>{all ? "fewer" : `all ${ledger.length} rows`}</Button> : null}>
      {ledger.length === 0 ? <p className="hn-empty">Nothing logged on this page yet. Work on it times a session.</p>
        : <LedgerTable rows={ledger} limit={all ? 500 : 3} showPage={false} compact onWho={onWho} />}
      {shares.total > 0 ? (
        <div className="hn-shares">
          <span className="hn-muted">Who's put time in</span>
          <span className="hn-sharebar" aria-hidden="true">
            {shares.rows.map((r) => <span key={r.id} style={{ width: `${(r.mins / shares.total) * 100}%`, background: r.color || "var(--house-muted)" }} />)}
          </span>
          {shares.rows.map((r) => <span key={r.id} className={r.color ? "" : "hn-muted"} style={r.color ? { color: r.color } : undefined}>{r.label}</span>)}
        </div>
      ) : null}
    </Panel>
  );
  const linked = (
    <Panel className="hn-linked" headingLevel={2} title="Linked here">
      <div className="hn-old hn-pad"><Connections page={page} bare emptyText="Nothing links here yet. Add a Link line, or type [[a page's title]] in a note." /></div>
    </Panel>
  );
  const workPanel = (
    <Panel className="hn-work" headingLevel={2} title="Work on it">
      <div className="hn-old hn-pad"><ActivityStrip page={page} bare /></div>
    </Panel>
  );
  const filedPanel = filedHere.length ? (
    <Panel className="hn-filed" headingLevel={2} title="Filed here">
      <div className="hn-old hn-pad"><FiledNotesList pageId={page.id} /></div>
    </Panel>
  ) : null;

  const sheets = (
    <>
      <div className="hn-old">
        <PageInfoSheet page={page} open={infoOpen} onClose={() => setInfoOpen(false)}
          onMove={() => { setInfoOpen(false); setMoving(true); }} onDelete={() => setDeleting(true)} />
        {moving ? (
          <MovePageDialog open title={`Move "${page.title || "page"}" to…`} movingPageId={page.id} allowTop
            currentId={index.parent.get(page.id) || null} onClose={() => setMoving(false)}
            onPick={(target) => {
              setMoving(false);
              run(() => movePage(index, page.id, target, target ? orderAfter(pageEntries(index, steps, target)) : null), "Moved");
            }} />
        ) : null}
      </div>
      <ConfirmSheet open={deleting} thing={`"${page.title || "this page"}"`} onConfirm={remove} onCancel={() => setDeleting(false)}
        detail={`It goes to the trash${descendantIds(index, page.id).length ? " with the sections inside it" : ""}, its lines and the to-dos made on it. You can put it all back from the trash.`} />
      <Sheet open={iconOpen} onClose={() => setIconOpen(false)} size="half" title="Icon"
        footer={<Button rank="primary" onClick={() => { setIconOpen(false); run(() => updatePage(page.id, { icon: String(icon).trim().slice(0, 8) || null })); }}>Save</Button>}>
        <TextField label="An emoji for this page (leave it empty for none)" value={icon} onChange={setIcon} autoFocus />
      </Sheet>
      <Sheet open={dateOpen} onClose={() => setDateOpen(false)} size="half" title="Aiming for">
        <DateField label="By" value={page.target_date || null} clearable
          onChange={(v) => { setDateOpen(false); run(() => updatePage(page.id, { target_date: v || null })); }} />
      </Sheet>
      <Sheet open={tagsOpen} onClose={() => setTagsOpen(false)} size="half" title={`Tags for "${page.title || "Untitled"}"`}>
        <div className="hn-old"><TagEditorBody page={page} autoFocus /></div>
      </Sheet>
    </>
  );

  if (phone) {
    return (
      <article className="hn-page" data-highlight-id={page.id}>
        {head}
        {lines}
        {note}
        {ledgerPanel}
        <PointsPanel page={page} xp={pageXp} />
        {linked}
        {workPanel}
        {filedPanel}
        {sheets}
      </article>
    );
  }
  return (
    <article className="hn-page hn-page--studio" data-highlight-id={page.id}>
      {head}
      <div className="hn-pagegrid">
        {lines}
        <div className="hn-col hn-gap hn-minw0">{note}{ledgerPanel}</div>
        <div className="hn-col hn-gap hn-minw0">
          {linked}
          <PointsPanel page={page} xp={pageXp} />
          {workPanel}
          {filedPanel}
        </div>
      </div>
      {sheets}
    </article>
  );
}
