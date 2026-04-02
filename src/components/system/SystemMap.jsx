import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  // Calculate fronting time for each alter
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

  // Calculate co-fronting relationships
  const cofrontingMap = useMemo(() => {
    const map = {};
    frontingSessions.forEach((session) => {
      const allFronters = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
      allFronters.forEach((alter1) => {
        if (!map[alter1]) map[alter1] = {};
        allFronters.forEach((alter2) => {
          if (alter1 !== alter2) {
            map[alter1][alter2] = (map[alter1][alter2] || 0) + 1;
          }
        });
      });
    });
    return map;
  }, [frontingSessions]);

  // Calculate node positions based on selected alter or fronting time
  const nodePositions = useMemo(() => {
    const positions = {};
    const centerX = 600;
    const centerY = 400;

    if (!selectedAlter) {
      // Default layout: sorted by fronting time

      const altersSorted = [...filteredAlters].sort((a, b) => (frontingTime[b.id] || 0) - (frontingTime[a.id] || 0));
      altersSorted.forEach((alter, idx) => {
        if (idx === 0) {
          positions[alter.id] = { x: centerX, y: centerY };
        } else {
          const maxTime = Math.max(...Object.values(frontingTime), 1);
          const timeRatio = (frontingTime[alter.id] || 0) / maxTime;
          const radius = 150 + (1 - timeRatio) * 250;
          const angle = (idx / altersSorted.length) * Math.PI * 2;
          positions[alter.id] = {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          };
        }
      });
      return positions;
    }

    // Radial layout when alter is selected
    positions[selectedAlter.id] = { x: centerX, y: centerY };

const otherAlters = filteredAlters.filter((a) => a.id !== selectedAlter.id);
    const maxCofrontWithSelected = Math.max(
      ...otherAlters.map((a) => cofrontingMap[selectedAlter.id]?.[a.id] || 0),
      1
    );

    // Sort alters by co-fronting frequency with selected alter
    const altersByCofront = otherAlters
      .map((alter) => ({
        alter,
        cofrontTime: cofrontingMap[selectedAlter.id]?.[alter.id] || 0,
      }))
      .sort((a, b) => b.cofrontTime - a.cofrontTime);

    // Position alters in concentric rings based on co-fronting frequency
    // Closer to center = more co-fronting, further out = less co-fronting
    const maxRadius = 300;
    const minRadius = 100;

    altersByCofront.forEach((item, idx) => {
      // Calculate radius: more co-fronting = closer to center
      const cofrontRatio = item.cofrontTime / maxCofrontWithSelected;
      const radius = minRadius + (1 - cofrontRatio) * (maxRadius - minRadius);

      // Position around circle by relationship density with other alters
      let relationshipScore = 0;
      altersByCofront.forEach((other) => {
        if (other.alter.id !== item.alter.id) {
          relationshipScore += cofrontingMap[item.alter.id]?.[other.alter.id] || 0;
        }
      });

      // Sort index by relationship score to cluster similar alters
      const angle = (idx / altersByCofront.length) * Math.PI * 2;

      positions[item.alter.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    });

    return positions;
}, [alters, filteredAlters, selectedAlter, frontingTime, cofrontingMap]);

  // Filter alters based on search and selection
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
  }, [alters, groups, selectedGroup, searchQuery]);

  // Get co-fronters for selected alter
  useEffect(() => {
    if (selectedAlter && cofrontingMap[selectedAlter.id]) {
      const cofronterPairs = Object.entries(cofrontingMap[selectedAlter.id])
        .sort((a, b) => b[1] - a[1])
        .slice(0, cofronterCount);
      const cofronterIds = cofronterPairs.map(([id]) => id);
      const cofronterData = alters.filter((a) => cofronterIds.includes(a.id));
      setCofronters(cofronterData);
    } else {
      setCofronters([]);
    }
  }, [selectedAlter, cofrontingMap, cofronterCount, alters]);

  // Process data into nodes and links
  useEffect(() => {
    if (!filteredAlters.length) return;

    // Create alter nodes
    const alterNodes = filteredAlters.map((alter) => {
      const pos = nodePositions[alter.id] || { x: 600, y: 400 };
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
        isCofronter: selectedAlter ? cofrontingMap[selectedAlter.id]?.[alter.id] > 0 : false,
      };
    });

    // Create group nodes
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

    // Create links
    const newLinks = [];

    // Membership links
    filteredAlters.forEach((alter) => {
      if (alter.groups && Array.isArray(alter.groups)) {
        alter.groups.forEach((group) => {
          newLinks.push({
            source: alter.id,
            target: group.id,
            type: "membership",
          });
        });
      }
    });

    // Co-fronting links (all pairs, not just selected)
    filteredAlters.forEach((alter) => {
      Object.entries(cofrontingMap[alter.id] || {}).forEach(([otherId, count]) => {
        if (alter.id < otherId && filteredAlters.some((a) => a.id === otherId)) {
          newLinks.push({
            source: alter.id,
            target: otherId,
            type: "cofronting",
            strength: count,
          });
        }
      });
    });

    setLinks(newLinks);
  }, [filteredAlters, groups, selectedAlter, cofrontingMap, nodePositions]);

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
    setTransform({
      ...transform,
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dist = Math.sqrt((e.clientX - (dragStart.x + transform.x)) ** 2 + (e.clientY - (dragStart.y + transform.y)) ** 2);
    setDragDistance(dist);
    setTransform({
      ...transform,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(3, transform.scale * delta));
    setTransform({ ...transform, scale: newScale });
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  const handleZoom = (direction) => {
    const delta = direction === "in" ? 1.2 : 0.85;
    const newScale = Math.max(0.5, Math.min(3, transform.scale * delta));
    setTransform({ ...transform, scale: newScale });
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

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-card to-muted/20 rounded-lg border border-border overflow-hidden">
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
          {/* Links/Connections */}
          {links.map((link, idx) => {
            const sourceNode = nodes.find((n) => n.id === link.source);
            const targetNode = nodes.find((n) => n.id === link.target);
            if (!sourceNode || !targetNode) return null;

            const isCofronting = link.type === "cofronting";
            return (
              <line
                key={`link-${idx}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={isCofronting ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))"}
                strokeWidth={isCofronting ? Math.min(3, (link.strength || 1) * 0.5) : 2}
                opacity={isCofronting ? 0.7 : 0.4}
                strokeDasharray={link.type === "membership" ? "5,5" : "0"}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => (
            <g key={node.id}>
              {/* Node circle with shadow */}
              <defs>
                <filter id={`shadow-${node.id}`}>
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                </filter>
              </defs>

              {/* Avatar background circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.type === "group" ? 45 : 35}
                fill={node.color}
                opacity={node.type === "alter" && !filteredAlters.some((a) => a.id === node.id) ? 0.3 : 0.8}
                filter={`url(#shadow-${node.id})`}
                stroke={node.isSelected ? "white" : node.isCofronter ? "hsl(var(--accent))" : "none"}
                strokeWidth={node.isSelected ? 3 : node.isCofronter ? 2 : 0}
                style={{ cursor: node.type === "alter" ? "pointer" : "default" }}
                onClick={() => {
                  if (node.type === "alter" && dragDistance < 5) {
                    setSelectedAlter(alters.find((a) => a.id === node.id));
                  }
                }}
              />

              {/* Avatar image if available */}
              {node.avatar && node.type === "alter" && (
                <image
                  x={node.x - 30}
                  y={node.y - 30}
                  width="60"
                  height="60"
                  href={node.avatar}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-circle-${node.id})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (dragDistance < 5) {
                      setSelectedAlter(alters.find((a) => a.id === node.id));
                    }
                  }}
                />
              )}

              {/* Clip path for circular avatar */}
              {node.avatar && node.type === "alter" && (
                <defs>
                  <clipPath id={`clip-circle-${node.id}`}>
                    <circle cx={node.x} cy={node.y} r="30" />
                  </clipPath>
                </defs>
              )}

              {/* Node label - alias or name */}
              <text
                x={node.x}
                y={node.y - (node.type === "group" ? 15 : 10)}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="white"
                pointerEvents="none"
              >
                {node.label.length > 12 ? node.label.slice(0, 10) + "..." : node.label}
              </text>

              {/* Display name if different from label (only for alters without avatar) */}
              {!node.avatar && node.type === "alter" && node.displayName !== node.label && (
                <text
                  x={node.x}
                  y={node.y + 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="white"
                  opacity="0.8"
                  pointerEvents="none"
                >
                  {node.displayName.length > 12 ? node.displayName.slice(0, 10) + "..." : node.displayName}
                </text>
              )}

              {/* Type indicator */}
              <text
                x={node.x}
                y={node.y + (node.type === "group" ? 30 : 25)}
                textAnchor="middle"
                fontSize="10"
                fill="white"
                opacity="0.6"
                pointerEvents="none"
              >
                {node.type === "group" ? "Group" : "Alter"}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Search and Filter Panel - Collapsible */}
      <div className="absolute top-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg overflow-hidden w-96 max-w-[calc(100%-32px)] md:max-w-none">
        {/* Header */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">Filters & Search</span>
          {panelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Content */}
        {panelOpen && (
          <div className="p-4 space-y-3 border-t border-border max-h-[70vh] overflow-y-auto">
            <div>
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Search Alters
              </label>
              <Input
                placeholder="Search by name or alias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Filter by Group
              </label>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={selectedGroup ? "outline" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setSelectedGroup(null)}
                >
                  All Groups
                </Badge>
                {groups.map((group) => (
                  <Badge
                    key={group.id}
                    variant={selectedGroup === group.id ? "default" : "outline"}
                    className="cursor-pointer"
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
                    Co-fronters for {selectedAlter.name}
                  </label>
                  <button
                    onClick={() => setSelectedAlter(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-foreground">Show up to</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={cofronterCount}
                      onChange={(e) => setCofronterCount(Math.max(1, parseInt(e.target.value) || 10))}
                      className="w-16 h-8 px-2 border border-border rounded text-sm"
                    />
                    <span className="text-sm text-muted-foreground">alters</span>
                  </div>
                  {cofronters.length > 0 && (
                    <div className="bg-muted/30 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                      {cofronters.map((alter) => (
                        <div key={alter.id} className="text-xs text-foreground flex items-center justify-between">
                          <span>{alter.name}</span>
                          <span className="text-muted-foreground">
                            {cofrontingMap[selectedAlter.id][alter.id]} sessions
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button size="icon" variant="outline" onClick={() => handleZoom("in")} title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={() => handleZoom("out")} title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={handleReset} title="Reset view">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg p-3 text-xs space-y-2">
        <div className="font-semibold text-foreground mb-2">Legend</div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-purple-500"></div>
          <span className="text-muted-foreground">Alters</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
          <span className="text-muted-foreground">Groups</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 bg-muted-foreground/40" style={{ borderTop: "2px dashed" }}></div>
          <span className="text-muted-foreground">Membership</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4" style={{ borderTop: "2px solid hsl(var(--accent))" }}></div>
          <span className="text-muted-foreground">Co-fronting</span>
        </div>
      </div>

      {/* Info */}
      <div className="absolute top-4 left-4 bg-card/90 backdrop-blur border border-border rounded-lg p-3 text-xs text-muted-foreground">
        <div>Alters: {nodes.filter((n) => n.type === "alter").length}</div>
        <div>Groups: {nodes.filter((n) => n.type === "group").length}</div>
      </div>
    </div>
  );
};

export default SystemMap;