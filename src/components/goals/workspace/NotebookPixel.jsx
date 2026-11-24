// The Notebook in the pixel look (the "Notebook" / "Notebook page" /
// "Notebook phone" boards). Only rendered while the pixel look is on; the
// smooth look keeps PageTree + the widget boards exactly as before.
//
// Nothing here owns a record or a write path: the numbers are read from
// the same records the goal widgets count (activities marked with a page,
// words written in sessions, ticked list items, deck study sessions), and
// every action calls the workspace's existing writers (createPage,
// updatePage, the note-list writers, the page activity timer).
import React, { useMemo, useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { useNoteLists, useNoteListWriters, filedPageOf, notesFiledIn, isDeck, listProgress } from "@/lib/noteLists";
import {
  rootPages, childPages, ancestorsOf, flattenPages, createPage, orderAfter, descendantIds, MAX_PAGE_DEPTH,
  subtreeProgress, updatePage, formatMinutes, liveSteps,
} from "@/lib/goalTree";
import { isOpenGoal, stepState } from "@/lib/goals";
import { goalWeekWindow, activityWhen } from "@/lib/goalCounting";
import { countableMinutes, statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { allPageTags, pageHasTag, pageTags, sectionHeading, pageWordCount, wordTargetOf, formatWords } from "@/lib/goalWriting";
import { promptText } from "@/components/shared/ConfirmDialog";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { NoteMenu } from "./FiledNotes";
import { EntryList } from "./Outline";
import BoardView from "./BoardView";
import MapView from "./MapView";
import ActivityStrip from "./ActivityStrip";
import { PageNote, Connections } from "./PageView";
import { useWorkspace } from "./WorkspaceContext";

// Series colours for pages (a page's sections take its colour), lists and
// decks — the mockup's palette. Alters keep their own colours.
const PAGE_COLORS = ["#c98bb9", "#5aa0c8", "#9cc46b", "#e8a65d", "#86b88f", "#e3c16f", "#7fb3a6", "#b48ad6"];
const LIST_COLOR = "#f4e3b5";
const DECK_COLOR = "#9cc46b";

const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);
const DAY = 86400000;

export const RANGES = [
  { id: "week", label: "This week", short: "Week" },
  { id: "1m", label: "1M", short: "1M" },
  { id: "6m", label: "6M", short: "6M" },
  { id: "1y", label: "1Y", short: "1Y" },
  { id: "all", label: "All time", short: "All" },
];
const RANGE_WORDS = { week: "this week", "1m": "the last month", "6m": "the last 6 months", "1y": "the last year", all: "all time" };
const VS_WORDS = { week: "vs last week", "1m": "vs the month before", "6m": "vs the 6 before", "1y": "vs the year before" };

// ── Colours ─────────────────────────────────────────────────────────

export function usePageColors() {
  const { index } = useWorkspace();
  return useMemo(() => {
    const roots = rootPages(index);
    const byRoot = new Map(roots.map((p, i) => [p.id, PAGE_COLORS[i % PAGE_COLORS.length]]));
    const rootOf = (id) => {
      const up = ancestorsOf(index, id);
      return up.length ? up[up.length - 1].id : id;
    };
    return { color: (id) => byRoot.get(rootOf(id)) || PAGE_COLORS[0], rootOf };
  }, [index]);
}

// ── Numbers ─────────────────────────────────────────────────────────

function rangeStart(id, now, activities) {
  if (id === "week") return goalWeekWindow(now).start;
  if (id === "1m") return new Date(now.getTime() - 30 * DAY);
  if (id === "6m") return new Date(now.getTime() - 182 * DAY);
  if (id === "1y") return new Date(now.getTime() - 365 * DAY);
  let first = now.getTime() - 30 * DAY;
  for (const a of activities || []) {
    if (!a?.goal_id && !a?.study_list_id) continue;
    const w = activityWhen(a);
    if (w && w.getTime() < first) first = w.getTime();
  }
  return new Date(first);
}

const pageActs = (activities) => (activities || []).filter((a) => a && !a.trashed_at && (a.goal_id || a.study_list_id) && HAPPENED.has(statusFor(a)));

// Everything the overview shows, for one range.
export function useNotebookNumbers(range) {
  const { ctx, index } = useWorkspace();
  const { items: listItems, lists } = useNoteLists();
  const colors = usePageColors();
  return useMemo(() => {
    const now = new Date();
    const acts = pageActs(ctx.activities);
    const start = rangeStart(range, now, acts);
    const span = Math.max(DAY, now - start);
    const prevStart = new Date(start.getTime() - span);
    const n = range === "week" ? 7 : 12;
    const bucketOf = (t) => Math.min(n - 1, Math.max(0, Math.floor(((t - start) / span) * n)));
    const empty = () => Array(n).fill(0);
    const s = {
      minutes: 0, prevMinutes: 0, words: 0, prevWords: 0, study: 0, prevStudy: 0, ticked: 0, listsDone: 0,
      spark: { minutes: empty(), words: empty(), study: empty(), ticked: empty() },
      byPage: new Map(), buckets: n,
    };
    for (const a of acts) {
      const when = activityWhen(a);
      if (!when) continue;
      const t = when.getTime();
      const m = countableMinutes(a) || 0;
      const w = Math.max(0, Math.round(Number(a.words_written) || 0));
      const inRange = t >= start.getTime() && t <= now.getTime();
      const inPrev = t >= prevStart.getTime() && t < start.getTime();
      if (a.goal_id && index.byId.has(a.goal_id)) {
        if (inRange) {
          s.minutes += m; s.words += w;
          s.spark.minutes[bucketOf(t)] += m; s.spark.words[bucketOf(t)] += w;
          const root = colors.rootOf(a.goal_id);
          if (!s.byPage.has(root)) s.byPage.set(root, empty());
          s.byPage.get(root)[bucketOf(t)] += m;
        } else if (inPrev) { s.prevMinutes += m; s.prevWords += w; }
      }
      if (a.study_list_id) {
        if (inRange) { s.study += m; s.spark.study[bucketOf(t)] += m; } else if (inPrev) s.prevStudy += m;
      }
    }
    for (const l of lists) {
      if (isDeck(l)) continue;
      const rows = listItems(l.id);
      let tickedHere = 0;
      for (const it of rows) {
        if (!it?.checked) continue;
        const at = it.purchased_at ? new Date(it.purchased_at).getTime() : NaN;
        if (Number.isFinite(at) && at >= start.getTime() && at <= now.getTime()) {
          s.ticked += 1; tickedHere += 1; s.spark.ticked[bucketOf(at)] += 1;
        }
      }
      if (tickedHere && listProgress(rows).finished) s.listsDone += 1;
    }
    s.start = start;
    return s;
  }, [ctx.activities, index, listItems, lists, range, colors]);
}

const plusMinutes = (d) => (d >= 0 ? `+${formatMinutes(d)}` : `-${formatMinutes(-d)}`);
const plusNum = (d) => (d >= 0 ? `+${d.toLocaleString()}` : `-${Math.abs(d).toLocaleString()}`);

// The page-moving rows: activities logged on a page or a deck, newest first.
export function useLedger(pageIds = null) {
  const { ctx, index } = useWorkspace();
  const { byId: listsById } = useNoteLists();
  return useMemo(() => {
    const ids = pageIds ? new Set(pageIds) : null;
    return pageActs(ctx.activities)
      .filter((a) => (ids ? ids.has(a.goal_id) : (a.goal_id && index.byId.has(a.goal_id)) || listsById.has(a.study_list_id)))
      .map((a) => ({ a, when: activityWhen(a) }))
      .filter((r) => r.when)
      .sort((x, y) => y.when - x.when);
  }, [ctx.activities, index, listsById, pageIds]);
}

function whenLabel(d) {
  const days = differenceInCalendarDays(new Date(), d);
  if (days === 0) return `Today ${format(d, "h:mm")}`;
  if (days < 7) return format(d, "EEE");
  return format(d, "MMM d");
}

function useAlterOf() {
  const { alters } = useWorkspace();
  const formatAlter = useAlterLabel();
  return useMemo(() => {
    const byId = new Map((alters || []).map((x) => [x.id, x]));
    return (a) => {
      const ids = Array.isArray(a?.fronting_alter_ids) ? a.fronting_alter_ids : (a?.alter_id ? [a.alter_id] : []);
      const who = ids.map((id) => byId.get(id)).filter(Boolean);
      if (!who.length) return null;
      return { label: who.map((x) => formatAlter(x)).join(", "), color: who[0].color || null, id: who[0].id };
    };
  }, [alters, formatAlter]);
}

const amountOf = (a) => {
  const w = Math.round(Number(a.words_written) || 0);
  if (w > 0) return `+${w.toLocaleString()} w`;
  return `+${formatMinutes(countableMinutes(a) || 0)}`;
};

// ── Small pieces ────────────────────────────────────────────────────

const Bar = ({ pct, color, tall = false, pace = null }) => (
  <span className={`pxn-bar${tall ? " tall" : ""}`} aria-hidden="true">
    <span className="pxn-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    {pace != null && <span className="pxn-bar-pace" style={{ left: `${Math.max(0, Math.min(100, pace))}%` }} />}
  </span>
);

export const Swatch = ({ color, size = 10, children = null, className = "" }) => (
  <span className={`pxn-swatch ${className}`} style={{ background: color, width: size, height: size }} aria-hidden="true">{children}</span>
);

export function Panel({ title, action = null, className = "", bodyClass = "", children, ...rest }) {
  return (
    <section className={`pxn-panel ${className}`} {...rest}>
      {title != null && (
        <header className="pxn-ttl"><span className="pxn-ttl-name">{title}</span>{action}</header>
      )}
      <div className={`pxn-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function RangeChips({ range, setRange, phone = false }) {
  return (
    <div role="radiogroup" aria-label="Range" className={`pxn-ranges${phone ? " phone" : ""}`}>
      {RANGES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={range === r.id}
          className={`pxn-chip${range === r.id ? " sel" : ""}`} onClick={() => setRange(r.id)}>
          {phone ? r.short : r.label}
        </button>
      ))}
    </div>
  );
}

function Spark({ values, color }) {
  const max = Math.max(1, ...values);
  const w = 120 / values.length;
  const d = values.map((v, i) => {
    const h = v > 0 ? Math.max(2, Math.round((v / max) * 20)) : 1;
    return `M${(i * w).toFixed(1)} ${22 - h}h${(w - 2).toFixed(1)}v${h}h-${(w - 2).toFixed(1)}z`;
  }).join("");
  return (
    <svg className="pxn-spark" width="100%" height="22" viewBox="0 0 120 22" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fill={color} />
    </svg>
  );
}

// ── What a page row shows: its number and how full its bar is ───────

function usePageMeasure() {
  const { index, steps, ctx } = useWorkspace();
  return (page) => {
    const target = wordTargetOf(page);
    const heading = sectionHeading(index, page);
    const words = heading || page.child_section_style || target ? pageWordCount(index, steps, page.id) : 0;
    if (words > 0 || target) {
      return { val: `${formatWords(words)} w`, pct: target ? (words / target) * 100 : 0 };
    }
    const { done, total } = subtreeProgress(index, steps, ctx, page.id);
    if (total > 0) return { val: `${done} of ${total}`, pct: (done / total) * 100, due: false };
    return { val: "", pct: 0 };
  };
}

function useListMeasure() {
  const { items } = useNoteLists();
  return (l) => {
    const rows = items(l.id);
    if (isDeck(l)) return { val: rows.length === 1 ? "1 card" : `${rows.length} cards`, pct: rows.length ? 100 : 0 };
    const p = listProgress(rows);
    if (!p.total) return { val: "note", pct: 0 };
    const left = p.total - p.done;
    return { val: left ? `${left} left` : "all ticked", pct: (p.done / p.total) * 100 };
  };
}

// ── The left panel: Pages ───────────────────────────────────────────

function PageRow({ page, depth, currentId, expanded, toggle, onOpen, seen, noteLists, onOpenList, colorOf, measure, listMeasure }) {
  const { index } = useWorkspace();
  if (seen.has(page.id) || depth > MAX_PAGE_DEPTH) return null;
  const nextSeen = new Set(seen); nextSeen.add(page.id);
  const kids = childPages(index, page.id);
  const notesHere = notesFiledIn(noteLists, page.id, index);
  const has = kids.length + notesHere.length > 0;
  const isOpen = expanded.has(page.id);
  const here = page.id === currentId;
  const color = colorOf(page.id);
  const m = measure(page);
  const muted = page.status === "done" || page.status === "let_go";
  return (
    <li>
      <div className={`pxn-prow${here ? " sel" : ""}`} style={{ paddingLeft: 6 + depth * 18 }}>
        <div className="pxn-prow-top">
          {has ? (
            <button type="button" className="pxn-fold" onClick={() => toggle(page.id)} aria-expanded={isOpen}
              aria-label={isOpen ? `Fold ${page.title || "Untitled"}` : `Show inside ${page.title || "Untitled"}`}>{isOpen ? "v" : ">"}</button>
          ) : <Swatch color={color} />}
          <button type="button" className={`pxn-prow-name${muted ? " muted" : ""}`} onClick={() => onOpen(page.id)} aria-current={here ? "page" : undefined}>
            {page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"}
          </button>
          {m.val && <span className="pxn-num">{m.val}</span>}
        </div>
        <Bar pct={m.pct} color={color} />
      </div>
      {isOpen && has && (
        <ul>
          {kids.map((k) => (
            <PageRow key={k.id} page={k} depth={depth + 1} currentId={currentId} expanded={expanded} toggle={toggle} onOpen={onOpen}
              seen={nextSeen} noteLists={noteLists} onOpenList={onOpenList} colorOf={colorOf} measure={measure} listMeasure={listMeasure} />
          ))}
          {notesHere.map((l) => <ListRow key={`f-${l.id}`} list={l} depth={depth + 1} onOpenList={onOpenList} measure={listMeasure} />)}
        </ul>
      )}
    </li>
  );
}

function ListRow({ list, depth = 0, onOpenList, measure }) {
  const m = measure(list);
  const color = isDeck(list) ? DECK_COLOR : LIST_COLOR;
  return (
    <li>
      <div className="pxn-prow" style={{ paddingLeft: 6 + depth * 18 }}>
        <div className="pxn-prow-top">
          <Swatch color={color} />
          <button type="button" className="pxn-prow-name" onClick={() => onOpenList(list.id)}>{list.name || "Untitled"}</button>
          <span className="pxn-num">{m.val}</span>
          <span className="pxn-rowmenu"><NoteMenu list={list} /></span>
        </div>
        <Bar pct={m.pct} color={color} />
      </div>
    </li>
  );
}

const newestFirst = (a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""));

function GroupHead({ name, count, onClick = null, action = null, open = null, onToggle = null }) {
  return (
    <div className="pxn-ghead">
      {onToggle && <button type="button" className="pxn-fold" onClick={onToggle} aria-expanded={!!open} aria-label={open ? `Fold ${name}` : `Show ${name}`}>{open ? "v" : ">"}</button>}
      {onClick ? <button type="button" className="pxn-ghead-name" onClick={onClick}>{name}</button> : <span className="pxn-ghead-name">{name}</span>}
      {action}
      <span>{count}</span>
    </div>
  );
}

export function PixelPages({ currentId, onOpen, footer = true }) {
  const { index, goals, tag, showTag, openList, openNotes } = useWorkspace();
  const { lists: noteLists } = useNoteLists();
  const { createNote } = useNoteListWriters();
  const colors = usePageColors();
  const measure = usePageMeasure();
  const listMeasure = useListMeasure();
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(() => new Map());
  const [showFinished, setShowFinished] = useState(false);
  const autoOpen = useMemo(() => new Set(currentId ? [currentId, ...ancestorsOf(index, currentId).map((p) => p.id)] : []), [index, currentId]);
  const expanded = useMemo(() => {
    const s = new Set(autoOpen);
    for (const [id, on] of manual) { if (on) s.add(id); else s.delete(id); }
    return s;
  }, [autoOpen, manual]);
  const toggle = (id) => setManual((m) => new Map(m).set(id, !expanded.has(id)));

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

  const newList = async (type) => {
    try {
      const made = await createNote(undefined, type);
      if (made?.id) openList(made.id);
    } catch (e) { toast.error(e?.message || "Couldn't make that."); }
  };

  const rowProps = { currentId, expanded, toggle, onOpen, seen: new Set(), noteLists, onOpenList: openList, colorOf: colors.color, measure, listMeasure };

  return (
    <nav aria-label="Notebook pages" className="pxn-pages">
      <div className="pxn-search">
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, notes and #tags" aria-label="Search pages" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear the search"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {tags.length > 0 && !want && (
        <div className="pxn-tags" role="group" aria-label="Tags">
          {tags.map(({ tag: t, count }) => {
            const on = !!tag && t.toLowerCase() === tag.toLowerCase();
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => showTag(on ? null : t)} className={`pxn-chip small${on ? " sel" : ""}`}>
                #{t} {count}
              </button>
            );
          })}
        </div>
      )}
      {want || tag ? (
        <ul className="pxn-list">
          {tag && !want && <li><GroupHead name={`Tagged #${tag}`} count="" action={<button type="button" className="pxn-link" onClick={() => showTag(null)}>show all</button>} /></li>}
          {hits.map(({ page }) => {
            const path = ancestorsOf(index, page.id).reverse().map((p) => p.title || "Untitled").join(" > ");
            return (
              <li key={page.id}>
                <button type="button" className={`pxn-hit${page.id === currentId ? " sel" : ""}`} onClick={() => { onOpen(page.id); setQ(""); }}>
                  <Swatch color={colors.color(page.id)} />
                  <span className="pxn-hit-text"><span>{page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"}</span>{path && <span className="pxn-mut">{path}</span>}</span>
                </button>
              </li>
            );
          })}
          {noteHits.map((l) => <ListRow key={`n-${l.id}`} list={l} onOpenList={(id) => { openList(id); setQ(""); }} measure={listMeasure} />)}
          {hits.length === 0 && noteHits.length === 0 && <li className="pxn-empty">Nothing matches.</li>}
        </ul>
      ) : (
        <ul className="pxn-list">
          {pinned.length > 0 && (
            <>
              <li><GroupHead name="Pinned" count={pinned.length} /></li>
              {pinned.map((p) => (
                <li key={`pin-${p.id}`}>
                  <button type="button" className={`pxn-hit${p.id === currentId ? " sel" : ""}`} onClick={() => onOpen(p.id)}>
                    <Swatch color={colors.color(p.id)} /><span className="pxn-hit-text"><span>{p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}</span></span>
                  </button>
                </li>
              ))}
            </>
          )}
          <li><GroupHead name="Goals" count={openRoots.length} onClick={() => onOpen(null)} /></li>
          {openRoots.length ? openRoots.map((p) => <PageRow key={p.id} page={p} depth={0} {...rowProps} />)
            : <li className="pxn-empty">No goals yet. + new page starts one.</li>}
          {finished.length > 0 && (
            <>
              <li><GroupHead name="Finished" count={finished.length} open={showFinished} onToggle={() => setShowFinished((v) => !v)} /></li>
              {showFinished && finished.map((p) => <PageRow key={p.id} page={p} depth={0} {...rowProps} />)}
            </>
          )}
          {openList && (
            <>
              <li><GroupHead name="Notes & lists" count={notes.length} onClick={openNotes}
                action={<button type="button" className="pxn-link" onClick={() => newList("note")} aria-label="New note">+ new</button>} /></li>
              {notes.length ? notes.map((l) => <ListRow key={`${l.source || "db"}-${l.id}`} list={l} onOpenList={openList} measure={listMeasure} />)
                : <li className="pxn-empty">{noteLists.length ? "Every note is filed in a page." : "No notes or lists yet."}</li>}
              <li><GroupHead name="Flash cards" count={decks.length} onClick={openNotes}
                action={<button type="button" className="pxn-link" onClick={() => newList("flashcards")} aria-label="New flash-card deck">+ new</button>} /></li>
              {decks.length ? decks.map((l) => <ListRow key={`${l.source || "db"}-${l.id}`} list={l} onOpenList={openList} measure={listMeasure} />)
                : <li className="pxn-empty">No decks yet.</li>}
            </>
          )}
        </ul>
      )}
      {footer && <span className="pxn-grow" />}
      {footer && <p className="pxn-foot">Move a page inside another from its Info. Notes can be filed inside any page from their ... menu.</p>}
    </nav>
  );
}

export function useAddPage(onOpen) {
  const { index, run } = useWorkspace();
  return async () => {
    const v = await promptText({ title: "New page", placeholder: "What's it called?" });
    if (!v || !v.trim()) return;
    const made = await run(() => createPage({ title: v.trim(), order: orderAfter(rootPages(index).map((rec) => ({ rec }))) }));
    if (made?.id) onOpen(made.id);
  };
}

// ── Home (desk): the overview ───────────────────────────────────────

function StatCard({ k, v, d, spark, color }) {
  return (
    <div className="pxn-panel pxn-stat">
      <span className="pxn-k">{k}</span>
      <span className="pxn-stat-v"><span className="pxn-big">{v}</span>{d && <span className="pxn-good">{d}</span>}</span>
      <Spark values={spark} color={color} />
    </div>
  );
}

export function StatCards({ nums, range }) {
  const vs = VS_WORDS[range];
  return (
    <div className="pxn-stats">
      <StatCard k="Time worked" v={formatMinutes(nums.minutes)} d={vs ? `${plusMinutes(nums.minutes - nums.prevMinutes)} ${vs}` : null} spark={nums.spark.minutes} color={PAGE_COLORS[0]} />
      <StatCard k="Words written" v={nums.words.toLocaleString()} d={vs ? plusNum(nums.words - nums.prevWords) : null} spark={nums.spark.words} color={PAGE_COLORS[1]} />
      <StatCard k="List items ticked" v={nums.ticked.toLocaleString()} d={nums.listsDone ? `${nums.listsDone} ${nums.listsDone === 1 ? "list" : "lists"} done` : null} spark={nums.spark.ticked} color={LIST_COLOR} />
      <StatCard k="Flash-card study" v={formatMinutes(nums.study)} d={vs ? plusMinutes(nums.study - nums.prevStudy) : null} spark={nums.spark.study} color={DECK_COLOR} />
    </div>
  );
}

function WeekChart({ nums, range }) {
  const { index } = useWorkspace();
  const colors = usePageColors();
  const n = nums.buckets;
  const series = [...nums.byPage.entries()].map(([id, vals]) => ({ id, vals, total: vals.reduce((x, y) => x + y, 0) }))
    .sort((a, b) => b.total - a.total);
  const top = series.slice(0, 4);
  const rest = series.slice(4);
  if (rest.length) {
    const vals = Array(n).fill(0);
    for (const s of rest) s.vals.forEach((v, i) => { vals[i] += v; });
    top.push({ id: "__other", vals, total: 0 });
  }
  const stacks = Array(n).fill(0).map((_, i) => top.reduce((x, s) => x + s.vals[i], 0));
  const max = Math.max(1, ...stacks);
  const bw = 520 / n;
  const colorOf = (id) => (id === "__other" ? "#565d86" : colors.color(id));
  const dayLabel = (i) => format(new Date(nums.start.getTime() + ((Date.now() - nums.start.getTime()) * i) / n), range === "week" ? "EEE" : "MMM d");
  return (
    <Panel title={range === "week" ? "Time on pages, by day" : "Time on pages, over time"} action={<span className="pxn-mut">stacked by page</span>} bodyClass="pxn-pad">
      {series.length === 0 ? <p className="pxn-empty">No time logged on a page in {RANGE_WORDS[range]}. "Work on it" on a page times it.</p> : (
        <>
          <svg width="100%" height="150" viewBox="0 0 520 150" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
            <path d="M0 149H520M0 100H520M0 50H520" stroke="var(--px-bar)" strokeWidth="1" />
            {stacks.map((_, i) => {
              let y = 149;
              return (
                <g key={i}>
                  {[...top].reverse().map((s) => {
                    const h = Math.round((s.vals[i] / max) * 140);
                    if (!h) return null;
                    y -= h;
                    return <rect key={s.id} x={i * bw + bw * 0.15} y={y} width={bw * 0.7} height={h} fill={colorOf(s.id)} />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="pxn-axis"><span>{dayLabel(0)}</span><span>{dayLabel(Math.floor(n / 3))}</span><span>{dayLabel(Math.floor((2 * n) / 3))}</span><span>{range === "week" ? "today" : "now"}</span></div>
          <div className="pxn-legend">
            {top.map((s) => (
              <span key={s.id}><Swatch color={colorOf(s.id)} />{s.id === "__other" ? "Other pages" : (index.byId.get(s.id)?.title || "Untitled")}</span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function LedgerGrid({ rows, compact = false, showPage = true, limit }) {
  const { index, open, openList } = useWorkspace();
  const { byId: listsById } = useNoteLists();
  const colors = usePageColors();
  const alterOf = useAlterOf();
  return (
    <div className={`pxn-ledger${compact ? " compact" : ""}${showPage ? "" : " nopage"}`} role="table" aria-label="Ledger">
      <div className="pxn-lrow head" role="row">
        <span role="columnheader">When</span><span role="columnheader">What</span>
        {showPage && <span role="columnheader">Page</span>}<span role="columnheader">By</span><span role="columnheader" className="r">Amount</span>
      </div>
      {rows.slice(0, limit).map(({ a, when }, i) => {
        const page = a.goal_id ? index.byId.get(a.goal_id) : null;
        const deck = !page && a.study_list_id ? listsById.get(a.study_list_id) : null;
        const who = alterOf(a);
        const color = page ? colors.color(page.id) : DECK_COLOR;
        return (
          <button key={a.id || i} type="button" role="row" className={`pxn-lrow${i === 0 ? " first" : ""}`}
            onClick={() => (page ? open(page.id) : deck ? openList?.(deck.id) : null)}>
            <span className="pxn-mut pxn-pf">{whenLabel(when)}</span>
            <span className="pxn-ell">{a.activity_name || "Session"}</span>
            {showPage && <span className="pxn-lpage"><Swatch color={color} size={8} /><span className="pxn-ell">{page ? page.title || "Untitled" : deck ? deck.name || "Deck" : ""}</span></span>}
            <span className="pxn-ell" style={who?.color ? { color: who.color } : undefined}>{who ? who.label : <i className="pxn-mut">no one yet</i>}</span>
            <span className="pxn-num pxn-good r">{amountOf(a)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Targets() {
  const { goals, steps, ctx, open } = useWorkspace();
  const colors = usePageColors();
  const now = new Date();
  const { start, end } = goalWeekWindow(now);
  const pace = Math.min(100, ((now - start) / Math.max(1, (end || new Date(start.getTime() + 7 * DAY)) - start)) * 100);
  const byId = new Map(goals.map((g) => [g.id, g]));
  const rows = [];
  for (const s of liveSteps(steps)) {
    const weekly = s.kind === "rhythm" || ((s.kind === "activity_count" || s.kind === "deck_study") && s.count_period === "week");
    if (!weekly) continue;
    const g = byId.get(s.goal_id);
    if (!g || !isOpenGoal(g)) continue;
    const st = stepState(s, ctx);
    if (!st.target) continue;
    const unit = s.kind === "activity_count" ? "" : " min";
    rows.push({ s, g, st, label: `${g.title || "Untitled"}: ${s.title || "weekly target"}`, v: `${st.current} of ${st.target}${unit}` });
  }
  return (
    <Panel title="This week's targets" action={<span className="pxn-mut">{format(start, "EEE")} to {format(new Date(start.getTime() + 6 * DAY), "EEE")}</span>} bodyClass="pxn-pad pxn-col">
      {rows.length === 0 ? <p className="pxn-empty">No weekly targets yet. Add a weekly point (time, times or study) on a page.</p> : (
        <>
          {rows.slice(0, 6).map(({ s, g, st, label, v }) => (
            <button key={s.id} type="button" className="pxn-target" onClick={() => open(g.id)}>
              <span className="pxn-target-top"><span className="pxn-ell">{label}</span><span className={`pxn-num${st.current / st.target * 100 < pace - 30 ? " pxn-warn" : ""}`}>{v}</span></span>
              <Bar tall pct={(st.current / st.target) * 100} color={colors.color(g.id)} pace={pace} />
            </button>
          ))}
          <p className="pxn-note">The white tick is where you'd be on an even pace. Behind is fine.</p>
        </>
      )}
    </Panel>
  );
}

function ComingDue() {
  const { goals, steps, ctx, open } = useWorkspace();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  for (const g of goals) {
    if (!g?.target_date || !isOpenGoal(g) || g.removed_at) continue;
    const d = new Date(`${g.target_date}T12:00:00`);
    const days = differenceInCalendarDays(d, today);
    if (days >= -7 && days <= 14) rows.push({ id: g.id, d, days, what: g.title || "Untitled", kind: "by date", page: g.id });
  }
  const byId = new Map(goals.map((g) => [g.id, g]));
  for (const s of liveSteps(steps)) {
    if (s.kind !== "todo") continue;
    const st = stepState(s, ctx);
    const due = st.linked?.due_date;
    if (!due || st.done || !byId.has(s.goal_id)) continue;
    const d = new Date(`${String(due).slice(0, 10)}T12:00:00`);
    const days = differenceInCalendarDays(d, today);
    if (days >= -7 && days <= 14) rows.push({ id: s.id, d, days, what: st.linked.title || s.title || "To-do", kind: "to-do", page: s.goal_id });
  }
  rows.sort((a, b) => a.d - b.d);
  return (
    <Panel title="Coming due" action={<span className="pxn-mut">next 14 days</span>} bodyClass="pxn-pad pxn-col">
      {rows.length === 0 ? <p className="pxn-empty">Nothing dated in the next two weeks.</p> : rows.slice(0, 6).map((r) => (
        <button key={r.id} type="button" className="pxn-due" onClick={() => open(r.page)}>
          <span className={`pxn-pf pxn-due-when${r.days <= 2 ? " pxn-warn" : ""}`}>{r.days < 0 ? "late" : r.days < 7 ? format(r.d, "EEE") : format(r.d, "MMM d")}</span>
          <span className="pxn-ell pxn-grow">{r.what}</span>
          <span className="pxn-mut pxn-pf pxn-small">{r.kind}</span>
        </button>
      ))}
    </Panel>
  );
}

function Repeats() {
  const { goals, steps, ctx, open } = useWorkspace();
  const byId = new Map(goals.map((g) => [g.id, g]));
  const rows = [];
  for (const s of liveSteps(steps)) {
    const g = byId.get(s.goal_id);
    if (!g || !isOpenGoal(g)) continue;
    const st = stepState(s, ctx);
    if (!st.ongoing) continue;
    let what = s.title || "";
    if (s.kind === "rhythm") what = what || `${s.weekly_minutes || 0} min a week`;
    if (s.kind === "daily_task") what = st.linked?.title || what || "Routine";
    if (s.kind === "activity_count") what = what || `${s.target_count || 1} times a week`;
    rows.push({ s, g, what, status: st.done ? "done" : s.kind === "daily_task" ? "routine" : "this week" });
  }
  return (
    <Panel title="Repeats" action={<span className="pxn-mut">like routines</span>} className="pxn-grow" bodyClass="pxn-pad pxn-col">
      {rows.length === 0 ? <p className="pxn-empty">Points that come round again (a routine, time each week) show here.</p> : rows.slice(0, 8).map(({ s, g, what, status }) => (
        <button key={s.id} type="button" className="pxn-due" onClick={() => open(g.id)}>
          <span className="pxn-ell pxn-grow">{g.title ? `${g.title}: ` : ""}{what}</span>
          <span className={`pxn-pf pxn-small ${status === "done" ? "pxn-good" : "pxn-mut"}`}>{status}</span>
        </button>
      ))}
    </Panel>
  );
}

export function PixelOverview({ range, setRange, onEditLayout, carry, board }) {
  const nums = useNotebookNumbers(range);
  const ledger = useLedger();
  const [all, setAll] = useState(false);
  return (
    <div className="pxn-main">
      <div className="pxn-panel pxn-titlebar">
        <h1 className="pxn-h1">Notebook</h1>
        <RangeChips range={range} setRange={setRange} />
        <button type="button" className="pxn-btn" onClick={onEditLayout} data-tour="notebook-layout-btn">Edit page</button>
      </div>
      {carry}
      <StatCards nums={nums} range={range} />
      <div className="pxn-split">
        <div className="pxn-col pxn-grow pxn-gap">
          <WeekChart nums={nums} range={range} />
          <Panel title="Ledger: everything that moved a page"
            action={ledger.length > 7 ? <button type="button" className="pxn-link" onClick={() => setAll((v) => !v)}>{all ? "fewer" : `all ${ledger.length}`}</button> : null}>
            {ledger.length === 0 ? <p className="pxn-empty pxn-pad">Nothing yet. Time on a page, words written, and study sessions land here.</p>
              : <LedgerGrid rows={ledger} limit={all ? 200 : 7} />}
            <p className="pxn-note pxn-pad">Nothing here is typed twice: rows come from activities logged on a page, words written in them and deck study sessions.</p>
          </Panel>
          {board}
        </div>
        <div className="pxn-side-col">
          <Targets />
          <ComingDue />
          <Repeats />
          <button type="button" className="pxn-dashed" onClick={onEditLayout}>+ Add to this page</button>
        </div>
      </div>
    </div>
  );
}

// ── Home (phone) ────────────────────────────────────────────────────

export function PixelPhoneHome({ range, setRange, onOpenTree, onAddPage, carry, board }) {
  const nums = useNotebookNumbers(range);
  const ledger = useLedger();
  const { index, open, openList, openNotes } = useWorkspace();
  const { lists } = useNoteLists();
  const colors = usePageColors();
  const measure = usePageMeasure();
  const listMeasure = useListMeasure();
  const alterOf = useAlterOf();
  const roots = rootPages(index).filter((p) => isOpenGoal(p));
  const loose = lists.filter((l) => !filedPageOf(l, index)).sort(newestFirst);
  const rows = [
    ...roots.map((p) => ({ key: p.id, name: p.title || "Untitled", icon: p.icon, color: colors.color(p.id), m: measure(p), go: () => open(p.id) })),
    ...loose.map((l) => ({ key: `l-${l.id}`, name: l.name || "Untitled", color: isDeck(l) ? DECK_COLOR : LIST_COLOR, m: listMeasure(l), go: () => openList(l.id) })),
  ];
  const vs = VS_WORDS[range];
  const delta = nums.minutes - nums.prevMinutes;
  // The area under the time line, in steps (the board's sparkline).
  const vals = nums.spark.minutes;
  const max = Math.max(1, ...vals);
  const w = 340 / vals.length;
  let area = "M0 40 ";
  let line = "";
  vals.forEach((v, i) => {
    const y = 36 - Math.round((v / max) * 30);
    area += `V${y} H${((i + 1) * w).toFixed(1)} `;
    line += `M${(i * w).toFixed(1)} ${y}h${w.toFixed(1)}v2h-${w.toFixed(1)}z`;
  });
  area += "V40 Z";
  return (
    <div className="pxn-phone">
      <div className="pxn-panel pxn-sum">
        <div className="pxn-row-between"><span className="pxn-k">{RANGE_WORDS[range][0].toUpperCase() + RANGE_WORDS[range].slice(1)}, all pages</span>
          {vs && <span className="pxn-good pxn-pf pxn-small">{plusMinutes(delta)} {vs}</span>}</div>
        <div className="pxn-sum-main"><span className="pxn-big">{formatMinutes(nums.minutes)}</span>
          <span className="pxn-mut pxn-pf">{nums.words.toLocaleString()} words · {formatMinutes(nums.study)} study</span></div>
        <svg width="100%" height="40" viewBox="0 0 340 40" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
          <path d={area} fill="var(--px-wave, #6d73b0)" fillOpacity="0.6" /><path d={line} fill="var(--color-primary)" />
        </svg>
        <RangeChips range={range} setRange={setRange} phone />
      </div>
      {carry}
      <Panel title="Pages" action={(
        <span className="pxn-ttl-acts">
          <button type="button" className="pxn-link" onClick={onAddPage}>+ new</button>
          <button type="button" className="pxn-link" onClick={onOpenTree}>all {rows.length}</button>
        </span>
      )} bodyClass="pxn-pad-x">
        {rows.length === 0 ? <p className="pxn-empty pxn-pad">No pages yet. + new starts one.</p> : rows.slice(0, 8).map((r) => (
          <button key={r.key} type="button" className="pxn-prow-phone" onClick={r.go}>
            <Swatch color={r.color} size={28} className="pxn-letter">{r.icon || (r.name[0] || "?").toUpperCase()}</Swatch>
            <span className="pxn-prow-mid"><span className="pxn-ell">{r.name}</span><Bar pct={r.m.pct} color={r.color} /></span>
            <span className="pxn-num pxn-prow-val">{r.m.val}</span>
          </button>
        ))}
        {rows.length > 8 && <button type="button" className="pxn-link pxn-pad" onClick={onOpenTree}>Show all {rows.length}</button>}
        <button type="button" className="pxn-link pxn-pad" onClick={openNotes}>Notes &amp; lists board</button>
      </Panel>
      <Panel title="Recent" action={<span className="pxn-mut">ledger</span>} bodyClass="pxn-pad-x">
        {ledger.length === 0 ? <p className="pxn-empty pxn-pad">Nothing yet. Time on a page and study sessions land here.</p> : ledger.slice(0, 4).map(({ a, when }, i) => {
          const page = a.goal_id ? index.byId.get(a.goal_id) : null;
          const who = alterOf(a);
          return (
            <button key={a.id || i} type="button" className="pxn-recent" onClick={() => (page ? open(page.id) : a.study_list_id && openList(a.study_list_id))}>
              <span className="pxn-recent-mark" style={{ background: page ? colors.color(page.id) : DECK_COLOR }} aria-hidden="true" />
              <span className="pxn-prow-mid"><span className="pxn-ell">{a.activity_name || "Session"}</span>
                <span className="pxn-mut pxn-small">{whenLabel(when)}{who ? <> · <span style={who.color ? { color: who.color } : undefined}>{who.label}</span></> : null}</span></span>
              <span className="pxn-num pxn-good">{amountOf(a)}</span>
            </button>
          );
        })}
      </Panel>
      {board}
    </div>
  );
}

// ── A page (desk): Page · Note + ledger · Linked + Activities ────────

const LINE_VIEWS = [{ id: "outline", label: "Outline" }, { id: "board", label: "Board" }, { id: "map", label: "Map" }];

export function PixelPageDesk({ page }) {
  const { index, run, busy } = useWorkspace();
  const [noteEditing, setNoteEditing] = useState(false);
  const [all, setAll] = useState(false);
  const pageIds = useMemo(() => [page.id, ...descendantIds(index, page.id)], [index, page.id]);
  const ledger = useLedger(pageIds);
  const alterOf = useAlterOf();
  const view = ["outline", "board", "map"].includes(page.view) ? page.view : "outline";
  // Who has put time in here: minutes per person (the board's bar).
  const shares = useMemo(() => {
    const m = new Map();
    let total = 0;
    for (const { a } of ledger) {
      const mins = countableMinutes(a) || 0;
      if (!mins) continue;
      total += mins;
      const who = alterOf(a);
      const key = who?.id || "__none";
      const cur = m.get(key) || { label: who?.label || "not signed", color: who?.color || null, mins: 0 };
      cur.mins += mins;
      m.set(key, cur);
    }
    return { total, rows: [...m.values()].sort((a, b) => b.mins - a.mins).slice(0, 4) };
  }, [ledger, alterOf]);
  return (
    <div className="pxn-pagegrid">
      <Panel title="Page" className="pxn-lines" bodyClass="pxn-scroll pxn-pad"
        action={(
          <span role="radiogroup" aria-label="Show the page as" className="pxn-ttl-acts">
            {LINE_VIEWS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={view === v.id} disabled={busy}
                className={`pxn-chip tiny${view === v.id ? " sel" : ""}`}
                onClick={() => { if (view !== v.id) run(() => updatePage(page.id, { view: v.id })); }}>{v.label}</button>
            ))}
          </span>
        )}>
        {view === "outline" && <EntryList pageId={page.id} page={page} />}
        {view === "board" && <BoardView page={page} />}
        {view === "map" && <MapView page={page} />}
      </Panel>
      <div className="pxn-col pxn-gap pxn-minw0">
        <Panel title="Note" className="pxn-grow pxn-notepanel" bodyClass="pxn-scroll pxn-paper"
          action={!noteEditing ? <button type="button" className="pxn-link" onClick={() => setNoteEditing(true)}>{page.why ? "edit" : "write"}</button> : null}>
          <PageNote page={page} editing={noteEditing} setEditing={setNoteEditing} emptyPrompt />
        </Panel>
        <Panel title="Ledger for this page"
          action={ledger.length > 3 ? <button type="button" className="pxn-link" onClick={() => setAll((v) => !v)}>{all ? "fewer" : `all ${ledger.length} rows`}</button> : null}>
          {ledger.length === 0 ? <p className="pxn-empty pxn-pad">Nothing logged on this page yet. Work on it times a session.</p>
            : <LedgerGrid rows={ledger} limit={all ? 200 : 3} showPage={false} compact />}
          {shares.total > 0 && (
            <div className="pxn-shares">
              <span className="pxn-mut">Who's put time in</span>
              <span className="pxn-sharebar" aria-hidden="true">
                {shares.rows.map((r) => <span key={r.label} style={{ width: `${(r.mins / shares.total) * 100}%`, background: r.color || "var(--px-lo)" }} />)}
              </span>
              {shares.rows.map((r) => <span key={r.label} className={r.color ? "" : "pxn-mut"} style={r.color ? { color: r.color } : undefined}>{r.label}</span>)}
            </div>
          )}
        </Panel>
      </div>
      <div className="pxn-col pxn-gap">
        <Panel title="Linked here" bodyClass="pxn-pad">
          <Connections page={page} bare emptyText="Nothing links here yet. Add a Link line, or type [[a page's title]] in a note." />
        </Panel>
        <Panel title="Work on it" className="pxn-grow" bodyClass="pxn-pad pxn-scroll">
          <ActivityStrip page={page} bare />
        </Panel>
      </div>
    </div>
  );
}

// The page header's second row: words (or done lines) so far, the bar
// with the even-pace tick, and this week.
export function PageMeasureRow({ page }) {
  const { index, steps, ctx } = useWorkspace();
  const colors = usePageColors();
  const ids = [page.id, ...descendantIds(index, page.id)];
  const target = wordTargetOf(page);
  const heading = sectionHeading(index, page);
  const words = heading || page.child_section_style || target ? pageWordCount(index, steps, page.id) : 0;
  const { done, total } = subtreeProgress(index, steps, ctx, page.id);
  const now = new Date();
  const weekStart = goalWeekWindow(now).start;
  let weekWords = 0, weekMin = 0;
  for (const a of pageActs(ctx.activities)) {
    if (!ids.includes(a.goal_id)) continue;
    const w = activityWhen(a);
    if (!w || w < weekStart) continue;
    weekWords += Math.max(0, Math.round(Number(a.words_written) || 0));
    weekMin += countableMinutes(a) || 0;
  }
  const byWords = words > 0 || !!target;
  if (!byWords && total === 0 && weekMin === 0) return null;
  const startD = page.created_date ? new Date(page.created_date) : null;
  const endD = page.target_date ? new Date(`${page.target_date}T12:00:00`) : null;
  const paceFrac = startD && endD && endD > startD ? Math.max(0, Math.min(1, (now - startD) / (endD - startD))) : null;
  const goalN = byWords ? target : total;
  const curN = byWords ? words : done;
  const pct = goalN ? (curN / goalN) * 100 : 0;
  const color = colors.color(page.id);
  return (
    <div className="pxn-measure">
      <div>
        <div className="pxn-k">{byWords ? "Words so far" : "Done so far"}</div>
        <div className="pxn-huge">{curN.toLocaleString()} {goalN ? <span className="pxn-mut">of {goalN.toLocaleString()}</span> : null}</div>
      </div>
      <div className="pxn-measure-bar">
        <Bar tall pct={pct} color={color} pace={paceFrac != null && goalN ? paceFrac * 100 : null} />
        <div className="pxn-axis">
          <span>{startD ? format(startD, "MMM d") : ""}</span>
          <span>{paceFrac != null && goalN ? `on pace would be ${Math.round(paceFrac * goalN).toLocaleString()}` : ""}</span>
          <span>{endD ? format(endD, "MMM d") : ""}</span>
        </div>
      </div>
      <div className="pxn-measure-week">
        <div className="pxn-k">This week</div>
        <div className="pxn-mid pxn-good">{byWords ? `+${weekWords.toLocaleString()}` : `+${formatMinutes(weekMin)}`}</div>
      </div>
    </div>
  );
}
