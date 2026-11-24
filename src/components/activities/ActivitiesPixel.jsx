// The Activities page in the pixel look — the "Desktop: Activities" board.
// Left: the activity tree (the same ActivityManager the classic page uses,
// in its `pixel` layout) with a search and a count per activity. Right: the
// open activity's details (ActivityCategoryDetail's `pixel` layout). On a
// phone the two take turns. Only rendered in the pixel look (Activities.jsx).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivityManager } from "@/components/activities/ActivityCustomizationMenu";
import ActivityCategoryDetail from "@/components/activities/ActivityCategoryDetail";
import { indexById, getAncestorIds, getChildren, getRootCategories, MAX_RENDER_DEPTH } from "@/lib/categoryTreeUtils";
import { categoryIdOf, countsTowardTotals } from "@/lib/planner/rollup";
import { sharedList } from "@/lib/sharedLists";
import { usePixelDeskHeight } from "@/components/tasks/usePixelDeskHeight";
import "@/styles/pixel/tasks.css";

// Each activity's count: entries done in it or anything under it
// (cycle-guarded, depth-clamped walk).
function useSubtreeCounts(categories, activities) {
  return useMemo(() => {
    const done = activities.filter(countsTowardTotals);
    const idsOf = (a) => new Set([categoryIdOf(a), ...(a.activity_category_ids || [])].filter(Boolean));
    const doneIds = done.map(idsOf);
    const out = {};
    for (const c of categories) {
      const sub = new Set([c.id]);
      const walk = (id, depth) => {
        if (depth > MAX_RENDER_DEPTH * 4) return;
        for (const k of getChildren(id, categories)) {
          if (sub.has(k.id)) continue;
          sub.add(k.id); walk(k.id, depth + 1);
        }
      };
      walk(c.id, 0);
      let n = 0;
      for (const ids of doneIds) { for (const id of ids) { if (sub.has(id)) { n += 1; break; } } }
      out[c.id] = n;
    }
    return out;
  }, [categories, activities]);
}

export default function ActivitiesPixel({ desk, openId, setOpenId }) {
  const navigate = useNavigate();
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: activities = [] } = useQuery({ ...sharedList("activities") });
  const counts = useSubtreeCounts(categories, activities);
  const byId = useMemo(() => indexById(categories), [categories]);

  const [query, setQuery] = useState("");
  const deskRef = useRef(null);
  usePixelDeskHeight(deskRef, desk);
  const [createRequest, setCreateRequest] = useState(0);
  const [createSubRequest, setCreateSubRequest] = useState(null);
  const [editRequest, setEditRequest] = useState(null);
  const [expandRequest, setExpandRequest] = useState(null);

  // A computer always shows one activity: the first, until one is picked.
  useEffect(() => {
    if (desk && !openId && categories.length) {
      const first = getRootCategories(categories)[0];
      if (first) setOpenId(first.id);
    }
  }, [desk, openId, categories, setOpenId]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q
    ? categories.filter((c) => (c.name || "").toLowerCase().includes(q)).slice(0, 100)
    : []), [q, categories]);
  const pathOf = (c) => getAncestorIds(c.id, byId).reverse().map((id) => byId[id]?.name).filter(Boolean).join(" / ");

  // On a phone, a picked activity takes the whole screen.
  const showTree = desk || !openId;
  const open = (id) => { setOpenId(id); setQuery(""); };
  const rename = (id) => { setEditRequest({ id, n: Date.now() }); setQuery(""); };
  const addSub = (id) => { setCreateSubRequest({ id, n: Date.now() }); setQuery(""); };

  const tree = (
    <aside className="pa-panel pa-side" data-tour="activities-manage">
      <div className="pa-ttl">
        <h1 className="pt-h1">Activities</h1>
        <span className="pa-ttl-acts">
          <button type="button" className="pa-btn sm" onClick={() => { setQuery(""); setCreateRequest((n) => n + 1); }}>+ activity</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pa-btn sm" aria-label="More">...</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setExpandRequest({ all: true, n: Date.now() })}>Unfold everything</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setExpandRequest({ all: false, n: Date.now() })}>Fold everything</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/planner")}>Open the Planner</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/todo")}>Open the To-do list</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <div className="pa-searchrow">
        <input className="pa-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search activities..." aria-label="Search activities" />
      </div>
      {q ? (
        <div className="pa-tree">
          {matches.length === 0 && <p className="pa-empty">Nothing matches.</p>}
          {matches.map((c) => (
            <button key={c.id} type="button" className={`pa-row pa-hit${openId === c.id ? " open" : ""}`} onClick={() => open(c.id)}>
              <span className="pa-sq" style={{ background: c.color || "#8b5cf6" }} />
              <span className="pa-name">{c.name}<span className="pa-hitpath">{pathOf(c)}</span></span>
              <span className="pa-count">{counts[c.id] || 0}</span>
            </button>
          ))}
        </div>
      ) : (
        <ActivityManager pixel onOpen={open} openId={openId} countFor={(id) => counts[id] || 0}
          createRequest={createRequest} createSubRequest={createSubRequest}
          editRequest={editRequest} expandRequest={expandRequest} />
      )}
      <p className="pa-foot">Drag to nest or reorder. Hold, right-click or tap ... for rename, colour, sub-activity, move or delete.</p>
    </aside>
  );

  const detail = openId ? (
    <ActivityCategoryDetail pixel desk={desk} categoryId={openId} onBack={() => setOpenId(null)} onOpen={open}
      onRename={(id) => { if (!desk) setOpenId(null); rename(id); }}
      onAddSub={(id) => { if (!desk) setOpenId(null); addSub(id); }} />
  ) : (
    <div className="pa-panel pa-pickone">
      <div className="pa-ttl"><span>Activity</span></div>
      <p className="pa-empty">Pick an activity to see how it&apos;s been going, who it matters to, and its sub-activities.</p>
    </div>
  );

  return (
    <div ref={deskRef} className={desk ? "pa-desk" : "pa-phone"}>
      {showTree && tree}
      {(desk || openId) && detail}
    </div>
  );
}
