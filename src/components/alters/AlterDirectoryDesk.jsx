// The alters directory in the pixel look on a computer (the "Alters"
// mockup): a Groups panel on the left, a Find / Sort / Grid·List·Tree
// toolbar over the cards, an Info panel on the right for the picked card
// and a status line along the bottom.
//
// Layout only. Every bit of state, every filter and every menu comes from
// AlterGrid, so the stacked (phone / smooth) page and this one always do
// the same things: the group rows set the same membership filter as the
// Filter popup, "No group" is the "Hide {alters} already in a group"
// switch, Grid/List/Tree are the Layout + "Everyone in one flat list"
// choices, and the ⋯ menu holds the rest of the View menu.

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, MoreHorizontal, EyeOff, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTerms } from "@/lib/useTerms";
import { setHeaderLookOnCards } from "@/lib/headerLook";
import { flattenGroupTree } from "@/lib/groupTree";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { anonymizeBlurNames } from "@/hooks/useAnonymizeMode";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import SubsystemAlterList from "./SubsystemAlterList";
import PinnedAltersGallery from "./PinnedAltersGallery";
import PixelAlterInfo from "./PixelAlterInfo";
import "@/styles/pixel/alters.css";

const H = 3600000;
const membersOf = (s) => (s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean));

// "2 h ago", "yesterday", "last week"… for when someone was last in front.
function ago(ms, now = Date.now()) {
  const d = now - ms;
  if (d < H) return `${Math.max(1, Math.round(d / 60000))} min ago`;
  if (d < 24 * H) return `${Math.round(d / H)} h ago`;
  const days = Math.floor(d / (24 * H));
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "a month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return days < 730 ? "a year ago" : `${Math.floor(days / 365)} years ago`;
}

const COLLAPSE_KEY = "pxa_groups_collapsed";

