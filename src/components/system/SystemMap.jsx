import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronUp, ChevronDown, SlidersHorizontal, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buildAbsorptionMap } from "@/lib/absorptionUtils";
import useSystemMapLayout from "@/lib/useSystemMapLayout";
import { computeFrontingTimeAll } from "@/lib/systemMapCompute";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { byGroupOrder } from "@/lib/groupTreeUtils";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

// Resolve legacy local-image:// node avatars before rendering — a raw href on
// those renders broken. Rendered inside nodes.map(), so it must be a child.
function NodeAvatarImage({ node, r, onMouseDown, onClick, onTouchEnd }) {
  const resolved = useResolvedAvatarUrl(node.avatar);
  if (!resolved) return null;
  return (
    <image
      x={node.x - (r - 5)} y={node.y - (r - 5)}
      width={(r - 5) * 2} height={(r - 5) * 2}
      href={resolved}
      preserveAspectRatio="xMidYMid slice"
      clipPath={`url(#clip-circle-${node.id})`}
      style={{ cursor: "pointer" }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onTouchEnd={onTouchEnd}
    />
  );
}

const REL_MODES = ['none', 'simple', 'detailed', 'selected'];
const REL_TITLES = { simple: 'Simple', detailed: 'Detailed', selected: 'Selected only', none: 'Hidden' };

const TIME_MODES = [
  { id: 'total', label: 'All Time' },
  { id: 'primary', label: '⭐ Primary' },
  { id: 'cofronting', label: '👥 Co-front' },
];

// Default display cap. Big systems don't render every member at once —
// the map shows the top N (by the chosen metric) and the Display panel
// lets the user raise/lower N or hand-pick who's shown. 150 keeps the
// full visual treatment (avatars etc. — perf mode starts at 250) and
// stays readable.
const AUTO_DISPLAY_LIMIT = 150;
const DISPLAY_LIMIT_MAX = 500;
const DISPLAY_MODES = [
  { id: 'top_front', label: 'Top front time' },
  { id: 'top_cofront', label: 'Top co-front time' },
  { id: 'custom', label: 'Hand-picked' },
];

// Collapse-into-groups: fold members into a single node per group/subsystem.
// Groups nest, so the depth picks WHICH ancestor the members fold into:
// their immediate group, its parent, or the topmost qualifying ancestor.
const COLLAPSE_MODES = [
  { id: 'off', label: 'Off' },
  { id: 'groups', label: 'Groups' },
  { id: 'subsystems', label: 'Subsystems' },
  { id: 'both', label: 'Both' },
];
const COLLAPSE_DEPTHS = [
  { id: 'immediate', label: 'Immediate' },
  { id: 'parent', label: 'One level up' },
  { id: 'root', label: 'To root' },
];
const MAX_COLLAPSE_CLIMB = 8; // matches MAX_GROUP_DEPTH — cycle/degenerate-chain clamp

// Shape returned by useSystemMapLayout while the worker is still
// computing (or while inputs aren't ready). Frozen so consumers can't
// accidentally mutate it and pollute a sibling render.
const EMPTY_LAYOUT = Object.freeze({
  frontingTime: {},
  frontingTimeAll: {},
  cofrontingTime: {},
  cofrontingTimeAll: {},
  nodePositions: {},
});

const SystemMap = ({ relationships = [] }) => {
  const svgRef = useRef(null);
  const hasAutoFit = useRef(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);
  const lastPinchRef = useRef(null);

  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlter, setSelectedAlter] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const t = useTerms();
  const [cofronterCount, setCofronterCount] = useState(10);
  // Local text mirror so the field can be cleared / mid-typed; the real
  // count is clamped on blur, not on every keystroke (which snapped it
  // back to 10 and made it impossible to type a new value).
  const [cofronterCountText, setCofronterCountText] = useState("10");
  const [cofronters, setCofronters] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [relDisplayMode, setRelDisplayMode] = useState('simple');
  const [timeMode, setTimeMode] = useState('total');

  // Display cap + who's shown (see AUTO_DISPLAY_LIMIT above).
  const [displaySelectMode, setDisplaySelectMode] = useState('top_front');
  const [displayLimit, setDisplayLimit] = useState(AUTO_DISPLAY_LIMIT);
  const [displayLimitText, setDisplayLimitText] = useState(String(AUTO_DISPLAY_LIMIT));
  const [customSelection, setCustomSelection] = useState(() => new Set());
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // Collapse-into-groups controls (see COLLAPSE_MODES above).
  const [collapseMode, setCollapseMode] = useState('off');
  const [collapseDepth, setCollapseDepth] = useState('immediate');

  // Keep transform in a ref so event handlers always see current value without re-registering
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // Pan/zoom WITHOUT React re-renders: gestures write the transform straight
  // onto the content <g> and only commit to state when the gesture ends.
  // Setting state per mousemove re-rendered every node + link each frame —
  // the single biggest reason large systems froze the map.
  const contentGRef = useRef(null);
  const applyTransform = useCallback((next) => {
    transformRef.current = next;
    if (contentGRef.current) {
      contentGRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, []);
  const commitTransform = useCallback(() => { setTransform(transformRef.current); }, []);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => db.Group.list(),
  });

  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => db.FrontingSession.list(),
  });

  const { data: systemChangeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const absorptionMap = useMemo(() => buildAbsorptionMap(systemChangeEvents), [systemChangeEvents]);

  // The heavy compute (frontingTimeAll, cofrontingTimeAll, and the
  // bumper layout that used to live as `nodePositions` below) now runs
  // in a Web Worker — see useSystemMapLayout further down. The previous
  // inline useMemos blocked the main thread for several seconds on
  // large polyfragmented systems and could crash the tab outright; the
  // worker keeps the page responsive even mid-compute. The pure compute
  // logic was extracted to src/lib/systemMapCompute.js so the worker
  // and any future server / main-thread fallback can share it.

  // Collapse assignment: alterId → the group/subsystem node it folds into.
  // Cycle-guarded parent climb, clamped at MAX_COLLAPSE_CLIMB. A parent only
  // counts if it matches the collapse mode (folders vs subsystems), so
  // "collapse to root subsystems" doesn't leak members into folder groups.
  const collapseInfo = useMemo(() => {
    if (collapseMode === 'off' || !groups.length) return null;
    const wantSub = collapseMode === 'subsystems' || collapseMode === 'both';
    const wantFolder = collapseMode === 'groups' || collapseMode === 'both';
    const qualifies = (g) => !!g && ((g.owner_alter_id ? wantSub : wantFolder));
    const byId = {};
    const spToId = {};
    for (const g of groups) { byId[g.id] = g; if (g.sp_id) spToId[g.sp_id] = g.id; }
    const resolveGroup = (ref) => (ref && (byId[ref] || (spToId[ref] ? byId[spToId[ref]] : null))) || null;

    // Immediate qualifying group(s) per alter (via the robust membership walk).
    const memberOf = {};
    for (const g of groups) {
      if (!qualifies(g)) continue;
      for (const m of getMemberAlters(g, alters)) {
        (memberOf[m.id] ||= []).push(g);
      }
    }

    const climb = (g) => {
      if (collapseDepth === 'immediate') return g;
      let cur = g;
      const seen = new Set([g.id]);
      const steps = collapseDepth === 'parent' ? 1 : MAX_COLLAPSE_CLIMB;
      for (let i = 0; i < steps; i++) {
        const p = resolveGroup(cur.parent);
        if (!p || seen.has(p.id) || !qualifies(p)) break;
        seen.add(p.id);
        cur = p;
      }
      return cur;
    };

    const assignment = {};
    const targetGroups = {};
    for (const [alterId, gs] of Object.entries(memberOf)) {
      // Deterministic immediate group when an alter is in several: the same
      // ordering the Groups page uses.
      const immediate = [...gs].sort(byGroupOrder)[0];
      const target = climb(immediate);
      assignment[alterId] = target.id;
      targetGroups[target.id] = target;
    }
    return { assignment, targetGroups };
  }, [collapseMode, collapseDepth, groups, alters]);

  // Absorption map for time-folding, composed with the collapse assignment so
  // absorbed→persistent→group chains resolve in one hop for the worker.
  const layoutAbsorptionMap = useMemo(() => {
    if (!collapseInfo) return absorptionMap;
    const merged = { ...collapseInfo.assignment };
    for (const [from, to] of Object.entries(absorptionMap)) {
      merged[from] = collapseInfo.assignment[to] || to;
    }
    return merged;
  }, [absorptionMap, collapseInfo]);

  // Cheap per-entity totals for RANKING who gets displayed. O(sessions) on the
  // main thread — the heavy pair/slice work stays in the worker; this only
  // feeds the top-N ordering (total for front time, .cofronting for co-front).
  // Folded through the collapse assignment, so collapsed group nodes rank by
  // their members' combined time.
  const rankTimes = useMemo(
    () => computeFrontingTimeAll(frontingSessions, layoutAbsorptionMap),
    [frontingSessions, layoutAbsorptionMap]
  );

  const { filteredAlters, eligibleCount } = useMemo(() => {
    let result = alters.filter(a => showArchived ? true : !a.is_archived);
    if (selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (group) {
        // Match membership the robust way (alter.groups OR member_sp_ids,
        // owner included for a subsystem) — the old member_sp_ids-only
        // check matched almost nothing for local alters (no sp_id), which
        // is why filtering by a group collapsed to a single node.
        const memberIds = new Set(getMemberAlters(group, result).map((a) => a.id));
        if (group.owner_alter_id) memberIds.add(group.owner_alter_id);
        result = result.filter((a) => memberIds.has(a.id));
      }
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) => a.name.toLowerCase().includes(query) || (a.alias && a.alias.toLowerCase().includes(query))
      );
    }
    const eligible = result.length;
    // Hand-picked selection wins outright (people are picked BEFORE folding —
    // collapse then folds whoever was picked).
    if (displaySelectMode === "custom" && customSelection.size > 0) {
      result = result.filter((a) => customSelection.has(a.id));
    }
    // Collapse BEFORE the cap: replace assigned members with ONE pseudo-entity
    // per target group/subsystem. Times fold into the group id via
    // layoutAbsorptionMap, so sizing / co-front links / selection / the cap's
    // ranking all work on the folded id. (Capping first would arbitrarily drop
    // mid-ranked members before they could fold into their group.)
    if (collapseInfo) {
      const kept = [];
      const memberCounts = {};
      const usedGroups = new Map();
      for (const a of result) {
        const gid = collapseInfo.assignment[a.id];
        if (!gid) { kept.push(a); continue; }
        memberCounts[gid] = (memberCounts[gid] || 0) + 1;
        usedGroups.set(gid, collapseInfo.targetGroups[gid]);
      }
      const pseudo = [...usedGroups.values()].map((g) => ({
        id: g.id,
        name: g.name || "Group",
        alias: "",
        color: g.color || "#6366f1",
        avatar_url: "",
        __collapsedGroup: true,
        __memberCount: memberCounts[g.id] || 0,
      }));
      result = [...kept, ...pseudo];
    }
    // Display cap: top N by the chosen metric (rankTimes is folded through the
    // collapse assignment, so group nodes rank by their members' combined
    // time). Never fabricates — an entity with no tracked time ranks at 0.
    if (displaySelectMode !== "custom" && result.length > displayLimit) {
      const metric = displaySelectMode === "top_cofront"
        ? (a) => rankTimes[a.id]?.cofronting || 0
        : (a) => rankTimes[a.id]?.total || 0;
      result = [...result].sort((x, y) => metric(y) - metric(x)).slice(0, displayLimit);
    }
    return { filteredAlters: result, eligibleCount: eligible };
  }, [alters, groups, selectedGroup, searchQuery, showArchived, displaySelectMode, customSelection, displayLimit, rankTimes, collapseInfo]);

  // Memoized worker input. A new reference is what triggers a fresh
  // worker compute (the hook tears down the previous worker first), so
  // keeping this useMemo tight on the real deps prevents thrash.
  // Returns null when the inputs aren't ready yet — the hook treats
  // null as "idle, don't compute" so the SVG just renders empty.
  const layoutInput = useMemo(() => {
    if (!frontingSessions || frontingSessions.length === 0) return null;
    if (!filteredAlters || filteredAlters.length === 0) return null;
    return {
      frontingSessions,
      absorptionMap: layoutAbsorptionMap,
      filteredAlters,
      selectedAlterId: selectedAlter?.id || null,
      timeMode,
    };
  }, [frontingSessions, layoutAbsorptionMap, filteredAlters, selectedAlter, timeMode]);

  const layout = useSystemMapLayout(layoutInput);
  const isComputingLayout = layout.state === "computing";
  const layoutErrored = layout.state === "error";
  const layoutData = layout.result || EMPTY_LAYOUT;
  const { frontingTime, frontingTimeAll, cofrontingTime, cofrontingTimeAll, nodePositions } = layoutData;

  const groupData = useMemo(() => {
    if (!showGroups) return [];
    const centerX = 600;
    const centerY = 400;
    const maxAlterTime = Math.max(...filteredAlters.map(a => frontingTime[a.id] || 0), 1);
    return groups
      .filter((g) => filteredAlters.some((a) => a.groups?.some((ag) => ag.id === g.id)))
      .map((group) => {
        const members = filteredAlters.filter(a => a.groups?.some(ag => ag.id === group.id));
        if (!members.length) return null;
        const sumX = members.reduce((s, a) => s + (nodePositions[a.id]?.x ?? centerX), 0);
        const sumY = members.reduce((s, a) => s + (nodePositions[a.id]?.y ?? centerY), 0);
        const avgFrontTime = members.reduce((s, a) => s + (frontingTime[a.id] || 0), 0) / members.length;
        const sizeRatio = avgFrontTime / maxAlterTime;
        return { group, x: sumX / members.length, y: sumY / members.length, radius: 28 + sizeRatio * 22 };
      })
      .filter(Boolean);
  }, [showGroups, groups, filteredAlters, nodePositions, frontingTime]);

  useEffect(() => {
    if (selectedAlter && cofrontingTime[selectedAlter.id]) {
      const sorted = Object.entries(cofrontingTime[selectedAlter.id])
        .sort((a, b) => b[1] - a[1])
        .slice(0, cofronterCount);
      // Resolve against the display list too so collapsed group nodes show
      // up as co-front peers (their times are folded onto the group id).
      const pool = [...alters, ...filteredAlters.filter((a) => a.__collapsedGroup)];
      setCofronters(pool.filter((a) => sorted.some(([id]) => id === a.id)));
    } else {
      setCofronters([]);
    }
  }, [selectedAlter, cofrontingTime, cofronterCount, alters, filteredAlters]);

  const fitToNodes = useCallback((nodeList) => {
    if (!nodeList.length || !svgRef.current) return;
    const padding = 40;
    const svgWidth = svgRef.current.clientWidth || 600;
    const svgHeight = svgRef.current.clientHeight || 400;
    const xs = nodeList.map(n => n.x);
    const ys = nodeList.map(n => n.y);
    const minX = Math.min(...xs) - 40;
    const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (contentWidth <= 0 || contentHeight <= 0) return;
    const scaleX = (svgWidth - padding * 2) / contentWidth;
    const scaleY = (svgHeight - padding * 2) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    const x = (svgWidth - contentWidth * scale) / 2 - minX * scale;
    const y = (svgHeight - contentHeight * scale) / 2 - minY * scale;
    setTransform({ x, y, scale });
  }, []);

  // Build nodes and links
  useEffect(() => {
    if (!filteredAlters.length) return;
    const centerX = 600;
    const centerY = 400;

    const alterNodes = filteredAlters.map((alter) => {
      const pos = nodePositions[alter.id] || { x: centerX, y: centerY, nodeR: 35 };
      return {
        id: alter.id,
        label: alter.alias || alter.name,
        displayName: alter.name,
        avatar: alter.avatar_url,
        type: "alter",
        color: alter.color || "#8b5cf6",
        x: pos.x,
        y: pos.y,
        radius: pos.nodeR ?? 35,
        isSelected: selectedAlter?.id === alter.id,
        isCofronter: selectedAlter ? (cofrontingTime[selectedAlter.id]?.[alter.id] || 0) > 0 : false,
        collapsedCount: alter.__collapsedGroup ? alter.__memberCount : 0,
      };
    });

    const groupNodes = groupData.map(({ group, x, y, radius }) => ({
      id: group.id,
      label: group.name,
      type: "group",
      color: group.color || "#6366f1",
      x, y, radius,
    }));

    const allNodes = [...alterNodes, ...groupNodes];
    setNodes(allNodes);

    if (!hasAutoFit.current && alterNodes.length > 0) {
      hasAutoFit.current = true;
      requestAnimationFrame(() => fitToNodes(alterNodes));
    }

    const newLinks = [];
    if (showGroups) {
      filteredAlters.forEach((alter) => {
        if (alter.groups && Array.isArray(alter.groups)) {
          alter.groups.forEach((group) => {
            if (groupData.some(gd => gd.group.id === group.id)) {
              newLinks.push({ source: alter.id, target: group.id, type: "membership" });
            }
          });
        }
      });
    }
    filteredAlters.forEach((alter) => {
      Object.entries(cofrontingTime[alter.id] || {}).forEach(([otherId, duration]) => {
        if (alter.id < otherId && filteredAlters.some((a) => a.id === otherId)) {
          newLinks.push({ source: alter.id, target: otherId, type: "cofronting", strength: duration });
        }
      });
    });
    setLinks(newLinks);
  }, [filteredAlters, groupData, showGroups, selectedAlter, cofrontingTime, nodePositions, fitToNodes]);

  // Stable event handlers using refs so they don't cause re-registration on every render
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    dragDistanceRef.current = 0;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - (dragStartRef.current.x + transformRef.current.x);
    const dy = e.clientY - (dragStartRef.current.y + transformRef.current.y);
    dragDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
    applyTransform({ ...transformRef.current, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  }, [applyTransform]);

  const handleMouseUp = useCallback(() => {
    // Always commit: pinch-zoom ends here too (without the dragging flag),
    // and an uncommitted ref transform would snap back on the next render.
    commitTransform();
    isDraggingRef.current = false;
  }, [commitTransform]);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.touches[0].clientX - transformRef.current.x, y: e.touches[0].clientY - transformRef.current.y };
    dragDistanceRef.current = 0;
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinchRef.current !== null) {
        const delta = dist / lastPinchRef.current;
        const t = transformRef.current;
        applyTransform({ ...t, scale: Math.max(0.5, Math.min(3, t.scale * delta)) });
      }
      lastPinchRef.current = dist;
      return;
    }
    lastPinchRef.current = null;
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - (dragStartRef.current.x + transformRef.current.x);
    const dy = e.touches[0].clientY - (dragStartRef.current.y + transformRef.current.y);
    dragDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
    applyTransform({ ...transformRef.current, x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y });
  }, [applyTransform]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const t = transformRef.current;
    applyTransform({ ...t, scale: Math.max(0.5, Math.min(3, t.scale * delta)) });
    commitTransform();
  }, [applyTransform, commitTransform]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("touchstart", handleTouchStart, { passive: false });
    svg.addEventListener("touchmove", handleTouchMove, { passive: false });
    svg.addEventListener("touchend", handleMouseUp);
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      svg.removeEventListener("mousemove", handleMouseMove);
      svg.removeEventListener("mouseup", handleMouseUp);
      svg.removeEventListener("touchstart", handleTouchStart);
      svg.removeEventListener("touchmove", handleTouchMove);
      svg.removeEventListener("touchend", handleMouseUp);
      svg.removeEventListener("wheel", handleWheel);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleWheel]);

  const handleNodeClick = useCallback((alterId) => {
    if (dragDistanceRef.current > 5) return;
    // Collapsed group pseudo-nodes aren't in `alters` — resolve from the
    // display list too, so tapping one still centres it (times are folded
    // onto the group id, so the co-front view works the same).
    const clicked = alters.find((a) => a.id === alterId) || filteredAlters.find((a) => a.id === alterId);
    setSelectedAlter(prev => prev?.id === alterId ? null : clicked);
  }, [alters, filteredAlters]);

  const handleReset = () => {
    const alterNodes = nodes.filter(n => n.type === "alter");
    if (alterNodes.length) fitToNodes(alterNodes);
  };
  const handleZoom = (dir) => setTransform(t => ({
    ...t, scale: Math.max(0.5, Math.min(3, t.scale * (dir === "in" ? 1.2 : 0.85)))
  }));
  const cycleRelMode = () => {
    setRelDisplayMode(m => {
      const idx = REL_MODES.indexOf(m);
      return REL_MODES[(idx + 1) % REL_MODES.length];
    });
  };
  const cycleTimeMode = () => {
    setTimeMode(m => {
      const idx = TIME_MODES.findIndex(t => t.id === m);
      return TIME_MODES[(idx + 1) % TIME_MODES.length].id;
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return "0h";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const alterNodeCount = useMemo(() => nodes.filter(n => n.type === "alter").length, [nodes]);
  const groupNodeCount = useMemo(() => nodes.filter(n => n.type === "group").length, [nodes]);
  const maxCofrontStrength = useMemo(
    () => Math.max(...links.filter(l => l.type === "cofronting").map(l => l.strength || 1), 1),
    [links]
  );
  // O(1) node lookup — links/relationships used to nodes.find() per line,
  // which was O(links × nodes) on EVERY render and a major freeze factor
  // for big systems.
  const nodesById = useMemo(() => {
    const m = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);
  // Level of detail: past this many nodes, skip avatars, per-node shadows
  // and sublabels — coloured circles + names render an order of magnitude
  // faster and stay legible at large-system zoom levels anyway.
  const perfMode = nodes.length > 250;
  const currentTimeMode = TIME_MODES.find(t => t.id === timeMode);

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-card to-muted/20 rounded-lg border border-border overflow-hidden flex flex-col">

      {/* Time mode toggle — above the map, outside SVG */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-border/40">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {selectedAlter && (
            <span className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: selectedAlter.color || "#8b5cf6" }} />
              {selectedAlter.name} selected
              <button onClick={() => setSelectedAlter(null)} className="ml-0.5 hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {!selectedAlter && <span>Click an alter to center it</span>}
        </div>
        <button
          onClick={cycleTimeMode}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          title="Cycle time mode"
        >
          {currentTimeMode?.label}
        </button>
      </div>

      {/* SVG map — fills all available space */}
      <div className="flex-1 relative min-h-0">
        {/* Overlay shown while the worker is building the layout — kept
            positioned over the SVG so the existing chrome (zoom, search,
            etc.) stays visible and tappable. Pointer-events: none on the
            outer wrapper so the SVG itself can still be panned/clicked. */}
        {isComputingLayout && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/95 border border-border shadow-sm pointer-events-auto">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs font-medium text-foreground">Building layout…</span>
            </div>
          </div>
        )}
        {layoutErrored && (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
            <div className="max-w-sm w-full rounded-xl bg-card border border-border p-4 text-center space-y-3 pointer-events-auto">
              <p className="text-sm font-semibold text-foreground">Couldn't build the map</p>
              <p className="text-xs text-muted-foreground">
                {layout.error || "Something went wrong while computing the layout."}
              </p>
              <button
                type="button"
                onClick={() => layout.restart()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
              >
                Try again
              </button>
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <defs>
            {/* ONE shared node shadow — a per-node <filter> def made large
                systems rasterise hundreds of identical filters. */}
            <filter id="sysmap-node-shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>
          <g ref={contentGRef} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>

            {/* Co-fronting + membership links */}
            {links.map((link, idx) => {
              const sourceNode = nodesById[link.source];
              const targetNode = nodesById[link.target];
              if (!sourceNode || !targetNode) return null;
              const isCofronting = link.type === "cofronting";
              const opacity = isCofronting ? 0.15 + (link.strength / maxCofrontStrength) * 0.55 : 0.3;
              return (
                <line
                  key={`link-${idx}`}
                  x1={sourceNode.x} y1={sourceNode.y}
                  x2={targetNode.x} y2={targetNode.y}
                  stroke={isCofronting ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))"}
                  strokeWidth={isCofronting ? Math.max(0.5, Math.min(3, (link.strength / maxCofrontStrength) * 3)) : 1.5}
                  opacity={opacity}
                  strokeDasharray={link.type === "membership" ? "5,5" : "0"}
                />
              );
            })}

            {/* Relationship lines */}
            {relDisplayMode !== 'none' && relationships.length > 0 && (() => {
              const visibleRels = relDisplayMode === 'selected'
                ? relationships.filter(r => r.alter_id_a === selectedAlter?.id || r.alter_id_b === selectedAlter?.id)
                : relationships;
              if (visibleRels.length === 0) return null;
              const NODE_R = 35;

              // Build pair groups for offset calculation
              const pairGroups = {};
              visibleRels.forEach(rel => {
                const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
                if (!pairGroups[key]) pairGroups[key] = [];
                pairGroups[key].push(rel);
              });

              const lines = [];
              visibleRels.forEach(rel => {
                const nodeA = nodesById[rel.alter_id_a];
                const nodeB = nodesById[rel.alter_id_b];
                if (!nodeA || !nodeB) return;
                const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
                const pairRels = pairGroups[pairKey] || [rel];
                const relIndex = pairRels.findIndex(r => r.id === rel.id);
                const baseOffset = (relIndex - (pairRels.length - 1) / 2) * 10;
                const dx = nodeB.x - nodeA.x, dy = nodeB.y - nodeA.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const perpX = -dy / len, perpY = dx / len;
                const color = rel.color || "#6b7280";
                const label = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
                const markerId = `rel-arrow-${rel.id}`;

                const relStrokeW = Math.max(0.75, (rel.strength || 3) * 0.6);
                if (relDisplayMode === 'simple') {
                  const ox = perpX * baseOffset, oy = perpY * baseOffset;
                  const x1 = nodeA.x + ox, y1 = nodeA.y + oy;
                  const x2 = nodeB.x + ox, y2 = nodeB.y + oy;
                  lines.push(
                    <g key={`rel-${rel.id}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={color} strokeWidth={relStrokeW} strokeDasharray="6,3" opacity={0.7} />
                      <text x={(x1+x2)/2} y={(y1+y2)/2 - 6} textAnchor="middle" fontSize={9}
                        fill={color} opacity={0.9} pointerEvents="none">
                        {label}
                      </text>
                    </g>
                  );
                } else {
                  // detailed / selected: arrows
                  if (rel.direction === "bidirectional") {
                    const biOff = 5;
                    const markerIdB = `rel-arrow-${rel.id}-b`;
                    const ox1 = perpX * (baseOffset + biOff), oy1 = perpY * (baseOffset + biOff);
                    const ox2 = perpX * (baseOffset - biOff), oy2 = perpY * (baseOffset - biOff);
                    lines.push(
                      <React.Fragment key={`rel-${rel.id}`}>
                        <defs>
                          <marker id={markerId} markerWidth="8" markerHeight="6" refX={NODE_R + 6} refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} />
                          </marker>
                          <marker id={markerIdB} markerWidth="8" markerHeight="6" refX={NODE_R + 6} refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} />
                          </marker>
                        </defs>
                        <line x1={nodeA.x+ox1} y1={nodeA.y+oy1} x2={nodeB.x+ox1} y2={nodeB.y+oy1}
                          stroke={color} strokeWidth={relStrokeW} opacity={0.75} markerEnd={`url(#${markerId})`} />
                        <line x1={nodeB.x+ox2} y1={nodeB.y+oy2} x2={nodeA.x+ox2} y2={nodeA.y+oy2}
                          stroke={color} strokeWidth={relStrokeW} opacity={0.75} markerEnd={`url(#${markerIdB})`} />
                      </React.Fragment>
                    );
                  } else {
                    const [lx1, ly1, lx2, ly2] = rel.direction === "b_to_a"
                      ? [nodeB.x, nodeB.y, nodeA.x, nodeA.y]
                      : [nodeA.x, nodeA.y, nodeB.x, nodeB.y];
                    const ox = perpX * baseOffset, oy = perpY * baseOffset;
                    lines.push(
                      <React.Fragment key={`rel-${rel.id}`}>
                        <defs>
                          <marker id={markerId} markerWidth="8" markerHeight="6" refX={NODE_R + 6} refY="3" orient="auto">
                            <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} />
                          </marker>
                        </defs>
                        <line x1={lx1+ox} y1={ly1+oy} x2={lx2+ox} y2={ly2+oy}
                          stroke={color} strokeWidth={relStrokeW} opacity={0.75} markerEnd={`url(#${markerId})`} />
                      </React.Fragment>
                    );
                  }
                }
              });
              return <g>{lines}</g>;
            })()}

            {/* Nodes. perfMode (large systems) trades decoration for speed:
                no avatars, no shadow filter, no sublabels — coloured circles
                + names only. */}
            {nodes.map((node) => {
              const r = node.radius || (node.type === "group" ? 40 : 35);
              const showAvatar = !perfMode && node.avatar && node.type === "alter";
              return (
                <g key={node.id}>
                  {showAvatar && (
                    <defs>
                      <clipPath id={`clip-circle-${node.id}`}>
                        <circle cx={node.x} cy={node.y} r={r - 5} />
                      </clipPath>
                    </defs>
                  )}
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={node.color} opacity={0.85}
                    filter={perfMode ? undefined : "url(#sysmap-node-shadow)"}
                    stroke={node.isSelected ? "white" : node.isCofronter ? "hsl(var(--accent))" : "transparent"}
                    strokeWidth={node.isSelected ? 3 : node.isCofronter ? 2 : 0}
                    style={{ cursor: node.type === "alter" ? "pointer" : "default" }}
                    onMouseDown={(e) => { e.stopPropagation(); dragDistanceRef.current = 0; isDraggingRef.current = false; }}
                    onClick={() => node.type === "alter" && handleNodeClick(node.id)}
                    onTouchEnd={(e) => {
                      if (node.type !== "alter") return;
                      e.stopPropagation();
                      e.preventDefault();
                      if (dragDistanceRef.current <= 8) handleNodeClick(node.id);
                    }}
                  />
                  {showAvatar && (
                    <NodeAvatarImage
                      node={node}
                      r={r}
                      onMouseDown={(e) => { e.stopPropagation(); dragDistanceRef.current = 0; isDraggingRef.current = false; }}
                      onClick={() => handleNodeClick(node.id)}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (dragDistanceRef.current <= 8) handleNodeClick(node.id);
                      }}
                    />
                  )}
                  <text x={node.x} y={node.y - 10}
                    textAnchor="middle" fontSize="13" fontWeight="600"
                    fill="white" pointerEvents="none">
                    {node.label.length > 12 ? node.label.slice(0, 10) + "…" : node.label}
                  </text>
                  {!perfMode && !node.avatar && node.type === "alter" && node.displayName !== node.label && (
                    <text x={node.x} y={node.y + 8}
                      textAnchor="middle" fontSize="11"
                      fill="white" opacity="0.8" pointerEvents="none">
                      {node.displayName.length > 12 ? node.displayName.slice(0, 10) + "…" : node.displayName}
                    </text>
                  )}
                  {!perfMode && (
                    <text x={node.x} y={node.y + (node.type === "group" ? r - 8 : 25)}
                      textAnchor="middle" fontSize="10"
                      fill="white" opacity="0.6" pointerEvents="none">
                      {node.collapsedCount ? `${node.collapsedCount} inside` : node.type === "group" ? "Group" : "Alter"}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom + Rels controls — right side */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-center">
          <button
            onClick={cycleRelMode}
            title={`Relationships: ${REL_TITLES[relDisplayMode]}`}
            className={`relative w-8 h-8 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center ${
              relDisplayMode !== 'none'
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            R
            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-background ${
              relDisplayMode === 'simple' ? 'bg-green-500' :
              relDisplayMode === 'detailed' ? 'bg-blue-500' :
              relDisplayMode === 'selected' ? 'bg-amber-500' : 'bg-muted-foreground'
            }`} />
          </button>
          <button onClick={() => handleZoom("in")} title="Zoom in"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleZoom("out")} title="Zoom out"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleReset} title="Reset view"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Legend — bottom-left, collapsible */}
        <div className="absolute bottom-3 left-3">
          <button
            onClick={() => setLegendOpen(v => !v)}
            className="px-2.5 py-1 rounded-full bg-card/95 backdrop-blur border border-border text-xs font-medium text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1.5"
          >
            Legend
            {legendOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
          {legendOpen && (
            <div className="mt-1 bg-card/95 backdrop-blur border border-border rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-purple-500"/><span className="text-muted-foreground">Alters</span></div>
              {showGroups && <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-indigo-500"/><span className="text-muted-foreground">Groups</span></div>}
              {showGroups && <div className="flex items-center gap-2"><div className="h-px w-3.5 border-t-2 border-dashed border-muted-foreground/50"/><span className="text-muted-foreground">Membership</span></div>}
              <div className="flex items-center gap-2"><div className="h-px w-3.5 border-t-2" style={{borderColor:"hsl(var(--accent))"}}/><span className="text-muted-foreground">Co-fronting</span></div>
              {relDisplayMode !== 'none' && <div className="flex items-center gap-2"><div className="h-px w-3.5 border-t-2 border-dashed border-muted-foreground"/><span className="text-muted-foreground">Relationship</span></div>}
              <div className="pt-1 border-t border-border text-muted-foreground">
                {alterNodeCount} alters{showGroups ? ` · ${groupNodeCount} groups` : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom filter bar + expandable panel */}
      <div className="flex-shrink-0 border-t border-border bg-card/95 backdrop-blur">
        {panelOpen && (
          <div className="p-3 space-y-3 border-b border-border max-h-[50vh] overflow-y-auto overflow-x-hidden w-full">

            {/* Who's displayed: top-N by metric, or a hand-picked set. Large
                systems never draw everyone at once — that's what kept the map
                unusable for big systems. */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Displayed {t.alters}</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DISPLAY_MODES.map((m) => (
                  <Badge key={m.id}
                    variant={displaySelectMode === m.id ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setDisplaySelectMode(m.id)}>
                    {m.id === 'top_front' ? `Top ${t.fronting} time` : m.id === 'top_cofront' ? `Top ${t.cofronting || "co-fronting"} time` : m.label}
                  </Badge>
                ))}
              </div>
              {/* Collapse-into-groups: fold members into one node per
                  group/subsystem, with a nesting depth (groups nest). */}
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                <span className="text-xs text-muted-foreground">Collapse into:</span>
                {COLLAPSE_MODES.map((m) => (
                  <Badge key={m.id}
                    variant={collapseMode === m.id ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setCollapseMode(m.id)}>
                    {m.id === 'subsystems' ? (t.system === "system" ? "Subsystems" : `Sub${t.systems}`) : m.label}
                  </Badge>
                ))}
              </div>
              {collapseMode !== 'off' && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className="text-xs text-muted-foreground">Collapse level:</span>
                  {COLLAPSE_DEPTHS.map((d) => (
                    <Badge key={d.id}
                      variant={collapseDepth === d.id ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setCollapseDepth(d.id)}>
                      {d.label}
                    </Badge>
                  ))}
                </div>
              )}
              {displaySelectMode !== "custom" ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-muted-foreground">Show up to</label>
                  <input type="number" inputMode="numeric" min="5" max={DISPLAY_LIMIT_MAX} value={displayLimitText}
                    onChange={(e) => setDisplayLimitText(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(displayLimitText, 10);
                      const n = Number.isFinite(parsed) ? Math.max(5, Math.min(DISPLAY_LIMIT_MAX, parsed)) : AUTO_DISPLAY_LIMIT;
                      setDisplayLimit(n);
                      setDisplayLimitText(String(n));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-16 h-7 px-2 border border-border rounded text-xs bg-background" />
                  <span className="text-xs text-muted-foreground">
                    showing {filteredAlters.length} of {eligibleCount}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => setShowMemberPicker(true)}
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-medium hover:bg-muted/50 transition-colors">
                    Choose {t.alters}…{customSelection.size ? ` (${customSelection.size})` : ""}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {customSelection.size === 0
                      ? `None picked yet — showing all ${eligibleCount}.`
                      : `showing ${filteredAlters.length} of ${eligibleCount}`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Archived</label>
              <button type="button" role="switch" aria-checked={showArchived} aria-label="Show archived alters" onClick={() => setShowArchived(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showArchived ? "bg-primary" : "bg-muted"} relative flex-shrink-0`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showArchived ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Groups</label>
              <button type="button" role="switch" aria-checked={showGroups} aria-label="Show groups" onClick={() => setShowGroups(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showGroups ? "bg-primary" : "bg-muted"} relative flex-shrink-0`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showGroups ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Search</label>
              <Input placeholder="Search by name or alias..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="text-sm w-full min-w-0" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Filter by Group</label>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={selectedGroup ? "outline" : "secondary"} className="cursor-pointer text-xs"
                  onClick={() => setSelectedGroup(null)}>All</Badge>
                {groups.filter((g) => !g.owner_alter_id).map((group) => (
                  <Badge key={group.id}
                    variant={selectedGroup === group.id ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}>
                    {group.name}
                  </Badge>
                ))}
              </div>
            </div>
            {groups.some((g) => g.owner_alter_id) && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                  Filter by {t.system === "system" ? "Subsystem" : `Sub${t.system}`}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {groups.filter((g) => g.owner_alter_id).map((group) => (
                    <Badge key={group.id}
                      variant={selectedGroup === group.id ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}>
                      {group.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedAlter && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Co-fronters: {selectedAlter.name}
                  </label>
                  <button onClick={() => setSelectedAlter(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-muted-foreground">Show top</label>
                  <input type="number" inputMode="numeric" min="1" max="30" value={cofronterCountText}
                    onChange={(e) => setCofronterCountText(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(cofronterCountText, 10);
                      const n = Number.isFinite(parsed) ? Math.max(1, Math.min(30, parsed)) : 10;
                      setCofronterCount(n);
                      setCofronterCountText(String(n));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-14 h-7 px-2 border border-border rounded text-xs bg-background" />
                </div>
                {cofronters.length > 0 && (
                  <div className="bg-muted/30 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                    {cofronters.map((alter) => (
                      <div key={alter.id} className="text-xs text-foreground flex items-center justify-between">
                        <span>{alter.name}</span>
                        <span className="text-muted-foreground">{formatDuration(cofrontingTime[selectedAlter.id]?.[alter.id])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            Filters & Display
            {(searchQuery || selectedGroup || showArchived || showGroups || displaySelectMode === "custom") && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
            {filteredAlters.length < eligibleCount && (
              <span className="text-xs font-normal text-muted-foreground">· {filteredAlters.length} of {eligibleCount} shown</span>
            )}
          </div>
          {panelOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>

      {/* Hand-picked member selection — the standard alter selection TREE
          (Members organised by subsystem + a Groups tab; same surface the
          export / sharing flows use). */}
      <Dialog open={showMemberPicker} onOpenChange={(o) => { if (!o) setShowMemberPicker(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Shown on map</DialogTitle>
          </DialogHeader>
          <AlterTreeSelect
            isSelected={(id) => customSelection.has(id)}
            onToggle={(a, on) => setCustomSelection((s) => { const n = new Set(s); if (on) n.add(a.id); else n.delete(a.id); return n; })}
            onSetMany={(arr, on) => setCustomSelection((s) => { const n = new Set(s); for (const a of arr) { if (on) n.add(a.id); else n.delete(a.id); } return n; })}
            maxHeight="48vh"
          />
          <button type="button" onClick={() => setShowMemberPicker(false)}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm">
            Done{customSelection.size ? ` (${customSelection.size})` : ""}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SystemMap;