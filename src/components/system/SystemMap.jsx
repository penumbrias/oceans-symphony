import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

const SystemMap = () => {
  const svgRef = useRef(null);
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
  const [showArchived, setShowArchived] = useState(false);

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
      const allFronters = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      allFronters.forEach((id) => {
        time[id] = (time[id] || 0) + duration;
      });
    });
    return time;
  }, [frontingSessions]);

  // Co-fronting duration between pairs (ms)
  // cofrontingTime[a][b] = total ms a and b were fronting together
  const cofrontingTime = useMemo(() => {
    const map = {};
    frontingSessions.forEach((session) => {
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      const duration = endTime - new Date(session.start_time);
      const allFronters = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      allFronters.forEach((alter1) => {
        if (!map[alter1]) map[alter1] = {};
        allFronters.forEach((alter2) => {
          if (alter1 !== alter2) {
            map[alter1][alter2] = (map[alter1][alter2] || 0) + duration;
          }
        });
      });
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
        (a) =>
          a.name.toLowerCase().includes(query) ||
          (a.alias && a.alias.toLowerCase().includes(query))
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

  // Selected alter in center
  positions[selectedAlter.id] = { x: centerX, y: centerY };

  const selectedTotalTime = frontingTime[selectedAlter.id] || 1;
  const otherAlters = filteredAlters.filter((a) => a.id !== selectedAlter.id);

  const withRatios = otherAlters.map((alter) => {
    const sharedTime = cofrontingTime[selectedAlter.id]?.[alter.id] || 0;

    // ALWAYS from selected alter's perspective:
    // "What % of Kane's total front time did Kane spend with this alter?"
    // 100% → right next to center (minRadius)
    // 0%   → on the perimeter (maxRadius)
    const cofrontRatio = sharedTime / selectedTotalTime;

    return { alter, cofrontRatio };
  });

  // Sort descending so alters with highest ratio get lower angles
  // (clusters frequent co-fronters together angularly too)
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

  // Co-fronters panel list for selected alter
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
        isSelected: selectedAlter?.id === alter.id,
        isCofronter: selectedAlter
          ? (cofrontingTime[selectedAlter.id]?.[alter.id] || 0) > 0
          : false,
      };
    });

    const groupNodes = groups
      .filter((g) => filteredAlters.some((a) => a.groups?.some((ag) => ag.id === g.id)))
      .map((group, idx) => ({
        id: group.id,
        label: group.name,
        type: "group",
        color: group.color || "#6366f1",
        x: Math.cos((idx / groups.length) * Math.PI * 2) * 350 + 600,
        y: Math.sin((idx / groups.length) * Math.PI * 2) * 350 + 400,
      }));

    setNodes([...alterNodes, ...groupNodes]);

    const newLinks = [];

    filteredAlters.forEach((alter) => {
      if (alter.groups && Array.isArray(alter.groups)) {
        alter.groups.forEach((group) => {
          newLinks.push({ source: alter.id, target: group.id, type: "membership" });
        });
      }
    });

    filteredAlters.forEach((alter) => {
      Object.entries(cofrontingTime[alter.id] || {}).forEach(([otherId, duration]) => {
        if (alter.id < otherId && filteredAlters.some((a) => a.id === otherId)) {
          newLinks.push({
            source: alter.id,
            target: otherId,
            type: "cofronting",
            strength: duration,
          });
        }
      });
    });

    setLinks(newLinks);
  }, [filteredAlters, groups, selectedAlter, cofrontingTime, nodePositions]);

  // --- Event handlers (unchanged) ---
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
      (e.clientX - (dragStart.x + transform.x)) ** 2 +
      (e.clientY - (dragStart.y + transform.y)) ** 2
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

  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });
  const handleZoom = (dir) => setTransform(t => ({
    ...t, scale: Math.max(0.5, Math.min(3, t.scale * (dir === "in" ? 1.2 : 0.85)))
  }));

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

  // Format ms duration for display
  const formatDuration = (ms) => {
    if (!ms) return "0h";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-card to-muted/20 rounded-lg border border-border overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
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

          {nodes.map((node) => (
            <g key={node.id}>
              <defs>
                <filter id={`shadow-${node.id}`}>
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                </filter>
                {node.avatar && node.type === "alter" && (
                  <clipPath id={`clip-circle-${node.id}`}>
                    <circle cx={node.x} cy={node.y} r="30" />
                  </clipPath>
                )}
              </defs>

              <circle
                cx={node.x} cy={node.y}
                r={node.type === "group" ? 45 : 35}
                fill={node.color}
                opacity={0.85}
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
                  x={node.x - 30} y={node.y - 30}
                  width="60" height="60"
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

              <text
                x={node.x} y={node.y - (node.type === "group" ? 15 : 10)}
                textAnchor="middle" fontSize="13" fontWeight="600"
                fill="white" pointerEvents="none"
              >
                {node.label.length > 12 ? node.label.slice(0, 10) + "…" : node.label}
              </text>

              {!node.avatar && node.type === "alter" && node.displayName !== node.label && (
                <text
                  x={node.x} y={node.y + 8}
                  textAnchor="middle" fontSize="11"
                  fill="white" opacity="0.8" pointerEvents="none"
                >
                  {node.displayName.length > 12 ? node.displayName.slice(0, 10) + "…" : node.displayName}
                </text>
              )}

              <text
                x={node.x} y={node.y + (node.type === "group" ? 30 : 25)}
                textAnchor="middle" fontSize="10"
                fill="white" opacity="0.6" pointerEvents="none"
              >
                {node.type === "group" ? "Group" : "Alter"}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Filter panel */}
      <div className="absolute top-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg overflow-hidden w-80 max-w-[calc(100%-32px)]">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">Filters & Search</span>
          {panelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {panelOpen && (
          <div className="p-3 space-y-3 border-t border-border max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Show Archived
              </label>
              <button
                onClick={() => setShowArchived(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors ${showArchived ? "bg-primary" : "bg-muted"} relative`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showArchived ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Search
              </label>
              <Input
                placeholder="Search by name or alias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Filter by Group
              </label>
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
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button size="icon" variant="outline" onClick={() => handleZoom("in")}><ZoomIn className="w-4 h-4" /></Button>
        <Button size="icon" variant="outline" onClick={() => handleZoom("out")}><ZoomOut className="w-4 h-4" /></Button>
        <Button size="icon" variant="outline" onClick={handleReset}><RotateCcw className="w-4 h-4" /></Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg p-3 text-xs space-y-1.5">
        <div className="font-semibold text-foreground">Legend</div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-purple-500"/><span className="text-muted-foreground">Alters</span></div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-full bg-indigo-500"/><span className="text-muted-foreground">Groups</span></div>
        <div className="flex items-center gap-2"><div className="h-px w-3.5 border-t-2 border-dashed border-muted-foreground/50"/><span className="text-muted-foreground">Membership</span></div>
        <div className="flex items-center gap-2"><div className="h-px w-3.5 border-t-2" style={{borderColor:"hsl(var(--accent))"}}/><span className="text-muted-foreground">Co-fronting</span></div>
        <div className="mt-1 pt-1 border-t border-border text-muted-foreground">
          {nodes.filter(n => n.type === "alter").length} alters · {nodes.filter(n => n.type === "group").length} groups
        </div>
      </div>
    </div>
  );
};

export default SystemMap;