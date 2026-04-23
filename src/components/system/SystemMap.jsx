import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronUp, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

const REL_MODES = ['simple', 'detailed', 'selected', 'none'];
const REL_LABELS = { simple: 'S', detailed: 'D', selected: '1', none: '–' };
const REL_TITLES = { simple: 'Simple', detailed: 'Detailed', selected: 'Selected', none: 'Hidden' };

const SystemMap = ({ relationships = [] }) => {
  const svgRef = useRef(null);
  const hasAutoFit = useRef(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragDistance, setDragDistance] = useState(0);
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

  // Total fronting duration per alter (ms)
  const frontingTime = useMemo(() => {
    const time = {};
    frontingSessions.forEach((session) => {
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      const startTime = new Date(session.start_time);
      const duration = endTime - startTime;
      const ids = session.alter_id
        ? [session.alter_id]
        : [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      ids.forEach((id) => {
        time[id] = (time[id] || 0) + duration;
      });
    });
    return time;
  }, [frontingSessions]);

  // Co-fronting duration between pairs (ms)
  const cofrontingTime = useMemo(() => {
    const map = {};
    const addOverlap = (idA, idB, overlap) => {
      if (!idA || !idB || idA === idB) return;
      if (!map[idA]) map[idA] = {};
      if (!map[idB]) map[idB] = {};
      map[idA][idB] = (map[idA][idB] || 0) + overlap;
      map[idB][idA] = (map[idB][idA] || 0) + overlap;
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
        if (overlapEnd > overlapStart) addOverlap(a.alter_id, b.alter_id, overlapEnd - overlapStart);
      }
    }
    const legacySessions = frontingSessions.filter(s => !s.alter_id && s.primary_alter_id);
    legacySessions.forEach(s => {
      const start = new Date(s.start_time).getTime();
      const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
      const duration = end - start;
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) addOverlap(ids[i], ids[j], duration);
      }
    });
    return map;
  }, [frontingSessions]);

  const filteredAlters = useMemo(() => {
    let result = alters.filter(a => showArchived ? true : !a.is_archived);
    if (selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (group && group.member_sp_ids) {
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
    const maxRadius = 320;
    const minRadius = 80;

    if (!selectedAlter) {
      const altersSorted = [...filteredAlters].sort(
        (a, b) => (frontingTime[b.id] || 0) - (frontingTime[a.id] || 0)
      );
      const maxTime = altersSorted.length > 0 ? (frontingTime[altersSorted[0].id] || 1) : 1;
      altersSorted.forEach((alter, idx) => {
        if (idx === 0) {
          positions[alter.id] = { x: centerX, y: centerY };
          return;
        }
        const timeRatio = (frontingTime[alter.id] || 0) / maxTime;
        const radius = minRadius + (1 - timeRatio) * (maxRadius - minRadius);
        const angle = ((idx - 1) / (altersSorted.length - 1)) * Math.PI * 2;
        positions[alter.id] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      });
      return positions;
    }

    positions[selectedAlter.id] = { x: centerX, y: centerY };
    const selectedTotalTime = frontingTime[selectedAlter.id] || 1;
    const otherAlters = filteredAlters.filter((a) => a.id !== selectedAlter.id);
    const withRatios = otherAlters.map((alter) => {
      const sharedTime = cofrontingTime[selectedAlter.id]?.[alter.id] || 0;
      const cofrontRatio = sharedTime / selectedTotalTime;
      return { alter, cofrontRatio };
    });
    withRatios.sort((a, b) => b.cofrontRatio - a.cofrontRatio);
    withRatios.forEach((item, idx) => {
      const radius = minRadius + (1 - item.cofrontRatio) * (maxRadius - minRadius);
      const angle = (idx / withRatios.length) * Math.PI * 2;
      positions[item.alter.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    });
    return positions;
  }, [filteredAlters, selectedAlter, frontingTime, cofrontingTime]);

  // Group positions: centroid of member alter positions; size based on avg fronting time
  const groupData = useMemo(() => {
    if (!showGroups) return [];
    const centerX = 600;
    const centerY = 400;
    const maxAlterTime = Math.max(...filteredAlters.map(a => frontingTime[a.id] || 0), 1);
    const result = [];

    groups
      .filter((g) => filteredAlters.some((a) => a.groups?.some((ag) => ag.id === g.id)))
      .forEach((group) => {
        const members = filteredAlters.filter(a => a.groups?.some(ag => ag.id === group.id));
        if (members.length === 0) return;
        const sumX = members.reduce((s, a) => s + (nodePositions[a.id]?.x ?? centerX), 0);
        const sumY = members.reduce((s, a) => s + (nodePositions[a.id]?.y ?? centerY), 0);
        const avgX = sumX / members.length;
        const avgY = sumY / members.length;
        const avgFrontTime = members.reduce((s, a) => s + (frontingTime[a.id] || 0), 0) / members.length;
        const sizeRatio = avgFrontTime / maxAlterTime; // 0–1
        const radius = 28 + sizeRatio * 22; // 28–50
        result.push({ group, x: avgX, y: avgY, radius });
      });

    return result;
  }, [showGroups, groups, filteredAlters, nodePositions, frontingTime]);

  useEffect(() => {
    if (selectedAlter && cofrontingTime[selectedAlter.id]) {
      const sorted = Object.entries(cofrontingTime[selectedAlter.id])
        .sort((a, b) => b[1] - a[1])
        .slice(0, cofronterCount);
      const ids = sorted.map(([id]) => id);
      setCofronters(alters.filter((a) => ids.includes(a.id)));
    } else {
      setCofronters([]);
    }
  }, [selectedAlter, cofrontingTime, cofronterCount, alters]);

  // Build nodes and links
  useEffect(() => {
    if (!filteredAlters.length) return;
    const centerX = 600;
    const centerY = 400;

    const alterNodes = filteredAlters.map((alter) => {
      const pos = nodePositions[alter.id] || { x: centerX, y: centerY };
      return {
        id: alter.id,
        label: alter.alias || alter.name,
        displayName: alter.name,
        avatar: alter.avatar_url,
        type: "alter",
        color: alter.color || "#8b5cf6",
        x: pos.x,
        y: pos.y,
        radius: 35,
        isSelected: selectedAlter?.id === alter.id,
        isCofronter: selectedAlter ? (cofrontingTime[selectedAlter.id]?.[alter.id] || 0) > 0 : false,
      };
    });

    const groupNodes = groupData.map(({ group, x, y, radius }) => ({
      id: group.id,
      label: group.name,
      type: "group",
      color: group.color || "#6366f1",
      x,
      y,
      radius,
    }));

    setNodes([...alterNodes, ...groupNodes]);

    // Auto-fit on first load only
    if (!hasAutoFit.current && alterNodes.length > 0) {
      hasAutoFit.current = true;
      // Defer one frame so svgRef has measured dimensions
      requestAnimationFrame(() => fitToNodes(alterNodes));
    }

    const newLinks = [];

    // Membership links — only when groups visible
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

    // Co-fronting links
    filteredAlters.forEach((alter) => {
      Object.entries(cofrontingTime[alter.id] || {}).forEach(([otherId, duration]) => {
        if (alter.id < otherId && filteredAlters.some((a) => a.id === otherId)) {
          newLinks.push({ source: alter.id, target: otherId, type: "cofronting", strength: duration });
        }
      });
    });

    setLinks(newLinks);
  }, [filteredAlters, groupData, showGroups, selectedAlter, cofrontingTime, nodePositions]);

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    setDragDistance(0);
  };
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX - transform.x, y: e.touches[0].clientY - transform.y });
  };
  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setTransform(t => ({ ...t, x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }));
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dist = Math.sqrt(
      (e.clientX - (dragStart.x + transform.x)) ** 2 + (e.clientY - (dragStart.y + transform.y)) ** 2
    );
    setDragDistance(dist);
    setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({ ...t, scale: Math.max(0.5, Math.min(3, t.scale * delta)) }));
  };
  const fitToNodes = (nodeList) => {
    if (!nodeList.length || !svgRef.current) return;
    const padding = 40;
    const svgWidth = svgRef.current.clientWidth || 600;
    const svgHeight = svgRef.current.clientHeight || 400;
    const xs = nodeList.map(n => n.x);
    const ys = nodeList.map(n => n.y);
    const minX = Math.min(...xs) - 40; // account for node radius
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
  };

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

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("mousemove", handleMouseMove);
    svg.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("touchstart", handleTouchStart);
    svg.addEventListener("touchmove", handleTouchMove);
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
  }, [isDragging, transform]);

  const formatDuration = (ms) => {
    if (!ms) return "0h";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const alterNodeCount = nodes.filter(n => n.type === "alter").length;
  const groupNodeCount = nodes.filter(n => n.type === "group").length;

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-card to-muted/20 rounded-lg border border-border overflow-hidden flex flex-col">

      {/* SVG map — fills all available space */}
      <div className="flex-1 relative min-h-0">
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>

            {/* Links */}
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
            {relDisplayMode !== 'none' && (() => {
              const visibleRels = relDisplayMode === 'selected'
                ? relationships.filter(r => r.alter_id_a === selectedAlter?.id || r.alter_id_b === selectedAlter?.id)
                : relationships;
              if (visibleRels.length === 0) return null;
              const NODE_R = 35;
              const pairGroups = {};
              visibleRels.forEach(rel => {
                const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
                if (!pairGroups[key]) pairGroups[key] = [];
                pairGroups[key].push(rel);
              });

              if (relDisplayMode === 'simple') {
                return (
                  <g>
                    {visibleRels.map(rel => {
                      const nodeA = nodes.find(n => n.id === rel.alter_id_a);
                      const nodeB = nodes.find(n => n.id === rel.alter_id_b);
                      if (!nodeA || !nodeB) return null;
                      const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
                      const pairRels = pairGroups[pairKey] || [rel];
                      const relIndex = pairRels.findIndex(r => r.id === rel.id);
                      const offset = (relIndex - (pairRels.length - 1) / 2) * 10;
                      const dx = nodeB.x - nodeA.x, dy = nodeB.y - nodeA.y;
                      const len = Math.sqrt(dx * dx + dy * dy) || 1;
                      const ox = (-dy / len) * offset, oy = (dx / len) * offset;
                      const x1 = nodeA.x + ox, y1 = nodeA.y + oy;
                      const x2 = nodeB.x + ox, y2 = nodeB.y + oy;
                      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                      const label = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
                      return (
                        <g key={`rel-${rel.id}`}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={rel.color || "#6b7280"} strokeWidth={1.5}
                            strokeDasharray="6,3" opacity={0.7}>
                            <title>{label}</title>
                          </line>
                          <text x={mx} y={my - 6} textAnchor="middle" fontSize={9}
                            fill={rel.color || "#6b7280"} opacity={0.9} pointerEvents="none">
                            {label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }

              const lines = [];
              visibleRels.forEach(rel => {
                const nodeA = nodes.find(n => n.id === rel.alter_id_a);
                const nodeB = nodes.find(n => n.id === rel.alter_id_b);
                if (!nodeA || !nodeB) return;
                const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
                const pairRels = pairGroups[pairKey] || [rel];
                const relIndex = pairRels.findIndex(r => r.id === rel.id);
                const baseOffset = (relIndex - (pairRels.length - 1) / 2) * 10;
                const ax = nodeA.x, ay = nodeA.y, bx = nodeB.x, by = nodeB.y;
                const dx = bx - ax, dy = by - ay;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const perpX = -dy / len, perpY = dx / len;
                const color = rel.color || "#6b7280";
                const markerId = `smarrow-${rel.id}`;
                if (rel.direction === "bidirectional") {
                  const biOff = 5;
                  const markerIdB = `smarrow-${rel.id}-b`;
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
                      <line x1={ax+ox1} y1={ay+oy1} x2={bx+ox1} y2={by+oy1}
                        stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`} />
                      <line x1={bx+ox2} y1={by+oy2} x2={ax+ox2} y2={ay+oy2}
                        stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerIdB})`} />
                    </React.Fragment>
                  );
                } else {
                  const [lx1, ly1, lx2, ly2] = rel.direction === "b_to_a" ? [bx, by, ax, ay] : [ax, ay, bx, by];
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
                    onClick={() => {
                      if (node.type === "alter" && dragDistance < 5) {
                        const clicked = alters.find((a) => a.id === node.id);
                        setSelectedAlter(prev => prev?.id === clicked?.id ? null : clicked);
                      }
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
                      onClick={() => {
                        if (dragDistance < 5) {
                          const clicked = alters.find((a) => a.id === node.id);
                          setSelectedAlter(prev => prev?.id === clicked?.id ? null : clicked);
                        }
                      }}
                    />
                  )}
                  <text x={node.x} y={node.y - (node.type === "group" ? 10 : 10)}
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

        {/* Zoom + Rels controls — right side, compact vertical stack */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-center">
          {/* Rels cycle button — icon only with colored dot indicator */}
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
          <button
            onClick={() => handleZoom("in")}
            title="Zoom in"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom("out")}
            title="Zoom out"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReset}
            title="Reset view"
            className="w-8 h-8 rounded-lg border border-border bg-card/90 text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
          >
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
        {/* Panel content — expands upward */}
        {panelOpen && (
          <div className="p-3 space-y-3 border-b border-border max-h-[50vh] overflow-y-auto overflow-x-hidden w-full">

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Archived</label>
              <button
                onClick={() => setShowArchived(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showArchived ? "bg-primary" : "bg-muted"} relative flex-shrink-0`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showArchived ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Show Groups</label>
              <button
                onClick={() => setShowGroups(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showGroups ? "bg-primary" : "bg-muted"} relative flex-shrink-0`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showGroups ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Search</label>
              <div className="w-full overflow-hidden">
                <Input
                  placeholder="Search by name or alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm w-full min-w-0"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Filter by Group</label>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={selectedGroup ? "outline" : "secondary"}
                  className="cursor-pointer text-xs"
                  onClick={() => setSelectedGroup(null)}
                >
                  All
                </Badge>
                {groups.map((group) => (
                  <Badge
                    key={group.id}
                    variant={selectedGroup === group.id ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
                  >
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
                  <input
                    type="number" min="1" max="30" value={cofronterCount}
                    onChange={(e) => setCofronterCount(Math.max(1, parseInt(e.target.value) || 10))}
                    className="w-14 h-7 px-2 border border-border rounded text-xs bg-background"
                  />
                </div>
                {cofronters.length > 0 && (
                  <div className="bg-muted/30 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                    {cofronters.map((alter) => (
                      <div key={alter.id} className="text-xs text-foreground flex items-center justify-between">
                        <span>{alter.name}</span>
                        <span className="text-muted-foreground">
                          {formatDuration(cofrontingTime[selectedAlter.id]?.[alter.id])}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trigger bar */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
        >
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