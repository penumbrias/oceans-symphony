// The Notebook room's pieces (boards 18, 19 and 20), drawn with the house
// kit. Every number comes from notebookModel.js; every write goes through
// the workspace's `run` and the existing write paths (goalTree.js,
// goalStarters.js, goals.js, noteLists.js, goalActivities.js,
// activityWho.js). Old insides reused here sit in `.hn-old` boxes.

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { TextField } from "@/house/kit/Field";
import Menu from "@/house/kit/Menu";
import { Sheet } from "@/house/kit/Sheet";
import { showToast } from "@/house/kit/Toast";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useNoteLists, useNoteListWriters, filedPageOf, notesFiledIn, isDeck, listLabel } from "@/lib/noteLists";
import {
  rootPages, childPages, ancestorsOf, flattenPages, createPage, orderAfter, movePage, wouldNest, pageEntries,
  MAX_PAGE_DEPTH, formatMinutes,
} from "@/lib/goalTree";
import { createStoryPage } from "@/lib/goalStarters";
import { isOpenGoal } from "@/lib/goals";
import { allPageTags, pageHasTag, pageTags } from "@/lib/goalWriting";
import { goalWeekStartsOn } from "@/lib/goalCounting";
import { activityWhoIds, setActivityWho } from "@/lib/activityWho";
import { useWorkspace } from "@/components/goals/workspace/WorkspaceContext";
import MovePageDialog from "@/components/goals/workspace/MovePageDialog";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import {
  pageColorsOf, notebookNumbers, chartSeries, ledgerRows, whenLabel, amountOf, pageMeasure, listMeasure,
  weeklyTargets, weekPace, comingDue, dueWhen, repeatRows, pagePoints, pageProgress, plusMinutes, plusNum,
  RANGES, VS_WORDS, RANGE_WORDS, LIST_COLOR, DECK_COLOR, OTHER_COLOR,
} from "@/house/notebook/notebookModel";

const fail = (e, what = "That didn't save.") => showToast({ tone: "failed", message: e?.message || what, detail: "Nothing changed." });
const newestFirst = (a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""));

// ── Shared reading ──────────────────────────────────────────────────

export function usePageColors() {
  const { index } = useWorkspace();
  return useMemo(() => pageColorsOf(index), [index]);
}

/** Who did an activity, in the person's labels: { id, label, color } or null. */
export function useWhoOf() {
  const { alters } = useWorkspace();
  const formatAlter = useAlterLabel();
  return useMemo(() => {
    const byId = new Map((alters || []).map((x) => [x.id, x]));
    return (a) => {
      const who = activityWhoIds(a).map((id) => byId.get(id)).filter(Boolean);
      if (!who.length) return null;
      return { id: who[0].id, label: who.map((x) => formatAlter(x)).join(", "), color: who[0].color || null };
    };
  }, [alters, formatAlter]);
}

export function useNumbers(range) {
  const { ctx, index } = useWorkspace();
  const { items, lists } = useNoteLists();
  return useMemo(() => notebookNumbers({
    activities: ctx.activities, index, lists, itemsOf: items, range, now: new Date(), weekStartsOn: goalWeekStartsOn(),
  }), [ctx.activities, index, lists, items, range]);
}

export function useLedger(pageIds = null, who = null) {
  const { ctx, index } = useWorkspace();
  const { lists } = useNoteLists();
  const deckIds = useMemo(() => new Set(lists.filter(isDeck).map((l) => l.id)), [lists]);
  return useMemo(() => ledgerRows({ activities: ctx.activities, index, deckIds, pageIds, who, whoIds: activityWhoIds }),
    [ctx.activities, index, deckIds, pageIds, who]);
}

export function useMeasures() {
  const { index, steps, ctx } = useWorkspace();
  const { items } = useNoteLists();
  return {
    page: (p) => pageMeasure(p, { index, steps, ctx }),
    list: (l) => listMeasure(l, items(l.id)),
  };
}

// ── Small pieces ────────────────────────────────────────────────────

export const Swatch = ({ color, size, children = null, className = "" }) => (
  <span className={`hn-sw ${className}`} style={{ background: color, ...(size ? { width: size, height: size } : null) }} aria-hidden="true">{children}</span>
);