export default function AlterDirectoryDesk(p) {
  const {
    effectiveAlters, allGroups, activeSessions, allSessions, frontingRank, anonymize, setAnonymize,
    search, setSearch, sortMode, setSortMode, SORT_OPTIONS, currentSort,
    filters, setFilters, selectedFilterIds, hasMembershipFilter, filterActive, activeFilterCount,
    regularGroups, subsystemGroups, allRoles, hideGrouped, setHideGrouped, groupedAlterIds,
    displayMode, pickDisplayMode, DISPLAY_CYCLE, LAYOUT_LABELS, headerBg, setHeaderBg, ANON_LABELS,
    visibleAlters, topLevelAlters, showFlat, isExplicitFilter, isDemo,
    groupControls, setCreateGroupOpen, setFilterOpen, setMassArchiveOpen,
    onAddAlter, onImport, menuExtras = [], systemCard, archivedCount = 0, children,
  } = p;
  const t = useTerms();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(COLLAPSE_KEY) || "[]")); } catch { return new Set(); }
  });
  const toggleCollapsed = (id) => setCollapsed((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* storage off */ }
    return next;
  });

  // The workspace fills the window below wherever the page puts it (the
  // frame's tabs, a preview banner…), down to the frame's status bar.
  const rootRef = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      const main = document.getElementById("main-content");
      const scroller = main && main.scrollHeight > main.clientHeight ? main : null;
      const top = el.getBoundingClientRect().top + (scroller ? scroller.scrollTop : window.scrollY);
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const bottom = main ? Math.max(0, window.innerHeight - main.getBoundingClientRect().bottom) + pad : 0;
      setHeight(Math.max(460, Math.round(window.innerHeight - top - bottom - 12)));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && rootRef.current?.parentElement) ro.observe(rootRef.current.parentElement.parentElement || rootRef.current.parentElement);
    window.addEventListener("resize", fit);
    const id = setTimeout(fit, 400);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); clearTimeout(id); };
  }, []);

  const active = useMemo(() => effectiveAlters.filter((a) => !a.is_archived), [effectiveAlters]);

  // ── Groups tree ────────────────────────────────────────────────────────
  const tree = useMemo(() => flattenGroupTree(allGroups, { sort: "order" }), [allGroups]);
  const rows = useMemo(() => {
    const out = [];
    let hideBelow = null; // depth of a collapsed ancestor
    tree.forEach((g, i) => {
      if (hideBelow != null && g._depth > hideBelow) return;
      hideBelow = null;
      const hasKids = !!tree[i + 1] && tree[i + 1]._depth > g._depth;
      out.push({ g, hasKids });
      if (hasKids && collapsed.has(g.id)) hideBelow = g._depth;
    });
    return out;
  }, [tree, collapsed]);
  const onlyGroup = selectedFilterIds.length === 1 && filters.roles.length === 0 ? selectedFilterIds[0] : null;
  const pickGroup = (g) => {
    if (hideGrouped) { setHideGrouped(false); try { localStorage.setItem("alter_hide_grouped", "false"); } catch { /* storage off */ } }
    setFilters((f) => (onlyGroup === g?.id || !g
      ? { ...f, groupIds: [], subsystemIds: [] }
      : { ...f, groupIds: g.owner_alter_id ? [] : [g.id], subsystemIds: g.owner_alter_id ? [g.id] : [], mode: "any" }));
  };
  const pickNoGroup = () => {
    const v = !hideGrouped;
    setHideGrouped(v);
    try { localStorage.setItem("alter_hide_grouped", v ? "true" : "false"); } catch { /* storage off */ }
    if (v) setFilters((f) => ({ ...f, groupIds: [], subsystemIds: [] }));
  };
  const ungroupedCount = active.filter((a) => !groupedAlterIds.has(a.id)).length;

  // ── Cards: front status line + last time in front ─────────────────────
  const lastFront = useMemo(() => {
    const m = {};
    for (const s of allSessions) {
      const end = s.end_time ? new Date(s.end_time).getTime() : null;
      if (!end) continue;
      for (const id of membersOf(s)) if (!m[id] || m[id] < end) m[id] = end;
    }
    return m;
  }, [allSessions]);
  const cardMeta = (a) => {
    const rank = frontingRank[a.id];
    if (rank === 0) return { front: t.fronting };
    if (rank === 1) return { front: `co-${t.fronting}` };
    return { front: lastFront[a.id] ? ago(lastFront[a.id]) : "" };
  };

  // ── View: Grid / List / Tree ──────────────────────────────────────────
  const view = displayMode === "list" ? (filters.nested ? "tree" : "list") : "grid";
  const [lastCols, setLastCols] = useState(() => (displayMode !== "list" ? displayMode : "5"));
  const pickView = (v) => {
    if (v === "grid") { pickDisplayMode(displayMode !== "list" ? displayMode : lastCols); return; }
    if (displayMode !== "list") setLastCols(displayMode);
    pickDisplayMode("list");
    setFilters((f) => ({ ...f, nested: v === "tree" }));
  };

  const selected = selectedId ? active.find((a) => a.id === selectedId) || null : null;
  const selectedGroups = selected ? allGroups.filter((g) => getMemberAlters(g, [selected]).length > 0) : [];
  const frontingCount = active.filter((a) => frontingRank[a.id] != null).length;
  const showFilter = regularGroups.length > 0 || subsystemGroups.length > 0 || allRoles.length > 0;

  return (
    <div className="pxa" ref={rootRef} style={height ? { height } : undefined}>
      {/* ── Groups ── */}
      <aside className="pxa-side pxa-groups" aria-label="Groups" data-tour="alters-groups-panel">
        <div className="pxa-ttl">
          <span>Groups</span>
          <span className="flex items-center gap-1">
            <button type="button" className="pxa-ttl-btn" onClick={() => setCreateGroupOpen(true)}>+ group</button>
            {groupControls()}
          </span>
        </div>
        <div className="pxa-tree">
          <button type="button" className={`pxa-row${!hasMembershipFilter && !hideGrouped ? " sel" : ""}`}
            aria-pressed={!hasMembershipFilter && !hideGrouped} onClick={() => pickGroup(null)}>
            <span className="pxa-arrow" aria-hidden="true" />
            <span className="pxa-swatch" style={{ background: "var(--px-text)" }} aria-hidden="true" />
            <span className="pxa-row-name">Everyone</span>
            <span className="pxa-count">{active.length}</span>
          </button>
          {rows.map(({ g, hasKids }) => {
            const count = getMemberAlters(g, active).length;
            const sel = onlyGroup === g.id;
            const open = !collapsed.has(g.id);
            return (
              <div key={g.id} className={`pxa-row${sel ? " sel" : ""}`} style={{ paddingLeft: 4 + g._depth * 16 }}>
                {hasKids ? (
                  <button type="button" className="pxa-arrow" aria-expanded={open}
                    aria-label={`${open ? "Fold" : "Unfold"} ${g.name}`} onClick={() => toggleCollapsed(g.id)}>
                    {open ? "v" : ">"}
                  </button>
                ) : <span className="pxa-arrow" aria-hidden="true" />}
                <button type="button" className="pxa-pick" aria-pressed={sel} onClick={() => pickGroup(g)}
                  onDoubleClick={() => navigate(`/group/${g.id}`)} title="Click to show its members, double-click to open">
                  <span className="pxa-swatch" style={g.color ? { background: g.color } : undefined} aria-hidden="true" />
                  <span className={`pxa-row-name${anonymizeBlurNames(anonymize) ? " blur-sm" : ""}`}>
                    {g.name}{g.owner_alter_id ? ` (sub${t.system})` : ""}
                  </span>
                  <span className="pxa-count">{count}</span>
                </button>
                <button type="button" className="pxa-open" aria-label={`Open ${g.name}`} title="Open group"
                  onClick={() => navigate(`/group/${g.id}`)}>›</button>
              </div>
            );
          })}
          {tree.length > 0 && (
            <button type="button" className={`pxa-row${hideGrouped ? " sel" : ""}`} aria-pressed={hideGrouped} onClick={pickNoGroup}>
              <span className="pxa-arrow" aria-hidden="true" />
              <span className="pxa-swatch" style={{ background: "var(--px-hi)" }} aria-hidden="true" />
              <span className="pxa-row-name">No group</span>
              <span className="pxa-count">{ungroupedCount}</span>
            </button>
          )}
          {tree.length === 0 && <p className="pxa-hint">No groups yet. Use + group to make one.</p>}
        </div>
        <div className="pxa-side-foot">
          <button type="button" className="pxa-btn" onClick={() => navigate("/settings#archived-alters")}>Archived ({archivedCount})</button>
          <button type="button" className="pxa-btn" onClick={onImport}>Import from another app</button>
        </div>
      </aside>

      {/* ── Toolbar + cards ── */}
      <section className="pxa-main" aria-label={t.Alters}>
        <div className="pxa-toolbar">
          <label htmlFor="pxa-find" className="pxa-lbl">Find</label>
          <span className="pxa-find">
            <Search aria-hidden="true" />
            <input id="pxa-find" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, role, pronouns..." />
          </span>
          <span className="pxa-lbl">Sort</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pxa-select" data-tour="alter-sort" aria-label={`Sort: ${currentSort.label}`}>
                <span className="truncate">{currentSort.label}{sortMode === "most" || sortMode === "least" ? " first" : ""}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortMode} onValueChange={setSortMode}>
                {SORT_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.id} value={o.id}>{o.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {showFilter && (
            <button type="button" className={`pxa-btn${filterActive ? " on" : ""}`} onClick={() => setFilterOpen(true)}>
              <Filter aria-hidden="true" /> Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
          )}
          <span className="flex-1" />
          <div role="radiogroup" aria-label="View" className="pxa-seg">
            {[["grid", "Grid"], ["list", "List"], ["tree", "Tree"]].map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v}
                className={`pxa-btn${view === v ? " on" : ""}`} onClick={() => pickView(v)}>{label}</button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pxa-btn pxa-icon" data-tour="alter-view-toggle" aria-label="View options">
                <MoreHorizontal aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Grid columns</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={displayMode} onValueChange={pickDisplayMode}>
                {DISPLAY_CYCLE.map((m) => <DropdownMenuRadioItem key={m} value={m}>{LAYOUT_LABELS[m]}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={!filters.nested} onCheckedChange={(v) => setFilters((f) => ({ ...f, nested: !v }))}>
                Everyone in one flat list
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={hideGrouped} onCheckedChange={() => pickNoGroup()}>
                Hide {t.alters} already in a group
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={headerBg} onCheckedChange={(v) => { setHeaderBg(!!v); setHeaderLookOnCards(!!v); }}>
                Profile header look on cards
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Screenshot mode</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={anonymize} onValueChange={setAnonymize}>
                {Object.entries(ANON_LABELS).map(([k, label]) => <DropdownMenuRadioItem key={k} value={k}>{label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              {menuExtras.map((m) => <DropdownMenuItem key={m.label} onSelect={m.run}>{m.label}</DropdownMenuItem>)}
              <DropdownMenuItem onSelect={() => setMassArchiveOpen(true)}>Archive several {t.alters}…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" className="pxa-btn pxa-new" data-tour="alter-add-btn" onClick={onAddAlter}>+ New {t.alter}</button>
        </div>

        <div className="pxa-floor">
          {isDemo && <p className="pxa-hint">Tour Preview — sample {t.alters}</p>}
          <PinnedAltersGallery />
          {visibleAlters.length > 0 ? (
            view === "grid" ? (
              <AlterGridView alters={visibleAlters} activeSessions={activeSessions} allAlters={effectiveAlters}
                allGroups={showFlat ? [] : allGroups} cols={parseInt(displayMode, 10) || 5} anonymize={anonymize}
                persistKey="altersMainGrid" pixel selectedId={selectedId}
                onSelect={(a) => setSelectedId((cur) => (cur === a.id ? null : a.id))} cardMeta={cardMeta} />
            ) : view === "list" || showFlat ? (
              <div className="pxa-list">
                {visibleAlters.map((alter, i) => (
                  <AlterCard key={alter.id} alter={alter} index={i} activeSessions={activeSessions} anonymize={anonymize} />
                ))}
              </div>
            ) : (
              <div className="pxa-list">
                <SubsystemAlterList topAlters={topLevelAlters} allAlters={effectiveAlters} allGroups={allGroups}
                  activeSessions={activeSessions} anonymize={anonymize} persistKey="altersMain" />
              </div>
            )
          ) : (
            <div className="pxa-empty">
              <p className="pxa-empty-ttl">
                {search ? "No matches found" : isExplicitFilter ? `No ${t.alters} in this filter` : hideGrouped ? `All ${t.alters} are in groups` : `No ${t.alters} yet`}
              </p>
              <p className="pxa-hint">
                {search ? "Try a different search term" : isExplicitFilter ? "Pick a different group or filter" : hideGrouped ? "Pick Everyone to see them" : `Add your first ${t.alter} to get started`}
              </p>
            </div>
          )}
        </div>

        <div className="pxa-status" role="status">
          <span>{active.length} {active.length === 1 ? t.alter : t.alters}</span>
          <span>{frontingCount} {t.fronting}</span>
          <span>{regularGroups.length} {regularGroups.length === 1 ? "group" : "groups"}, {subsystemGroups.length} sub{t.system}{subsystemGroups.length === 1 ? "" : "s"}</span>
          <span className="flex-1" />
          {anonymize !== "off" && (
            <button type="button" className="pxa-link" onClick={() => setAnonymize("off")}>
              <EyeOff aria-hidden="true" /> {ANON_LABELS[anonymize]} · turn off
            </button>
          )}
          <span className="pxa-status-lbl">Labels:</span>
          <AlterLabelToggle size="xs" />
          <span className="pxa-status-tip">Double-click a card to open it</span>
        </div>
      </section>

      {/* ── Info ── */}
      <PixelAlterInfo alter={selected} activeSessions={activeSessions} allSessions={allSessions}
        groups={selectedGroups} anonymize={anonymize} systemCard={systemCard} />
      {children}
    </div>
  );
}
