import React, { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, ArrowDownAZ, ListOrdered, ArrowUpAZ, EyeOff, Plus, TrendingDown, TrendingUp, Filter, MoreHorizontal, SlidersHorizontal, ChevronDown
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import AlterCard from "./AlterCard";
import AlterGridView from "./AlterGridView";
import FolderGroupsSection from "./FolderGroupsSection.jsx";
import useAnonymizeMode from "@/hooks/useAnonymizeMode";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import { useTerms } from "@/lib/useTerms";
import { headerLookOnCards, setHeaderLookOnCards } from "@/lib/headerLook";
import { useAlterOrder } from "@/lib/alterOrder";
import { TOUR_DEMO_ALTERS } from "@/lib/tourDemoData";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import PinnedAltersGallery from "./PinnedAltersGallery";
import SubsystemAlterList from "./SubsystemAlterList";
import AlterFilterPopup from "./AlterFilterPopup";
import MassArchiveModal from "./MassArchiveModal";
import { getAltersInsideSubsystems, getMemberAlters, getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { rootGroups as topLevelGroups } from "@/lib/groupTree";

export default function AlterGrid({ alters }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const isDemo = alters.length === 0 && !!window.__tourActive;
  const effectiveAlters = isDemo ? TOUR_DEMO_ALTERS : alters;
  const [search, setSearch] = useState("");
  // Sort + filter arrangement persist for the session so returning to the alters
  // page (after viewing an alter, a subsystem, etc.) keeps the view you set up
  // rather than snapping back to the default. sessionStorage = per-session, so a
  // fresh app launch still starts clean.
  // System-wide manual order → an id→position index (null when unset).
  const { entries: manualEntries, placedIndex } = useAlterOrder();
  // Only the alters the user actually placed get a position; everyone
  // else stays undefined and falls through to the normal sort.
  const manualIndex = React.useMemo(
    () => (manualEntries.length ? placedIndex(effectiveAlters) : null),
    [manualEntries, placedIndex, effectiveAlters],
  );
  const [sortMode, setSortMode] = useState(() => {
    try { return sessionStorage.getItem("alterGrid_sortMode") || "alpha-asc"; } catch { return "alpha-asc"; }
  });
  // With an arrangement set, "My order" joins the cycle (and leads it).
  useEffect(() => {
    if (manualEntries.length && !sessionStorage.getItem("alterGrid_sortMode")) setSortMode("manual");
  }, [manualEntries.length]); // "alpha-asc" | "alpha-desc" | "most" | "least"
  useEffect(() => {
    try { sessionStorage.setItem("alterGrid_sortMode", sortMode); } catch { /* storage off */ }
  }, [sortMode]);
  const [showFolders, setShowFolders] = useState(() => {
    const saved = localStorage.getItem("alter_show_folders");
    return saved == null ? true : saved === "true";
  });
  useEffect(() => {
    try { localStorage.setItem("alter_show_folders", String(showFolders)); } catch {}
  }, [showFolders]);
  // displayMode cycles: "list" | "2" | "3" | "4" | "5"
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem("alter_display_mode");
    if (saved) return saved;
    const oldCols = localStorage.getItem("alter_grid_cols");
    if (oldCols) return oldCols;
    return "list";
  });
  // Groups' own view mode — independent of the Alters section above. Seeds
  // from whatever alter_display_mode already holds (so existing users see
  // no visual change on first load post-upgrade), then diverges the moment
  // either toggle is cycled.
  const [groupsDisplayMode, setGroupsDisplayMode] = useState(() => {
    const saved = localStorage.getItem("alter_groups_display_mode");
    if (saved) return saved;
    const savedAlters = localStorage.getItem("alter_display_mode");
    if (savedAlters) return savedAlters;
    const oldCols = localStorage.getItem("alter_grid_cols");
    if (oldCols) return oldCols;
    return "list";
  });
  // anonymize cycles: "off" | "names" | "all" — persisted to localStorage
  // so the toggle applies system-wide (Dashboard's Currently Fronting
  // widget reads the same mode).
  const { mode: anonymize, setMode: setAnonymize } = useAnonymizeMode();
  // The header look on cards (v0.320.0): on unless turned off.
  const [headerBg, setHeaderBg] = useState(() => headerLookOnCards());
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [hideGrouped, setHideGrouped] = useState(() => localStorage.getItem("alter_hide_grouped") === "true");
  // Listing filter: nested vs flat, plus multi-select group/subsystem
  // membership with Any (union) / All (intersection) matching. Edited
  // through the AlterFilterPopup.
  const [filters, setFilters] = useState(() => {
    try {
      const raw = sessionStorage.getItem("alterGrid_filters");
      if (raw) return JSON.parse(raw);
    } catch { /* storage off / bad JSON */ }
    return { nested: true, groupIds: [], subsystemIds: [], roles: [], mode: "any" };
  });
  useEffect(() => {
    try { sessionStorage.setItem("alterGrid_filters", JSON.stringify(filters)); } catch { /* storage off */ }
  }, [filters]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [massArchiveOpen, setMassArchiveOpen] = useState(false);

  const DISPLAY_CYCLE = ["list", "2", "3", "4", "5"];
  // Every control here has words (UI critique H2): the less-used ones live in
  // worded menus instead of a row of bare icons a new alter has to decode.
  const pickDisplayMode = (v) => { setDisplayMode(v); try { localStorage.setItem("alter_display_mode", v); } catch { /* storage off */ } };
  const pickGroupsDisplayMode = (v) => { setGroupsDisplayMode(v); try { localStorage.setItem("alter_groups_display_mode", v); } catch { /* storage off */ } };
  const LAYOUT_LABELS = { list: "List", 2: "2 columns", 3: "3 columns", 4: "4 columns", 5: "5 columns" };


  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list()
  });

  // Canonical active-front query (server-filters is_active:true, no row cap, and
  // every set-front/switch invalidates it). Filtering the 50-row ["frontHistory"]
  // list instead meant a long-running fronter whose session had dropped below the
  // newest 50 by start_time wouldn't get a fronting rank — so they showed as a
  // fronter elsewhere but didn't float to the top of this list ("only this one
  // alter"). Same root cause as the dashboard CurrentFronters fix.
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true })
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: sortMode === "most" || sortMode === "least",
    staleTime: 60000,
  });

  const alterFrontTotals = useMemo(() => {
    if (sortMode === "alpha-asc" || sortMode === "alpha-desc") return {};
    const totals = {};
    for (const s of allSessions) {
      const dur = s.end_time && s.start_time ? new Date(s.end_time) - new Date(s.start_time) : 0;
      if (s.alter_id) {
        totals[s.alter_id] = (totals[s.alter_id] || 0) + dur;
      } else {
        // Legacy session format
        if (s.primary_alter_id) totals[s.primary_alter_id] = (totals[s.primary_alter_id] || 0) + dur;
        for (const id of (s.co_fronter_ids || [])) {
          totals[id] = (totals[id] || 0) + dur;
        }
      }
    }
    return totals;
  }, [allSessions, sortMode]);

  // Build a fronting rank map: 0 = primary, 1 = co-fronter, absent = not fronting
  const frontingRank = useMemo(() => {
    const map = {};
    for (const s of activeSessions) {
      if (s.alter_id) {
        // New individual-session model
        if (!(s.alter_id in map)) map[s.alter_id] = s.is_primary ? 0 : 1;
      } else {
        // Legacy model
        if (s.primary_alter_id) map[s.primary_alter_id] = 0;
        for (const id of (s.co_fronter_ids || [])) {
          if (!(id in map)) map[id] = 1;
        }
      }
    }
    return map;
  }, [activeSessions]);

  // Build set of alter IDs that belong to at least one group
  const groupedAlterIds = useMemo(() => {
    const ids = new Set();
    for (const g of allGroups) {
      for (const spId of (g.member_sp_ids || [])) {
        const alter = effectiveAlters.find(a => a.sp_id === spId);
        if (alter) ids.add(alter.id);
      }
    }
    // Also catch legacy: alter.groups array
    for (const a of effectiveAlters) {
      if ((a.groups || []).length > 0) ids.add(a.id);
    }
    return ids;
  }, [allGroups, effectiveAlters]);

  const filtered = effectiveAlters.
  filter(
    (a) =>
    !a.is_archived &&
    (filters.roles.length === 0 || filters.roles.includes((a.role || "").trim())) &&
    (!hideGrouped || !groupedAlterIds.has(a.id)) && (
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.role?.toLowerCase().includes(search.toLowerCase()) ||
    a.pronouns?.toLowerCase().includes(search.toLowerCase()))
  ).
  sort((a, b) => {
    // Fronters first — always (owner). The chosen order then arranges
    // each band, including "my order" (the hand-set arrangement).
    const ra = frontingRank[a.id] ?? 2;
    const rb = frontingRank[b.id] ?? 2;
    if (ra !== rb) return ra - rb;
    if (sortMode === "manual" && manualIndex) {
      const ma = manualIndex.get(a.id);
      const mb = manualIndex.get(b.id);
      if (ma !== undefined && mb !== undefined) return ma - mb;
      if (ma !== undefined) return -1;
      if (mb !== undefined) return 1;
    }
    if (sortMode === "most") return (alterFrontTotals[b.id] || 0) - (alterFrontTotals[a.id] || 0);
    if (sortMode === "least") return (alterFrontTotals[a.id] || 0) - (alterFrontTotals[b.id] || 0);
    const cmp = (a.name || "").localeCompare(b.name || "");
    return sortMode === "alpha-desc" ? -cmp : cmp;
  });

  // Root-level groups for display
  const rootGroups = topLevelGroups(allGroups);

  // Alters that live inside someone's subsystem — by default they show
  // nested under their owner in the list (not flat at the top level).
  const insideSubsystems = useMemo(
    () => getAltersInsideSubsystems(allGroups, effectiveAlters),
    [allGroups, effectiveAlters]
  );
  // Alters hidden from the main list via a group's "hide from lists"
  // toggle (configured on the group profile). Excluded from the default
  // view; still visible when searching, in the flat view, or when that
  // group is the active filter.
  const hiddenFromLists = useMemo(
    () => getAlterIdsByGroupFlag(allGroups, effectiveAlters, "hide_from_lists"),
    [allGroups, effectiveAlters]
  );

  const regularGroups = allGroups.filter((g) => !g.owner_alter_id);
  const subsystemGroups = allGroups.filter((g) => g.owner_alter_id);
  // Distinct, non-empty roles across the system — drives the role filter pills.
  const allRoles = useMemo(
    () => [...new Set(effectiveAlters.map((a) => (a.role || "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y)),
    [effectiveAlters]
  );

  // Selected group/subsystem ids → the set of alter ids that match, using
  // Any (union) or All (intersection) of the selected memberships.
  const selectedFilterIds = [...filters.groupIds, ...filters.subsystemIds];
  const hasMembershipFilter = selectedFilterIds.length > 0;
  const filterMemberIds = useMemo(() => {
    if (!hasMembershipFilter) return null;
    const sets = selectedFilterIds.map((id) => {
      const g = allGroups.find((x) => x.id === id);
      return g ? new Set(getMemberAlters(g, effectiveAlters).map((a) => a.id)) : new Set();
    });
    if (filters.mode === "all") {
      return sets.reduce((acc, s) => (acc === null ? s : new Set([...acc].filter((id) => s.has(id)))), null) || new Set();
    }
    const union = new Set();
    sets.forEach((s) => s.forEach((id) => union.add(id)));
    return union;
  }, [allGroups, effectiveAlters, selectedFilterIds.join(","), filters.mode]);

  const isExplicitFilter = hasMembershipFilter || filters.roles.length > 0;
  const activeFilterCount = selectedFilterIds.length + filters.roles.length;
  const filterActive = activeFilterCount > 0 || !filters.nested;
  // Flat (unnested) list when searching, when a membership/role filter is on,
  // or when the user chose the flat list style.
  const showFlat = !!search || hasMembershipFilter || filters.roles.length > 0 || !filters.nested;

  // Top-level list = filtered alters that aren't inside a subsystem and
  // aren't hidden by a group flag (nested view only).
  const topLevelAlters = search
    ? filtered
    : filtered.filter((a) => !insideSubsystems.has(a.id) && !hiddenFromLists.has(a.id));
  // Flat list. With a membership filter, show its members (incl. hidden ones —
  // explicitly chosen). When searching, show every match so hidden alters are
  // still findable. When flat is on via the toggle (no search/filter), show
  // everyone EXCEPT alters a group setting hides from lists — i.e. flatten the
  // subsystem nesting but still honour the "hide from lists" setting.
  const flatAlters = filterMemberIds
    ? filtered.filter((a) => filterMemberIds.has(a.id))
    : (search ? filtered : filtered.filter((a) => !hiddenFromLists.has(a.id)));
  const visibleAlters = showFlat ? flatAlters : topLevelAlters;

  const groupControls = () => (
    <div data-tour="alter-groups-controls" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setCreateGroupOpen(true)}
        className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap">
        <Plus className="w-4 h-4" /> New group
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Group options"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuCheckboxItem checked={showFolders} onCheckedChange={(v) => setShowFolders(!!v)}>
            Show groups
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Group layout</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={groupsDisplayMode} onValueChange={pickGroupsDisplayMode}>
            {DISPLAY_CYCLE.map((m) => <DropdownMenuRadioItem key={m} value={m}>{LAYOUT_LABELS[m]}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/groups")}>Manage groups…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const SORT_OPTIONS = [
    ...(manualEntries.length || sortMode === "manual" ? [{ id: "manual", label: "My order", Icon: ListOrdered }] : []),
    { id: "alpha-asc", label: "A → Z", Icon: ArrowDownAZ },
    { id: "alpha-desc", label: "Z → A", Icon: ArrowUpAZ },
    { id: "most", label: `Most ${terms.fronting} time`, Icon: TrendingDown },
    { id: "least", label: `Least ${terms.fronting} time`, Icon: TrendingUp },
  ];
  const currentSort = SORT_OPTIONS.find((o) => o.id === sortMode) || SORT_OPTIONS[0];
  const ANON_LABELS = { off: "Off", names: "Blur names", avatars: "Blur pictures", all: "Blur names and pictures" };

  return (
    <div>
      {isDemo && (
        <div className="mb-2 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[0.625rem] text-primary/80 text-center">
          Tour Preview — sample {terms.alters}
        </div>
      )}
      {/* Content (search + filters live just above the alters list, below groups) */}
      <div className="space-y-4">
        {/* Pinned alters — quick-access gallery, sits above groups.
            Self-contained component; renders nothing when none pinned. */}
        <PinnedAltersGallery />

        {/* Groups section — header always visible */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Groups</p>
            <div className="flex-1 h-px bg-border/50" />
            {groupControls()}
          </div>
          {rootGroups.length > 0 && showFolders && (
            <FolderGroupsSection
              alters={effectiveAlters.filter((a) => !a.is_archived)}
              sortDir={sortMode === "alpha-desc" ? "desc" : "asc"}
              activeSessions={activeSessions}
              anonymize={anonymize}
              displayMode={groupsDisplayMode}
            />
          )}
          {rootGroups.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 pb-1">No groups yet — tap New group to make one.</p>
          )}
        </div>

        {/* Search + filters — sits right above the alters list, below groups */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={`Search ${terms.alters}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 h-9 border-border/50 bg-transparent" />
          </div>

          {/* Sort — a worded menu, not a cycle you have to remember */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" data-tour="alter-sort" aria-label={`Sort: ${currentSort.label}`}
                className="flex-shrink-0 flex items-center gap-1 h-9 px-2.5 rounded-xl border border-border/50 bg-card/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap">
                <currentSort.Icon className="w-4 h-4" />
                <span className="max-w-[7rem] truncate">{currentSort.label}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortMode} onValueChange={setSortMode}>
                {SORT_OPTIONS.map((o) => <DropdownMenuRadioItem key={o.id} value={o.id}>{o.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter — opens a popup for nested/flat + group/subsystem/role multi-select */}
          {(regularGroups.length > 0 || subsystemGroups.length > 0 || allRoles.length > 0) && (
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={`flex-shrink-0 flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl border text-xs font-medium transition-colors ${filterActive ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-border/50 bg-card/50 hover:text-foreground hover:bg-accent"}`}>
              <Filter className="w-4 h-4" />
              Filter{activeFilterCount > 0 && <span className="font-semibold"> · {activeFilterCount}</span>}
            </button>
          )}
        </div>

        {/* Alters list/grid */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{terms.Alters}</p>
            <div className="flex-1 h-px bg-border/50" />
            <div className="flex items-center gap-1">
              <AlterLabelToggle size="xs" />
              {/* Screenshot mode is a privacy state, so while it's on it
                  shows as a worded chip that turns it off in one tap. */}
              {anonymize !== "off" && (
                <button type="button" onClick={() => setAnonymize("off")}
                  className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-primary bg-primary/10">
                  <EyeOff className="w-4 h-4" /> {ANON_LABELS[anonymize]} · turn off
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" data-tour="alter-view-toggle"
                    className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap">
                    <SlidersHorizontal className="w-4 h-4" /> View
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Layout</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={displayMode} onValueChange={pickDisplayMode}>
                    {DISPLAY_CYCLE.map((m) => <DropdownMenuRadioItem key={m} value={m}>{LAYOUT_LABELS[m]}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={!filters.nested} onCheckedChange={(v) => setFilters((f) => ({ ...f, nested: !v }))}>
                    Everyone in one flat list
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={hideGrouped} onCheckedChange={(v) => { setHideGrouped(!!v); try { localStorage.setItem("alter_hide_grouped", v ? "true" : "false"); } catch { /* storage off */ } }}>
                    Hide {terms.alters} already in a group
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
                  <DropdownMenuItem onSelect={() => setMassArchiveOpen(true)}>Archive several {terms.alters}…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {visibleAlters.length > 0 ?
          displayMode === "list" ?
          // List view nests subsystems: owners show an expander, members
          // render indented beneath. When searching or an explicit filter
          // is active, falls back to a flat list.
          (showFlat ? (
            <div className="mx-auto flex flex-col gap-2">
              {visibleAlters.map((alter, i) =>
                <AlterCard key={alter.id} alter={alter} index={i} activeSessions={activeSessions} anonymize={anonymize} />
              )}
            </div>
          ) : (
            <SubsystemAlterList
              topAlters={topLevelAlters}
              allAlters={effectiveAlters}
              allGroups={allGroups}
              activeSessions={activeSessions}
              anonymize={anonymize}
              persistKey="altersMain"
            />
          )) :

          // Grid: nest subsystems in the default view; in a flat/filtered
          // view pass no groups so cards render unnested.
          <AlterGridView alters={visibleAlters} activeSessions={activeSessions} allAlters={effectiveAlters} allGroups={showFlat ? [] : allGroups} cols={parseInt(displayMode)} anonymize={anonymize} persistKey="altersMainGrid" /> :


          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="text-4xl mb-3">{search ? "🔍" : isExplicitFilter ? "🔎" : hideGrouped ? "📁" : "👥"}</div>
              <p className="text-sm font-medium text-foreground mb-1">
                {search ? "No matches found" : isExplicitFilter ? `No ${terms.alters} in this filter` : hideGrouped ? `All ${terms.alters} are in groups` : `No ${terms.alters} yet`}
              </p>
              <p className="text-xs text-muted-foreground">
                {search ? `Try a different search term` : isExplicitFilter ? `Pick a different filter above` : hideGrouped ? `Toggle the group filter to see them` : `Add your first ${terms.alter} to get started`}
              </p>
            </div>
          }
        </div>
      </div>

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />

      <MassArchiveModal
        open={massArchiveOpen}
        onClose={() => setMassArchiveOpen(false)}
      />

      {filterOpen && (
        <AlterFilterPopup
          filters={filters}
          onChange={setFilters}
          regularGroups={regularGroups}
          subsystemGroups={subsystemGroups}
          roles={allRoles}
          terms={terms}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>);

}