export const Bar = ({ pct, color, tall = false, pace = null }) => (
  <span className={`hn-bar${tall ? " hn-bar--tall" : ""}`} aria-hidden="true">
    <span className="hn-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, background: color }} />
    {pace != null ? <span className="hn-bar-pace" style={{ left: `${Math.max(0, Math.min(100, pace))}%` }} /> : null}
  </span>
);

function Spark({ values, color }) {
  const n = Math.max(1, values.length);
  const max = Math.max(1, ...values);
  const w = 120 / n;
  const d = values.map((v, i) => {
    const h = v > 0 ? Math.max(2, Math.round((v / max) * 20)) : 1;
    return `M${(i * w).toFixed(1)} ${22 - h}h${Math.max(0.5, w - 2).toFixed(1)}v${h}h-${Math.max(0.5, w - 2).toFixed(1)}z`;
  }).join("");
  return (
    <svg className="hn-spark" width="100%" height="22" viewBox="0 0 120 22" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fill={color} />
    </svg>
  );
}

/** The range row: This week · 1M · 6M · 1Y · All time (one radio row). */
export function RangeRow({ range, setRange, phone = false }) {
  return (
    <div className="hn-ranges" role="group" aria-label="Range" data-tour="notebook-ranges">
      {RANGES.map((r) => (
        <Button key={r.id} rank={range === r.id ? "primary" : "secondary"} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
          {phone ? r.short : r.label}
        </Button>
      ))}
    </div>
  );
}

// ── Pages (left on a computer, a sheet on a phone) ──────────────────

function PageRow({ page, depth, currentId, expanded, toggle, onOpen, seen, ctx }) {
  const { index, steps, run } = useWorkspace();
  if (seen.has(page.id) || depth > MAX_PAGE_DEPTH) return null;
  const nextSeen = new Set(seen); nextSeen.add(page.id);
  const kids = childPages(index, page.id);
  const notesHere = notesFiledIn(ctx.noteLists, page.id, index);
  const has = kids.length + notesHere.length > 0;
  const isOpen = expanded.has(page.id);
  const here = page.id === currentId;
  const color = ctx.colors.color(page.id);
  const m = ctx.measure.page(page);
  const muted = page.status === "done" || page.status === "let_go";
  // Drag a page onto another to nest it (a mouse; Move in Info does it anywhere).
  const drop = {
    onDragOver: (e) => { const id = ctx.dragging; if (id && id !== page.id && !wouldNest(index, id, page.id)) { e.preventDefault(); e.currentTarget.dataset.drop = "1"; } },
    onDragLeave: (e) => { delete e.currentTarget.dataset.drop; },
    onDrop: (e) => {
      delete e.currentTarget.dataset.drop;
      const id = ctx.dragging;
      ctx.setDragging(null);
      if (!id || id === page.id || wouldNest(index, id, page.id)) return;
      e.preventDefault();
      run(() => movePage(index, id, page.id, orderAfter(pageEntries(index, steps, page.id))), `Moved into "${page.title || "Untitled"}"`);
    },
  };
  return (
    <li>
      <div className="hn-prow" data-selected={here || undefined} style={{ paddingLeft: `${0.375 + depth * 1.125}rem` }}
        draggable onDragStart={() => ctx.setDragging(page.id)} onDragEnd={() => ctx.setDragging(null)} {...drop}>
        <span className="hn-prow-top">
          {has
            ? <IconButton icon={isOpen ? ChevronDown : ChevronRight} label={`${isOpen ? "Fold" : "Show inside"} ${page.title || "Untitled"}`} aria-expanded={isOpen} className="hn-fold" onClick={() => toggle(page.id)} />
            : <Swatch color={color} />}
          <Button rank="quiet" className={`hn-prow-name${muted ? " hn-muted" : ""}`} aria-current={here ? "page" : undefined} onClick={() => onOpen(page.id)}>
            {page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"}
          </Button>
          {m.val ? <span className="hn-num">{m.val}</span> : null}
        </span>
        {m.val ? <Bar pct={m.pct} color={color} /> : null}
      </div>
      {isOpen && has ? (
        <ul className="hn-plist">
          {kids.map((k) => <PageRow key={k.id} page={k} depth={depth + 1} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen} seen={nextSeen} ctx={ctx} />)}
          {notesHere.map((l) => <ListRow key={`f-${l.id}`} list={l} depth={depth + 1} ctx={ctx} />)}
        </ul>
      ) : null}
    </li>
  );
}

