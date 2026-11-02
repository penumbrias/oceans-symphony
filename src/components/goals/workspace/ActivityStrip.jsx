// The activities that go with a page. One tap starts one (or "Planning"),
// the same button stops it, and nothing leaves the page. The time is a
// normal logged activity marked with the page, so it also shows in the
// Activity Tracker, timeline and reports.
import React, { useEffect, useMemo, useState } from "react";
import { Play, Square, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { runningForPage, startPageActivity, stopPageActivity } from "@/lib/goalActivities";
import {
  pageMinutes, formatMinutes, descendantIds, updatePage, planningCategoryFor, addPlanningCategory, setPlanningCategory,
} from "@/lib/goalTree";
import { pageWordsWritten, formatWords } from "@/lib/goalWriting";
import { useWorkspace, chipCls } from "./WorkspaceContext";

function useActiveSessions() {
  const [sessions, setSessions] = useState(() => getActiveActivities());
  useEffect(() => {
    const on = () => setSessions(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, on);
    window.addEventListener("storage", on);
    const tick = setInterval(on, 30000);
    return () => { window.removeEventListener(ACTIVE_ACTIVITY_EVENT, on); window.removeEventListener("storage", on); clearInterval(tick); };
  }, []);
  return sessions;
}

const indentOption = (o) => (
  <span className="flex items-center gap-2 min-w-0">
    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
    <span className="truncate text-sm">{o.label}</span>
  </span>
);

// `bare`: inside a widget, whose box is the frame (one box per widget).
export default function ActivityStrip({ page, bare = false }) {
  const { index, ctx, run, busy, settings } = useWorkspace();
  const sessions = useActiveSessions();
  const [adding, setAdding] = useState(false);
  const [choosingPlanning, setChoosingPlanning] = useState(false);
  const categories = useMemo(() => ctx.categories || [], [ctx.categories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const options = useMemo(
    () => flattenCategoryTree(categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [categories],
  );
  const planning = planningCategoryFor(settings, categories);
  const linked = (page.activity_category_ids || []).map((id) => catById.get(id)).filter(Boolean)
    .filter((c) => c.id !== planning?.id);
  const pageIds = [page.id, ...descendantIds(index, page.id)];
  const time = pageMinutes(pageIds, ctx.activities, new Date());
  const written = pageWordsWritten(pageIds, ctx.activities, new Date());
  const runningHere = sessions.filter((a) => a?.extra?.goal_id === page.id);

  // The page itself, worked on like an activity (no activity picked).
  const self = { id: null, name: page.title || "this page", self: true };

  const toggle = (cat) => {
    const running = runningForPage(page.id, cat.id, sessions);
    run(async () => {
      if (running) {
        const res = await stopPageActivity(running);
        const w = Number(res?.record?.words_written) || 0;
        if (res) toast.success(`■ ${res.name}: ${formatMinutes(res.minutes)} logged on this page${w > 0 ? `, ${formatWords(w)} written` : ""}`);
      } else {
        await startPageActivity(page, cat.self ? null : cat);
        toast.success(`▶ ${cat.name} started`);
      }
    });
  };

  const btn = (cat, isPlanning = false) => {
    const running = runningForPage(page.id, cat.id, sessions);
    const mins = running ? Math.max(0, Math.round((Date.now() - new Date(running.startTime)) / 60000)) : 0;
    return (
      <span key={cat.id || "self"} className="inline-flex items-center">
        <button type="button" disabled={busy} onClick={() => toggle(cat)} aria-pressed={!!running}
          className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 disabled:opacity-50 ${
            running ? "bg-primary text-primary-foreground border-primary" : "border-primary/40 text-primary hover:bg-primary/10"}`}>
          {running ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isPlanning ? "Planning" : cat.self ? "Work on it" : cat.name}
          {running && <span className="tabular-nums">· {formatMinutes(mins)}</span>}
        </button>
        {!isPlanning && !cat.self && !running && (
          <button type="button" aria-label={`Take ${cat.name} off this page`} disabled={busy}
            onClick={() => run(() => updatePage(page.id, { activity_category_ids: (page.activity_category_ids || []).filter((id) => id !== cat.id) }))}
            className="p-0.5 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
        )}
      </span>
    );
  };

  return (
    <div className={bare ? "space-y-2" : "rounded-xl bg-primary/5 border border-primary/15 p-2.5 space-y-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {btn(self)}
        {planning ? btn(planning, true) : (
          <button type="button" className={chipCls} disabled={busy} onClick={() => setChoosingPlanning(true)}>
            <Play className="w-3 h-3" /> Planning
          </button>
        )}
        {linked.map((c) => btn(c))}
        {/* A session started here for an activity no longer on the strip still shows, so it can be stopped. */}
        {runningHere.filter((a) => a.categoryId !== planning?.id && !linked.some((c) => c.id === a.categoryId))
          .map((a) => catById.get(a.categoryId)).filter(Boolean).map((c) => btn(c))}
        <button type="button" className={chipCls} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          <Plus className="w-3 h-3" /> Activity
        </button>
      </div>
      {adding && (
        <SearchableSelect value={null} options={options} renderOption={indentOption}
          placeholder="Add an activity to this page" searchPlaceholder="Search activities…"
          onChange={(id) => {
            if (!id) return;
            setAdding(false);
            const ids = page.activity_category_ids || [];
            if (!ids.includes(id)) run(() => updatePage(page.id, { activity_category_ids: [...ids, id] }));
          }} />
      )}
      {choosingPlanning && !planning && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Which activity counts as planning? You only pick this once.</p>
          <SearchableSelect value={null} options={options} renderOption={indentOption}
            placeholder="Pick an activity" searchPlaceholder="Search activities…"
            onChange={(id) => { if (id) { setChoosingPlanning(false); run(() => setPlanningCategory(id)); } }} />
          <button type="button" className={chipCls} disabled={busy}
            onClick={() => { setChoosingPlanning(false); run(() => addPlanningCategory(), "Added a Planning activity"); }}>
            <Plus className="w-3 h-3" /> Add a "Planning" activity
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground tabular-nums">
        {time.total > 0
          ? `${formatMinutes(time.week)} logged on this page this week · ${formatMinutes(time.total)} in all${
            written.week > 0 ? ` · ${formatWords(written.week)} written this week` : ""}${written.today > 0 ? ` (${written.today.toLocaleString()} today)` : ""}`
          : "Work on it times the page itself; Planning and the activities you add here count too. It all adds up on this page."}
      </p>
    </div>
  );
}
