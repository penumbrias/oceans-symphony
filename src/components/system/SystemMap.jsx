import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronUp, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

const REL_MODES = ['none', 'simple', 'detailed', 'selected'];
const REL_TITLES = { simple: 'Simple', detailed: 'Detailed', selected: 'Selected only', none: 'Hidden' };

const TIME_MODES = [
  { id: 'total', label: 'All Time' },
  { id: 'primary', label: '⭐ Primary' },
  { id: 'cofronting', label: '👥 Co-front' },
];

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
  const [cofronterCount, setCofronterCount] = useState(10);
  const [cofronters, setCofronters] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [relDisplayMode, setRelDisplayMode] = useState('simple');
  const [timeMode, setTimeMode] = useState('total');

  // Keep transform in a ref so event handlers always see current value without re-registering
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

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

  // Fronting duration per alter broken down by total / primary / cofronting (ms)
  const frontingTimeAll = useMemo(() => {
    const time = {};
    frontingSessions.forEach((session) => {
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      const startTime = new Date(session.start_time);
      const duration = endTime - startTime;
      if (session.alter_id) {
        if (!time[session.alter_id]) time[session.alter_id] = { total: 0, primary: 0, cofronting: 0 };
        time[session.alter_id].total += duration;
        if (session.is_primary) time[session.alter_id].primary += duration;
        else time[session.alter_id].cofronting += duration;
      } else {
        const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
        ids.forEach((id) => {
          if (!time[id]) time[id] = { total: 0, primary: 0, cofronting: 0 };
          time[id].total += duration;
          if (session.primary_alter_id === id) time[id].primary += duration;
          else time[id].cofronting += duration;
        });
      }
    });
    return time;
  }, [frontingSessions]);

  const frontingTime = useMemo(() => {
    const result = {};
    Object.entries(frontingTimeAll).forEach(([id, times]) => {
      result[id] = times[timeMode] ?? times.total;
    });
    return result;
  }, [frontingTimeAll, timeMode]);

  // cofrontingTime[idA][idB] = { total, primary, cofronting } ms of overlap
  const cofrontingTimeAll = useMemo(() => {
    const map = {};
    const addOverlap = (idA, idB, overlap, aPrimary, bPrimary) => {
      if (!idA || !idB || idA === idB) return;
      if (!map[idA]) map[idA] = {};
      if (!map[idB]) map[idB] = {};
      if (!map[idA][idB]) map[idA][idB] = { total: 0, primary: 0, cofronting: 0 };
      if (!map[idB][idA]) map[idB][idA] = { total: 0, primary: 0, cofronting: 0 };
      map[idA][idB].total += overlap;
      map[idB][idA].total += overlap;
      // "primary" = time idA was primary while co-fronting with idB
      if (aPrimary) map[idA][idB].primary += overlap;
      if (bPrimary) map[idB][idA].primary += overlap;
      // "cofronting" = time idA was co-fronter (not primary) while with idB
      if (!aPrimary) map[idA][idB].cofronting += overlap;
      if (!bPrimary) map[idB][idA].cofronting += overlap;
    };
    const individualSessions = frontingSessions.filter(s => s.alter_id);
    for (let i = 0; i < individualSessions.length; i++) {
      for (let j = i + 1; j < individualSessions.length; j++) {
        const a = individualSessions[i];
        const b = individualSessions[j];
        if (a.alter_id === b.alter_id) continue;
        const aStart = new Date(a.start_time).getTime();
        const aEnd = a.end_time ? new Date(a.end_time).getTime() : Date.now();
        const bStart = new Date(b.start_time).getTime();
        const bEnd = b.end_time ? new Date(b.end_time).getTime() : Date.now();
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        if (overlapEnd > overlapStart) addOverlap(a.alter_id, b.alter_id, overlapEnd - overlapStart, a.is_primary, b.is_primary);
      }
    }
    const legacySessions = frontingSessions.filter(s => !s.alter_id && s.primary_alter_id);
    legacySessions.forEach(s => {
      const start = new Date(s.start_time).getTime();
      const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
      const duration = end - start;
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const aPrimary = ids[i] === s.primary_alter_id;
          const bPrimary = ids[j] === s.primary_alter_id;
          addOverlap(ids[i], ids[j], duration, aPrimary, bPrimary);
        }
      }
    });
    return map;
  }, [frontingSessions]);

  // Flatten cofrontingTime to the selected timeMode key
  const cofrontingTime = useMemo(() => {
    const result = {};
    Object.entries(cofrontingTimeAll).forEach(([idA, peers]) => {
      result[idA] = {};
      Object.entries(peers).forEach(([idB, times]) => {
        result[idA][idB] = times[timeMode] ?? times.total;
      });
    });
    return result;
  }, [cofrontingTimeAll, timeMode]);

  const filteredAlters = useMemo(() => {
    let result = alters.filter(a => showArchived ? true : !a.is_archived);
    if (selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (group?.member_sp_ids) {
        result = result.filter((a) => group.member_sp_ids.includes(a.sp_id));
      }
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) => a.name.toLowerCase().includes(query) || (a.alias && a.alias.toLowerCase().includes(query))
      );
    }
    return result;
  }, [alters, groups, selectedGroup, searchQuery, showArchived]);

  const nodePositions = useMemo(() => {
    const positions = {};
    const centerX = 600;
    const centerY = 400;
    const minRadius = 60;
    const maxRadius = 320;
    const maxNodeR = 35;

    const place = (items, getTime, maxTime) => {
      const n = items.length;
      if (n === 0) return;

      // Compute each item's target radius using square-root scale for better sensitivity
      const itemsWithR = items.map(item => {
        const ratio = Math.sqrt((getTime(item) || 0) / maxTime);
        const r = minRadius + (1 - ratio) * (maxRadius - minRadius);
        return { item, r };
      });

      // Determine node size: constrained by the tightest ring
      const minR = Math.min(...itemsWithR.map(x => x.r));
      const maxFitNodeR = (minR * Math.PI) / n;
      const nodeR = Math.min(maxNodeR, Math.max(maxFitNodeR, 32));

      // Group items by ring (bucket radii within nodeR of each other)
      // Sort by radius so we can bucket them
      const sorted = [...itemsWithR].sort((a, b) => a.r - b.r);
      const rings = []; // each ring: { r, items[] }
      for (const entry of sorted) {
        const last = rings[rings.length - 1];
        if (last && Math.abs(entry.r - last.r) <= nodeR * 1.5) {
          last.items.push(entry);
          // Average the ring radius
          last.r = last.items.reduce((s, x) => s + x.r, 0) / last.items.length;
        } else {
          rings.push({ r: entry.r, items: [entry] });
        }
      }

      // For each ring, distribute items evenly around the circumference
      for (const ring of rings) {
        const count = ring.items.length;
        ring.items.forEach(({ item }, idx) => {
          const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
          positions[item.id] = {
            x: centerX + Math.cos(angle) * ring.r,
            y: centerY + Math.sin(angle) * ring.r,
            nodeR,
          };
        });
      }
    };

    if (!selectedAlter) {
      const sorted = [...filteredAlters].sort(
        (a, b) => (frontingTime[b.id] || 0) - (frontingTime[a.id] || 0)
      );
      const maxTime = sorted.length > 0 ? (frontingTime[sorted[0].id] || 1) : 1;
      place(sorted, a => frontingTime[a.id], maxTime);
    } else {
      positions[selectedAlter.id] = { x: centerX, y: centerY, nodeR: 35 };
      const others = filteredAlters.filter(a => a.id !== selectedAlter.id);
      const withRatios = others
        .map(a => ({ ...a, cotime: cofrontingTime[selectedAlter.id]?.[a.id] || 0 }))
        .sort((a, b) => b.cotime - a.cotime);
      const maxCotime = withRatios.length > 0 ? (withRatios[0].cotime || 1) : 1;
      place(withRatios, a => a.cotime, maxCotime);
    }

    return positions;
  }, [filteredAlters, selectedAlter, frontingTime, cofrontingTime]);

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
      setCofronters(alters.filter((a) => sorted.some(([id]) => id === a.id)));
    } else {
      setCofronters([]);
    }
  }, [selectedAlter, cofrontingTime, cofronterCount, alters]);

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
    setTransform(t => ({ ...t, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }));
  }, []);

  const handleMouseUp = useCallback(() => { isDraggingRef.current = false; }, []);

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
        setTransform(t => ({ ...t, scale: Math.max(0.5, Math.min(3, t.scale * delta)) }));
      }
      lastPinchRef.current = dist;
      return;
    }
    lastPinchRef.current = null;
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - (dragStartRef.current.x + transformRef.current.x);
    const dy = e.touches[0].clientY - (dragStartRef.current.y + transformRef.current.y);
    dragDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
    setTransform(t => ({ ...t, x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y }));
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({ ...t, scale: Math.max(0.5, Math.min(3, t.scale * delta)) }));
  }, []);

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
    const clicked = alters.find((a) => a.id === alterId);
    setSelectedAlter(prev => prev?.id === alterId ? null : clicked);
  }, [alters]);

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

  const alterNodeCount = nodes.filter(n => n.type === "alter").length;
  const groupNodeCount = nodes.filter(n => n.type === "group").length;
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
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>

            {/* Co-fronting + membership links */}
            {links.map((link, idx) => {
              const sourceNode = nodes.find((n) => n.id === link.source);
              const targetNode = nodes.find((n) => n.id === link.target);
              if (!sourceNode || !targetNode) return null;
              const isCofronting = link.type === "cofronting";
              const maxStrength = Math.max(...links.filter(l => l.type === "cofronting").map(l => l.strength || 1), 1);
              const opacity = isCofronting ? 0.15 + (link.strength / maxStrength) * 0.55 : 0.3;
              return (
                <line
                  key={`link-${idx}`}
                  x1={sourceNode.x} y1={sourceNode.y}
                  x2={targetNode.x} y2={targetNode.y}
                  stroke={isCofronting ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))"}
                  strokeWidth={isCofronting ? Math.max(0.5, Math.min(3, (link.strength / maxStrength) * 3)) : 1.5}
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
                const nodeA = nodes.find(n => n.id === rel.alter_id_a);
                const nodeB = nodes.find(n => n.id === rel.alter_id_b);
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

                if (relDisplayMode === 'simple') {
                  const ox = perpX * baseOffset, oy = perpY * baseOffset;
                  const x1 = nodeA.x + ox, y1 = nodeA.y + oy;
                  const x2 = nodeB.x + ox, y2 = nodeB.y + oy;
                  lines.push(
                    <g key={`rel-${rel.id}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={color} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7} />
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
                          stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`} />
                        <line x1={nodeB.x+ox2} y1={nodeB.y+oy2} x2={nodeA.x+ox2} y2={nodeA.y+oy2}
                          stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerIdB})`} />
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
                          stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`} />
                      </React.Fragment>
                    );
                  }
                }
              });
              return <g>{lines}</g>;
            })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const r = node.radius || (node.type === "group" ? 40 : 35);
              return (
                <g key={node.id}>
                  <defs>
                    <filter id={`shadow-${node.id}`}>
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                    </filter>
                    {node.avatar && node.type === "alter" && (
                      <clipPath id={`clip-circle-${node.id}`}>
                        <circle cx={node.x} cy={node.y} r={r - 5} />
                      </clipPath>
                    )}
                  </defs>
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={node.color} opacity={0.85}
                    filter={`url(#shadow-${node.id})`}
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
                  {node.avatar && node.type === "alter" && (
                    <image
                      x={node.x - (r - 5)} y={node.y - (r - 5)}
                      width={(r - 5) * 2} height={(r - 5) * 2}
                      href={node.avatar}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-circle-${node.id})`}
                      style={{ cursor: "pointer" }}
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
                  {!node.avatar && node.type === "alter" && node.displayName !== node.label && (
                    <text x={node.x} y={node.y + 8}
                      textAnchor="middle" fontSize="11"
                      fill="white" opacity="0.8" pointerEvents="none">
                      {node.displayName.length > 12 ? node.displayName.slice(0, 10) + "…" : node.displayName}
                    </text>
                  )}
                  <text x={node.x} y={node.y + (node.type === "group" ? r - 8 : 25)}
                    textAnchor="middle" fontSize="10"
                    fill="white" opacity="0.6" pointerEvents="none">
                    {node.type === "group" ? "Group" : "Alter"}
                  </text>
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

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Archived</label>
              <button onClick={() => setShowArchived(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showArchived ? "bg-primary" : "bg-muted"} relative flex-shrink-0`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showArchived ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Groups</label>
              <button onClick={() => setShowGroups(v => !v)}
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
                {groups.map((group) => (
                  <Badge key={group.id}
                    variant={selectedGroup === group.id ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}>
                    {group.name}
                  </Badge>
                ))}
              </div>
            </div>

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
                  <input type="number" min="1" max="30" value={cofronterCount}
                    onChange={(e) => setCofronterCount(Math.max(1, parseInt(e.target.value) || 10))}
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
            Filters & Search
            {(searchQuery || selectedGroup || showArchived || showGroups) && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          {panelOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
};

export default SystemMap;