function ListRow({ list, depth = 0, ctx, onPicked }) {
  const { index } = useWorkspace();
  const m = ctx.measure.list(list);
  const color = isDeck(list) ? DECK_COLOR : LIST_COLOR;
  const filed = filedPageOf(list, index);
  const menu = list.source === "local" ? null : (
    <Menu label={`Options for ${listLabel(list)}`} rank="quiet" items={[
      { id: "file", label: filed ? "Move to another page…" : "File in a page…", onSelect: () => ctx.setFiling(list) },
      ...(filed ? [{ id: "out", label: "Take out of this page", onSelect: () => ctx.fileIn(list, null) }] : []),
    ]} />
  );
  return (
    <li>
      <div className="hn-prow" style={{ paddingLeft: `${0.375 + depth * 1.125}rem` }}>
        <span className="hn-prow-top">
          <Swatch color={color} />
          <Button rank="quiet" className="hn-prow-name" onClick={() => { ctx.openList(list.id); onPicked?.(); }}>{list.name || "Untitled"}</Button>
          <span className="hn-num">{m.val}</span>
          {menu}
        </span>
        <Bar pct={m.pct} color={color} />
      </div>
    </li>
  );
}

function GroupHead({ name, count, onOpen, action, open, onToggle }) {
  return (
    <li className="hn-ghead">
      {onToggle ? <IconButton icon={open ? ChevronDown : ChevronRight} label={`${open ? "Fold" : "Show"} ${name}`} aria-expanded={!!open} className="hn-fold" onClick={onToggle} /> : null}
      {onOpen ? <Button rank="quiet" className="hn-ghead-name" onClick={onOpen}>{name}</Button> : <span className="hn-ghead-name house-label">{name}</span>}
      {action}
      <span className="hn-count">{count}</span>
    </li>
  );
}

