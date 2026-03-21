import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const SystemMap = () => {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlter, setSelectedAlter] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [cofronterCount, setCofronterCount] = useState(10);
  const [cofronters, setCofronters] = useState([]);

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

  // Filter alters based on search and selection
  const filteredAlters = useMemo(() => {
    let result = alters;

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

  // Process data into nodes and links with clustering
  useEffect(() => {
    if (!filteredAlters.length) return;

    // Create clusters based on groups or co-fronting
    const clusters = {};
    filteredAlters.forEach((alter) => {
      const groupId = alter.groups?.[0]?.id || "ungrouped";
      if (!clusters[groupId]) clusters[groupId] = [];
      clusters[groupId].push(alter);
    });

    // Create nodes with cluster positioning
    const alterNodes = [];
    let clusterIdx = 0;
    Object.entries(clusters).forEach(([groupId, clusterAlters]) => {
      const clusterCenterX = Math.cos((clusterIdx / Object.keys(clusters).length) * Math.PI * 2) * 200 + 250;
      const clusterCenterY = Math.sin((clusterIdx / Object.keys(clusters).length) * Math.PI * 2) * 200 + 250;

      clusterAlters.forEach((alter, idx) => {
        const angle = (idx / clusterAlters.length) * Math.PI * 2;
        const radius = 80;
        alterNodes.push({
          id: alter.id,
          label: alter.name,
          alias: alter.alias,
          type: "alter",
          color: alter.color || "#8b5cf6",
          role: alter.role || "member",
          x: clusterCenterX + Math.cos(angle) * radius,
          y: clusterCenterY + Math.sin(angle) * radius,
          isSelected: selectedAlter?.id === alter.id,
          isCofronter: cofronters.some((c) => c.id === alter.id),
        });
      });
      clusterIdx++;
    });

    // Create group nodes
    const groupNodes = groups
      .filter((g) => filteredAlters.some((a) => a.groups?.some((ag) => ag.id === g.id)))
      .map((group, idx) => ({
        id: group.id,
        label: group.name,
        type: "group",
        color: group.color || "#6366f1",
        x: Math.cos((idx / groups.length) * Math.PI * 2) * 350 + 250,
        y: Math.sin((idx / groups.length) * Math.PI * 2) * 350 + 250,
      }));

    setNodes([...alterNodes, ...groupNodes]);

    // Create links: alters to groups + co-fronting
    const newLinks = [];
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

    // Add co-fronting links for selected alter
    if (selectedAlter && cofronters.length > 0) {
      cofronters.forEach((cofronter) => {
        const frequency = cofrontingMap[selectedAlter.id][cofronter.id];
        newLinks.push({
          source: selectedAlter.id,
          target: cofronter.id,
          type: "cofronting",
          strength: frequency,
        });
      });
    }

    setLinks(newLinks);
  }, [filteredAlters, groups, selectedAlter, cofronters, cofrontingMap]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
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
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      svg.removeEventListener("mousemove", handleMouseMove);
      svg.removeEventListener("mouseup", handleMouseUp);
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

            return (
              <line
                key={`link-${idx}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="2"
                opacity="0.4"
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
              <circle
                cx={node.x}
                cy={node.y}
                r={node.type === "group" ? 45 : 35}
                fill={node.color}
                opacity={0.8}
                filter={`url(#shadow-${node.id})`}
              />

              {/* Node label */}
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

              {/* Role/Type label */}
              {node.role && node.type === "alter" && (
                <text
                  x={node.x}
                  y={node.y + 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="white"
                  opacity="0.8"
                  pointerEvents="none"
                >
                  {node.role}
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
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border border-border rounded-lg p-3 text-xs space-y-2">
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