/** The Pages list: search, tags, pinned, goals (nested), finished, notes & lists, flash cards. */
export function PagesList({ currentId, onOpen, onNewPage, onPicked }) {
  const { index, goals, tag, showTag, openList, openNotes, run } = useWorkspace();
  const { lists: noteLists } = useNoteLists();
  const { createNote, fileInPage } = useNoteListWriters();
  const colors = usePageColors();
  const measure = useMeasures();
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(() => new Map());
  const [showFinished, setShowFinished] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [filing, setFiling] = useState(null);
  const autoOpen = useMemo(() => new Set(currentId ? [currentId, ...ancestorsOf(index, currentId).map((p) => p.id)] : []), [index, currentId]);
  const expanded = useMemo(() => {
    const s = new Set(autoOpen);
    for (const [id, on] of manual) { if (on) s.add(id); else s.delete(id); }
    return s;
  }, [autoOpen, manual]);
  const toggle = (id) => setManual((m) => new Map(m).set(id, !expanded.has(id)));
  const go = (id) => { onOpen(id); onPicked?.(); };

  const roots = rootPages(index);
  const openRoots = roots.filter((p) => isOpenGoal(p));
  const finished = roots.filter((p) => !isOpenGoal(p));
  const pinned = useMemo(() => flattenPages(index).map((r) => r.page).filter((p) => p.pinned), [index]);
  const loose = useMemo(() => noteLists.filter((l) => !filedPageOf(l, index)).sort(newestFirst), [noteLists, index]);
  const notes = loose.filter((l) => !isDeck(l));
  const decks = loose.filter((l) => isDeck(l));
  const tags = useMemo(() => allPageTags(goals), [goals]);

  const want = q.trim().toLowerCase();
  const tagOnly = want.startsWith("#");
  const wantTag = want.replace(/^#+/, "");
  const hits = tag
    ? flattenPages(index).filter((r) => pageHasTag(r.page, tag))
    : want ? flattenPages(index).filter((r) => (!tagOnly && String(r.page.title || "").toLowerCase().includes(want))
      || (wantTag && pageTags(r.page).some((t) => t.toLowerCase().includes(wantTag)))) : [];
  const noteHits = want && !tagOnly && !tag ? noteLists.filter((l) => String(l.name || "").toLowerCase().includes(want)).sort(newestFirst) : [];

  const fileIn = async (list, pageId) => {
    setFiling(null);
    try {
      await fileInPage(list, pageId);
      const page = pageId ? index.byId.get(pageId) : null;
      showToast({ message: page ? `Filed in "${page.title || "Untitled"}"` : "Back in Notes & lists" });
    } catch (e) { fail(e, "Couldn't move that."); }
  };
  const newList = async (type) => {
    const made = await run(() => createNote(undefined, type));
    if (made?.id) { openList(made.id); onPicked?.(); }
  };
  const ctx = { noteLists, colors, measure, dragging, setDragging, openList, setFiling, fileIn };
  const rowProps = { currentId, expanded, toggle, onOpen: go, seen: new Set(), ctx };

  return (
    <nav aria-label="Notebook pages" className="hn-pages" data-tour="notebook-pages">
      <div className="hn-find">
        <TextField label="Find a page" value={q} onChange={setQ} placeholder="Pages, notes and #tags" type="search" />
      </div>
      {tags.length > 0 && !want ? (
        <div className="hn-tags" role="group" aria-label="Tags">
          {tags.map(({ tag: t, count }) => {
            const on = !!tag && t.toLowerCase() === tag.toLowerCase();
            return <Button key={t} rank={on ? "primary" : "quiet"} aria-pressed={on} className="hn-tag" onClick={() => showTag(on ? null : t)}>{`#${t} ${count}`}</Button>;
          })}
        </div>
      ) : null}
      {want || tag ? (
        <ul className="hn-plist">
          {tag && !want ? <GroupHead name={`Tagged #${tag}`} count="" action={<Button rank="quiet" onClick={() => showTag(null)}>show all</Button>} /> : null}
          {hits.map(({ page }) => {
            const path = ancestorsOf(index, page.id).reverse().map((p) => p.title || "Untitled").join(" > ");
            return (
              <li key={page.id}>
                <Button rank="quiet" className="hn-hit" data-selected={page.id === currentId || undefined} onClick={() => { go(page.id); setQ(""); }}>
                  <Swatch color={colors.color(page.id)} />
                  <span className="hn-hit-text"><span>{page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"}</span>{path ? <span className="hn-muted hn-small">{path}</span> : null}</span>
                </Button>
              </li>
            );
          })}
          {noteHits.map((l) => <ListRow key={`n-${l.id}`} list={l} ctx={ctx} onPicked={() => { setQ(""); onPicked?.(); }} />)}
          {hits.length === 0 && noteHits.length === 0 ? <li className="hn-empty">Nothing matches.</li> : null}
        </ul>
      ) : (
        <ul className="hn-plist">
          {pinned.length > 0 ? (
            <>
              <GroupHead name="Pinned" count={pinned.length} />
              {pinned.map((p) => (
                <li key={`pin-${p.id}`}>
                  <Button rank="quiet" className="hn-hit" data-selected={p.id === currentId || undefined} onClick={() => go(p.id)}>
                    <Swatch color={colors.color(p.id)} /><span className="hn-hit-text"><span>{p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}</span></span>
                  </Button>
                </li>
              ))}
            </>
          ) : null}
          <GroupHead name="Goals" count={openRoots.length} onOpen={() => go(null)} />
          {openRoots.length ? openRoots.map((p) => <PageRow key={p.id} page={p} depth={0} {...rowProps} />)
            : <li className="hn-empty">No goals yet. <Button rank="quiet" onClick={onNewPage}>+ new page</Button></li>}
          {finished.length > 0 ? (
            <>
              <GroupHead name="Finished" count={finished.length} open={showFinished} onToggle={() => setShowFinished((v) => !v)} />
              {showFinished ? finished.map((p) => <PageRow key={p.id} page={p} depth={0} {...rowProps} />) : null}
            </>
          ) : null}
          <GroupHead name="Notes & lists" count={notes.length} onOpen={() => { openNotes(); onPicked?.(); }}
            action={<span data-tour="goals-new-note-btn"><Button rank="quiet" aria-label="New note" onClick={() => newList("note")}>+ new</Button></span>} />
          {notes.length ? notes.map((l) => <ListRow key={`${l.source || "db"}-${l.id}`} list={l} ctx={ctx} onPicked={onPicked} />)
            : <li className="hn-empty">{noteLists.length ? "Every note is filed in a page." : "No notes or lists yet."}</li>}
          <GroupHead name="Flash cards" count={decks.length} onOpen={() => { openNotes(); onPicked?.(); }}
            action={<Button rank="quiet" aria-label="New flash-card deck" onClick={() => newList("flashcards")}>+ new</Button>} />
          {decks.length ? decks.map((l) => <ListRow key={`${l.source || "db"}-${l.id}`} list={l} ctx={ctx} onPicked={onPicked} />)
            : <li className="hn-empty">No decks yet.</li>}
        </ul>
      )}
      {filing ? (
        <div className="hn-old">
          <MovePageDialog open title={`File "${listLabel(filing)}" in…`} allowTop topLabel="Notes & lists (no page)"
            currentId={filedPageOf(filing, index)} onClose={() => setFiling(null)} onPick={(pid) => fileIn(filing, pid)} />
        </div>
      ) : null}
    </nav>
  );
}

// ── New page (+ new page, ?new=1, the phone's +) ────────────────────

export function NewPageSheet({ open, onClose, onMade }) {
  const { index, run, openList } = useWorkspace();
  const { createNote } = useNoteListWriters();
  const [name, setName] = useState("");
  const close = () => { setName(""); onClose(); };
  const order = () => orderAfter(rootPages(index).map((rec) => ({ rec })));
  const make = async (story = false) => {
    const v = name.trim();
    if (!v && !story) return;
    const made = await run(() => (story ? createStoryPage({ title: v, order: order() }) : createPage({ title: v, order: order() })));
    if (made?.id) { close(); onMade?.(made.id); }
  };
  const list = async (type) => {
    const made = await run(() => createNote(name.trim() || undefined, type));
    if (made?.id) { close(); openList(made.id); }
  };
  return (
    <Sheet open={open} onClose={close} title="New in the Notebook" size="half"
      footer={<Button rank="primary" disabledReason={name.trim() ? undefined : "Give it a name first"} onClick={() => make(false)}>Make the page</Button>}>
      <div className="hn-sheet-body">
        <TextField label="What's it called?" value={name} onChange={setName} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") make(false); }} />
        <div className="hn-actions">
          <span data-tour="goals-story-btn"><Button rank="secondary" onClick={() => make(true)}>Start a story</Button></span>
          <Button rank="secondary" onClick={() => list("note")}>New note</Button>
          <Button rank="secondary" onClick={() => list("flashcards")}>New flash-card deck</Button>
        </div>
        <p className="hn-muted hn-small">A story starts with a first chapter and sections for characters, places and lore. Lists start as a note: turn one into a checklist from its own sheet.</p>
      </div>
    </Sheet>
  );
}

// ── Overview: stat cards, chart, ledger, targets, due, repeats ──────

export function StatCards({ nums, range }) {
  const vs = VS_WORDS[range];
  const cards = [
    { k: "Time worked", v: formatMinutes(nums.minutes), d: vs ? `${plusMinutes(nums.minutes - nums.prevMinutes)} ${vs}` : null, spark: nums.spark.minutes, color: "#c98bb9" },
    { k: "Words written", v: nums.words.toLocaleString(), d: vs ? plusNum(nums.words - nums.prevWords) : null, spark: nums.spark.words, color: "#5aa0c8" },
    { k: "List items ticked", v: nums.ticked.toLocaleString(), d: nums.listsDone ? `${nums.listsDone} ${nums.listsDone === 1 ? "list" : "lists"} done` : null, spark: nums.spark.ticked, color: LIST_COLOR },
    { k: "Flash-card study", v: formatMinutes(nums.study), d: nums.run ? `${nums.run} day run` : vs ? plusMinutes(nums.study - nums.prevStudy) : null, spark: nums.spark.study, color: DECK_COLOR },
  ];
  return (
    <div className="hn-stats">
      {cards.map((c) => (
        <section key={c.k} className="hn-stat" aria-label={c.k}>
          <span className="hn-k house-label">{c.k}</span>
          <span className="hn-stat-v"><span className="hn-big">{c.v}</span>{c.d ? <span className="hn-good">{c.d}</span> : null}</span>
          <Spark values={c.spark} color={c.color} />
        </section>
      ))}
    </div>
  );
}

const UNIT_TITLE = { day: "by day", week: "by week", month: "by month", span: "over time" };

export function TimeChart({ nums, range }) {
  const { index } = useWorkspace();
  const colors = usePageColors();
  const n = nums.buckets.length || 1;
  const { series, stacks, max } = chartSeries(nums.byPage, n);
  const bw = 520 / n;
  const colorOf = (id) => (id === "__other" ? OTHER_COLOR : colors.color(id));
  const labelAt = (i) => nums.buckets[Math.min(n - 1, Math.max(0, i))]?.label || "";
  return (
    <Panel className="hn-chart" headingLevel={2} title={`Time on pages, ${UNIT_TITLE[nums.unit] || "by week"}`} tools={<span className="hn-muted hn-small">stacked by page</span>}>
      {series.length === 0 ? <p className="hn-empty">{`No time logged on a page ${range === "week" ? "" : "in "}${RANGE_WORDS[range]}. "Work on it" on a page times it.`}</p> : (
        <div className="hn-chart-body">
          <svg width="100%" height="150" viewBox="0 0 520 150" preserveAspectRatio="none" shapeRendering="crispEdges" role="img"
            aria-label={`Time on pages: ${series.map((s) => `${s.id === "__other" ? "other pages" : index.byId.get(s.id)?.title || "Untitled"} ${formatMinutes(s.total)}`).join(", ")}`}>
            <path d="M0 149H520M0 100H520M0 50H520" style={{ stroke: "var(--house-outline)" }} strokeWidth="1" />
            {stacks.map((_, i) => {
              let y = 149;
              return (
                <g key={i}>
                  {[...series].reverse().map((s) => {
                    const h = Math.round((s.vals[i] / max) * 140);
                    if (!h) return null;
                    y -= h;
                    return <rect key={s.id} x={i * bw + bw * 0.15} y={y} width={bw * 0.7} height={h} fill={colorOf(s.id)} />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="hn-axis"><span>{labelAt(0)}</span><span>{labelAt(Math.floor(n / 3))}</span><span>{labelAt(Math.floor((2 * n) / 3))}</span><span>{range === "week" ? labelAt(n - 1) : "now"}</span></div>
          <div className="hn-legend">
            {series.map((s) => <span key={s.id}><Swatch color={colorOf(s.id)} />{s.id === "__other" ? "Other pages" : (index.byId.get(s.id)?.title || "Untitled")}</span>)}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** "Tap By to change who did it": the activity's people, written through setActivityWho. */
export function WhoSheet({ activity, onClose }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { run } = useWorkspace();
  const [ids, setIds] = useState(() => activityWhoIds(activity));
  const save = async () => {
    const out = await run(async () => { await setActivityWho(activity, ids); return true; });
    if (out) { qc.invalidateQueries({ queryKey: ["activities"] }); showToast({ message: "Saved who did it." }); onClose(); }
  };
  return (
    <Sheet open={!!activity} onClose={onClose} size="half" title={`Who did "${activity?.activity_name || "this"}"?`}
      footer={<>
        <Button rank="secondary" onClick={() => setIds([])}>Not signed</Button>
        <Button rank="primary" onClick={save}>Save</Button>
      </>}>
      <p className="hn-muted hn-small">{`Pick every ${t.alter} who did it. The time stays where it is.`}</p>
      <div className="hn-old">
        <AlterTreeSelect isSelected={(id) => ids.includes(id)}
          onToggle={(a) => setIds((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
          onSetMany={(arr, on) => setIds((cur) => { const s = new Set(cur); for (const a of arr) { if (on) s.add(a.id); else s.delete(a.id); } return [...s]; })}
          maxHeight="44vh" />
      </div>
    </Sheet>
  );
}

export function LedgerTable({ rows, limit, showPage = true, compact = false, onWho }) {
  const { index, open, openList } = useWorkspace();
  const { byId: listsById } = useNoteLists();
  const colors = usePageColors();
  const whoOf = useWhoOf();
  return (
    <div className={`hn-ledger${compact ? " hn-ledger--compact" : ""}${showPage ? "" : " hn-ledger--nopage"}`} role="table" aria-label="Ledger">
      <div className="hn-lrow hn-lrow--head house-label" role="row">
        <span role="columnheader">When</span><span role="columnheader">What</span>
        {showPage ? <span role="columnheader">Page</span> : null}<span role="columnheader">By</span><span role="columnheader" className="hn-r">Amount</span>
      </div>
      {rows.slice(0, limit).map(({ a, when }, i) => {
        const page = a.goal_id ? index.byId.get(a.goal_id) : null;
        const deck = !page && a.study_list_id ? listsById.get(a.study_list_id) : null;
        const who = whoOf(a);
        const color = page ? colors.color(page.id) : DECK_COLOR;
        return (
          <div key={a.id || i} className="hn-lrow" role="row">
            <span role="cell" className="hn-muted hn-pf">{whenLabel(when)}</span>
            <span role="cell" className="hn-ell">{a.activity_name || "Session"}</span>
            {showPage ? (
              <span role="cell" className="hn-lpage">
                <Button rank="quiet" className="hn-lpage-btn" onClick={() => (page ? open(page.id) : deck ? openList(deck.id) : null)}>
                  <Swatch color={color} /><span className="hn-ell">{page ? page.title || "Untitled" : deck ? deck.name || "Deck" : ""}</span>
                </Button>
              </span>
            ) : null}
            <span role="cell" className="hn-lwho">
              <Button rank="quiet" className="hn-who" title="Change who did it" onClick={() => onWho?.(a)}
                aria-label={`By ${who ? who.label : "no one yet"}: change who did it`}>
                {who ? <span style={who.color ? { color: who.color } : undefined}>{who.label}</span> : <i className="hn-muted">no one yet</i>}
              </Button>
            </span>
            <span role="cell" className="hn-num hn-good hn-r">{amountOf(a)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TargetsPanel() {
  const { goals, steps, ctx, open } = useWorkspace();
  const colors = usePageColors();
  const rows = useMemo(() => weeklyTargets({ goals, steps, ctx }), [goals, steps, ctx]);
  const pace = weekPace(new Date(), goalWeekStartsOn());
  const start = (() => { const d = new Date(); const ws = goalWeekStartsOn(); const diff = (d.getDay() - ws + 7) % 7; d.setDate(d.getDate() - diff); return d; })();
  const end = new Date(start.getTime() + 6 * 86400000);
  return (
    <Panel className="hn-targets" headingLevel={2} title="This week's targets" tools={<span className="hn-muted hn-small">{`${format(start, "EEE")} to ${format(end, "EEE")}`}</span>}>
      <div className="hn-pad hn-col" data-tour="notebook-targets">
        {rows.length === 0 ? <p className="hn-empty">No weekly targets yet. Add a weekly point (time, times or study) on a page.</p> : (
          <>
            {rows.slice(0, 6).map((r) => (
              <Button key={r.id} rank="quiet" className="hn-target" onClick={() => open(r.goalId)}>
                <span className="hn-target-top"><span className="hn-ell">{r.label}</span><span className={`hn-num${r.pct < pace - 30 && !r.done ? " hn-warn" : ""}`}>{r.value}</span></span>
                <Bar tall pct={r.pct} color={colors.color(r.goalId)} pace={pace} />
              </Button>
            ))}
            <p className="hn-note">The white tick is where you'd be on an even pace. Behind is fine.</p>
          </>
        )}
      </div>
    </Panel>
  );
}

export function DuePanel() {
  const { goals, steps, ctx, open } = useWorkspace();
  const rows = useMemo(() => comingDue({ goals, steps, ctx, now: new Date() }), [goals, steps, ctx]);
  return (
    <Panel className="hn-due" headingLevel={2} title="Coming due" tools={<span className="hn-muted hn-small">next 14 days</span>}>
      <div className="hn-pad hn-col">
        {rows.length === 0 ? <p className="hn-empty">Nothing dated in the next two weeks.</p> : rows.slice(0, 6).map((r) => (
          <Button key={r.id} rank="quiet" className="hn-line" onClick={() => open(r.page)}>
            <span className={`hn-pf hn-line-when${r.days <= 2 ? " hn-warn" : ""}`}>{dueWhen(r)}</span>
            <span className="hn-ell hn-flex">{r.what}</span>
            <span className="hn-muted hn-pf hn-small">{r.kind}</span>
          </Button>
        ))}
      </div>
    </Panel>
  );
}

export function RepeatsPanel() {
  const { goals, steps, ctx, open } = useWorkspace();
  const rows = useMemo(() => repeatRows({ goals, steps, ctx }), [goals, steps, ctx]);
  return (
    <Panel className="hn-repeats" headingLevel={2} title="Repeats" tools={<span className="hn-muted hn-small">like routines</span>}>
      <div className="hn-pad hn-col">
        {rows.length === 0 ? <p className="hn-empty">Points that come round again (a routine, time each week) show here.</p> : rows.slice(0, 8).map((r) => (
          <Button key={r.id} rank="quiet" className="hn-line" onClick={() => open(r.goalId)}>
            <span className="hn-ell hn-flex">{r.what}</span>
            <span className={`hn-pf hn-small ${r.status === "done" ? "hn-good" : "hn-muted"}`}>{r.status}</span>
          </Button>
        ))}
      </div>
    </Panel>
  );
}

// ── A page: measure row and points ──────────────────────────────────

export function MeasureRow({ page, pageIds }) {
  const { index, steps, ctx } = useWorkspace();
  const colors = usePageColors();
  const p = pageProgress(page, { index, steps, ctx, activities: ctx.activities, pageIds, now: new Date(), weekStartsOn: goalWeekStartsOn() });
  if (p.empty) return null;
  return (
    <div className="hn-measure">
      <div className="hn-measure-so">
        <span className="hn-k house-label">{p.byWords ? "Words so far" : "Done so far"}</span>
        <span className="hn-huge">{p.current.toLocaleString()} {p.goal ? <span className="hn-muted hn-mid">{`of ${p.goal.toLocaleString()}`}</span> : null}</span>
      </div>
      <div className="hn-measure-bar">
        <Bar tall pct={p.pct} color={colors.color(page.id)} pace={p.pace} />
        <span className="hn-axis">
          <span>{p.start ? format(p.start, "MMM d") : ""}</span>
          <span>{p.paceValue != null ? `on pace would be ${p.paceValue.toLocaleString()}` : ""}</span>
          <span>{p.end ? format(p.end, "MMM d") : ""}</span>
        </span>
      </div>
      <div className="hn-measure-week">
        <span className="hn-k house-label">This week</span>
        <span className="hn-mid hn-good">{p.byWords ? `+${p.weekWords.toLocaleString()}` : `+${formatMinutes(p.weekMin)}`}</span>
      </div>
    </div>
  );
}

export function PointsPanel({ page, xp }) {
  const { steps, ctx } = useWorkspace();
  const rows = useMemo(() => pagePoints(page.id, { steps, ctx }), [page.id, steps, ctx]);
  return (
    <Panel className="hn-points" headingLevel={2} title="Points" tools={<span className="hn-muted hn-small">what counts</span>}>
      <div className="hn-pad hn-col">
        {rows.length === 0 ? <p className="hn-empty">Points that count by themselves (times done, a list finished, study, time each week) show here. Add one with a line on the page.</p>
          : rows.map((r) => (
            <div key={r.id} className="hn-line hn-line--static">
              <span className="hn-ell hn-flex">{r.what}</span>
              <span className={`hn-pf hn-small ${r.done ? "hn-good" : "hn-muted"}`}>{r.value}</span>
            </div>
          ))}
        {xp ? <p className="hn-note">{xp}</p> : null}
      </div>
    </Panel>
  );
}
