import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import {
  ZoomIn, ZoomOut, RotateCcw, Plus, Grid, Eye, EyeOff, Users, X, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ColorPicker from "@/components/shared/ColorPicker";
import LocationNode from "./LocationNode";
import CreateRelationshipModal, { RELATIONSHIP_PRESETS } from "./CreateRelationshipModal";

const localMode = isLocalMode ? isLocalMode() : false;
const db = localMode ? localEntities : base44.entities;

const SNAP = 20;
const NODE_RADIUS = 28;

function snapVal(v) { return Math.round(v / SNAP) * SNAP; }

function AlterNode({ alter, isSelected, isRelMode, onTap, onDoubleTap, onDragEnd, zoom }) {
  const dragRef = useRef(null);
  const tapRef = useRef({ time: 0, timer: null });

  const handleMouseDown = (e) => {
    e.stopPropagation();
    dragRef.current = { startMx: e.clientX, startMy: e.clientY, startX: alter.inner_world_x, startY: alter.inner_world_y, moved: false };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.startMx) / zoom;
      const dy = (ev.clientY - dragRef.current.startMy) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    };
    const onUp = (ev) => {
      if (!dragRef.current) return;
      if (dragRef.current.moved) {
        const dx = (ev.clientX - dragRef.current.startMx) / zoom;
        const dy = (ev.clientY - dragRef.current.startMy) / zoom;
        onDragEnd(dragRef.current.startX + dx, dragRef.current.startY + dy);
      }
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    const now = Date.now();
    if (now - tapRef.current.time < 300) {
      clearTimeout(tapRef.current.timer);
      tapRef.current.time = 0;
      onDoubleTap();
    } else {
      tapRef.current.time = now;
      tapRef.current.timer = setTimeout(() => {
        if (!dragRef.current?.moved) onTap();
      }, 310);
    }
  };

  const cx = alter.inner_world_x ?? 0;
  const cy = alter.inner_world_y ?? 0;
  const ringColor = isRelMode ? "#f59e0b" : isSelected ? "#3b82f6" : "transparent";

  return (
    <g onMouseDown={handleMouseDown} style={{ cursor: "grab" }}>
      {(isSelected || isRelMode) && (
        <circle cx={cx} cy={cy} r={NODE_RADIUS + 5} fill="none" stroke={ringColor} strokeWidth={2.5} opacity={0.8} />
      )}
      <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={alter.color || "#8b5cf6"} opacity={0.9} />
      {alter.avatar_url ? (
        <image x={cx - NODE_RADIUS + 2} y={cy - NODE_RADIUS + 2}
          width={(NODE_RADIUS - 2) * 2} height={(NODE_RADIUS - 2) * 2}
          href={alter.avatar_url} preserveAspectRatio="xMidYMid slice"
          style={{ borderRadius: NODE_RADIUS, clipPath: `circle(${NODE_RADIUS - 2}px)` }} />
      ) : (
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="white" pointerEvents="none">
          {alter.name?.charAt(0)?.toUpperCase()}
        </text>
      )}
      <text x={cx} y={cy + NODE_RADIUS + 13} textAnchor="middle" fontSize={10} fill="var(--color-text-primary)" pointerEvents="none"
        style={{ userSelect: "none" }}>
        {alter.name?.length > 14 ? alter.name.slice(0, 12) + "…" : alter.name}
      </text>
    </g>
  );
}

function RelationshipLines({ relationships, alters, relMode, selectedAlter, onRelClick }) {
  if (relMode === 'none') return null;

  const visibleRels = relMode === 'selected'
    ? relationships.filter(r => r.alter_id_a === selectedAlter?.id || r.alter_id_b === selectedAlter?.id)
    : relationships;

  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));

  // Group by pair key for offset calculation
  const pairGroups = {};
  visibleRels.forEach(rel => {
    const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
    if (!pairGroups[key]) pairGroups[key] = [];
    pairGroups[key].push(rel);
  });

  const lines = [];

  visibleRels.forEach(rel => {
    const a = alterMap[rel.alter_id_a];
    const b = alterMap[rel.alter_id_b];
    if (!a?.inner_world_x || !b?.inner_world_x) return;

    const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
    const pairRels = pairGroups[pairKey] || [rel];
    const relIndex = pairRels.findIndex(r => r.id === rel.id);
    const baseOffset = (relIndex - (pairRels.length - 1) / 2) * 10;

    const ax = a.inner_world_x, ay = a.inner_world_y;
    const bx = b.inner_world_x, by = b.inner_world_y;
    const dx = bx - ax, dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = (-dy / len);
    const perpY = (dx / len);

    const color = rel.color || "#6b7280";
    const title = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
    const markerId = `iwarrow-${rel.id}`;

    const handleClick = (e) => { e.stopPropagation(); onRelClick?.(rel, e); };

    const renderLine = (key, lx1, ly1, lx2, ly2, mId) => (
      <g key={key} style={{ cursor: "pointer" }} onClick={handleClick}>
        {/* Wide transparent hit area */}
        <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="transparent" strokeWidth={12} />
        {/* Visible line */}
        <line x1={lx1} y1={ly1} x2={lx2} y2={ly2}
          stroke={color} strokeWidth={2} opacity={0.75}
          markerEnd={`url(#${mId})`}>
          <title>{title}</title>
        </line>
      </g>
    );

    if (rel.direction === "a_to_b") {
      const ox = perpX * baseOffset, oy = perpY * baseOffset;
      lines.push(renderLine(`${rel.id}-atob`, ax + ox, ay + oy, bx + ox, by + oy, markerId));
    } else if (rel.direction === "b_to_a") {
      const ox = perpX * baseOffset, oy = perpY * baseOffset;
      lines.push(renderLine(`${rel.id}-btoa`, bx + ox, by + oy, ax + ox, ay + oy, markerId));
    } else {
      // bidirectional: two lines with small perpendicular offset so both arrows show
      const biOffset = 5;
      const ox1 = perpX * (baseOffset + biOffset), oy1 = perpY * (baseOffset + biOffset);
      const ox2 = perpX * (baseOffset - biOffset), oy2 = perpY * (baseOffset - biOffset);
      const markerIdB = `iwarrow-${rel.id}-b`;
      lines.push(
        <React.Fragment key={`${rel.id}-bi`}>
          <defs>
            <marker id={markerIdB} markerWidth="8" markerHeight="6" refX={NODE_RADIUS + 6} refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} />
            </marker>
          </defs>
          {renderLine(`${rel.id}-bi-1`, ax + ox1, ay + oy1, bx + ox1, by + oy1, markerId)}
          {renderLine(`${rel.id}-bi-2`, bx + ox2, by + oy2, ax + ox2, ay + oy2, markerIdB)}
        </React.Fragment>
      );
    }
  });

  return (
    <g>
      <defs>
        {visibleRels.map(rel => (
          <marker key={`arr-${rel.id}`} id={`iwarrow-${rel.id}`} markerWidth="8" markerHeight="6"
            refX={NODE_RADIUS + 6} refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={rel.color || "#6b7280"} opacity={0.9} />
          </marker>
        ))}
      </defs>
      {lines}
    </g>
  );
}

function AlterRelationshipsSection({ alter, relationships, alterMap }) {
  const myRels = relationships.filter(r => r.alter_id_a === alter.id || r.alter_id_b === alter.id);

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Relationships</p>
      {myRels.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No relationships defined</p>
      )}
      {myRels.map(rel => {
        const isA = rel.alter_id_a === alter.id;
        const otherId = isA ? rel.alter_id_b : rel.alter_id_a;
        const other = alterMap[otherId];
        const arrow = rel.direction === "bidirectional" ? "↔"
          : (isA && rel.direction === "a_to_b") || (!isA && rel.direction === "b_to_a") ? "→" : "←";
        const label = rel.relationship_type === "Custom" ? (rel.custom_label || "Custom") : rel.relationship_type;
        return (
          <div key={rel.id} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{arrow}</span>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: rel.color || "#6b7280" }} />
            <span className="text-foreground font-medium truncate">{other?.name || "?"}</span>
            <span className="text-muted-foreground truncate">({label})</span>
          </div>
        );
      })}
    </div>
  );
}

export default function InnerWorldMap({ alters: allAlters, relationships, onRefreshRelationships }) {
  const queryClient = useQueryClient();
  const svgRef = useRef(null);
  const bgFileRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [placingAlter, setPlacingAlter] = useState(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem("iw_panel_open") ?? "true"); }
    catch { return true; }
  });

  const [snapToGrid, setSnapToGrid] = useState(false);
  const [relMode, setRelMode] = useState('all'); // 'all' | 'selected' | 'none'
  const [showAll, setShowAll] = useState(true);

  const [selectedAlter, setSelectedAlter] = useState(null);
  const [relModeAlter, setRelModeAlter] = useState(null);
  const [createRelModal, setCreateRelModal] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [relPopover, setRelPopover] = useState(null); // { rel, x, y }
  const [editingRelFromPopover, setEditingRelFromPopover] = useState(null);
  const [showCreateRelModal, setShowCreateRelModal] = useState(false);

  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => db.InnerWorldLocation.list(),
  });

  const placedAlters = useMemo(() => allAlters.filter(a => !a.is_archived && a.inner_world_x != null), [allAlters]);
  const unplacedAlters = useMemo(() => allAlters.filter(a => !a.is_archived && a.inner_world_x == null), [allAlters]);
  const alterMap = useMemo(() => Object.fromEntries(allAlters.map(a => [a.id, a])), [allAlters]);

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * delta)) }));
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    localStorage.setItem("iw_panel_open", JSON.stringify(panelOpen));
  }, [panelOpen]);

  const handleZoom = (dir) => setTransform(t => ({
    ...t, scale: Math.max(0.2, Math.min(4, t.scale * (dir === "in" ? 1.2 : 0.85)))
  }));
  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setRelModeAlter(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveAlterPosition = useCallback(async (alter, nx, ny, snap) => {
    let fx = nx, fy = ny;
    if (snap) { fx = snapVal(nx); fy = snapVal(ny); }

    const sortedLocs = [...locations].sort((a, b) => (b.order || 0) - (a.order || 0));
    let locationId = null;
    for (const loc of sortedLocs) {
      if (fx >= loc.x && fx <= loc.x + (loc.width || 200) && fy >= loc.y && fy <= loc.y + (loc.height || 150)) {
        locationId = loc.id;
        break;
      }
    }

    await db.Alter.update(alter.id, { inner_world_x: fx, inner_world_y: fy, inner_world_location_id: locationId });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
  }, [locations, queryClient]);

  const removeAlterFromCanvas = async (alter) => {
    await db.Alter.update(alter.id, { inner_world_x: null, inner_world_y: null, inner_world_location_id: null });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    if (selectedAlter?.id === alter.id) setSelectedAlter(null);
  };

  const addLocation = async () => {
    const cx = (-transform.x / transform.scale) + 200;
    const cy = (-transform.y / transform.scale) + 200;
    const loc = await db.InnerWorldLocation.create({
      name: "New Location", shape: "rectangle", color: "#6366f1",
      x: cx, y: cy, width: 200, height: 150, order: locations.length
    });
    refetchLocations();
    setSelectedLocation(loc);
    setEditingLocation(loc);
  };

  const updateLocation = useCallback(async (loc, fields) => {
    await db.InnerWorldLocation.update(loc.id, fields);
    refetchLocations();
  }, [refetchLocations]);

  const deleteLocation = async (loc) => {
    await db.InnerWorldLocation.delete(loc.id);
    refetchLocations();
    setSelectedLocation(null);
    setEditingLocation(null);
  };

  const handleAlterTap = (alter) => {
    if (relModeAlter) {
      if (relModeAlter.id === alter.id) { setRelModeAlter(null); return; }
      setCreateRelModal({ alterA: relModeAlter, alterB: alter });
      setRelModeAlter(null);
    } else {
      setSelectedAlter(prev => prev?.id === alter.id ? null : alter);
    }
  };

  const handleAlterDoubleTap = (alter) => {
    setRelModeAlter(prev => prev?.id === alter.id ? null : alter);
    setSelectedAlter(null);
  };

  const handleSaveRelationship = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setCreateRelModal(null);
  };

  const handleSvgDrop = (e) => {
    e.preventDefault();
    const alterId = e.dataTransfer.getData("alterId");
    if (!alterId) return;
    const alter = allAlters.find(a => a.id === alterId);
    if (!alter) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left - transform.x) / transform.scale;
    const ny = (e.clientY - rect.top - transform.y) / transform.scale;
    saveAlterPosition(alter, nx, ny, snapToGrid);
  };

  const handleBgImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingLocation) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const v = ev.target.result;
      setEditingLocation(l => ({ ...l, background_image_url: v }));
      updateLocation(editingLocation, { background_image_url: v });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => (a.order || 0) - (b.order || 0)), [locations]);

  return (
    <div className="relative w-full h-full flex">
      {/* Unplaced alters panel — toggleable, with tap-to-place on mobile and drag-drop on desktop */}
      {showAll && unplacedAlters.length > 0 && (
        <>
          {panelOpen ? (
            <div className="w-40 flex-shrink-0 bg-card border-r border-border overflow-y-auto flex flex-col z-10">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 flex-shrink-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unplaced</p>
                <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-foreground" title="Collapse panel">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {unplacedAlters.map(alter => (
                  <div
                    key={alter.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData("alterId", alter.id)}
                    onClick={() => setPlacingAlter(alter)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      placingAlter?.id === alter.id
                        ? "border-primary/60 bg-primary/15"
                        : "border-border/50 bg-muted/20 hover:bg-muted/40 active:cursor-grabbing"
                    }`}>
                    {alter.avatar_url ? (
                      <img src={alter.avatar_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 10 }}>
                        {alter.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs text-foreground truncate">{alter.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPanelOpen(true)}
              title="Expand unplaced alters"
              className="flex-shrink-0 w-8 h-32 bg-card border-r border-border flex items-center justify-center hover:bg-muted/50 transition-colors z-10">
              <div className="flex flex-col items-center gap-1 rotate-180 text-muted-foreground hover:text-foreground">
                <span className="text-xs font-bold">U</span>
              </div>
            </button>
          )}
        </>
      )}

      {/* Tap-to-place banner */}
      {placingAlter && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/90 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg z-20 flex items-center gap-2">
          <span>Tap map to place {placingAlter.name}</span>
          <button onClick={() => setPlacingAlter(null)} className="ml-1 hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="relative flex-1 min-w-0 h-full bg-card overflow-hidden"
        style={{ backgroundImage: "radial-gradient(circle, var(--color-muted) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ cursor: isDragging ? "grabbing" : relModeAlter ? "crosshair" : placingAlter ? "crosshair" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDrop={handleSvgDrop}
          onDragOver={e => e.preventDefault()}
          onClick={(e) => {
            if (placingAlter) {
              const rect = svgRef.current.getBoundingClientRect();
              const nx = (e.clientX - rect.left - transform.x) / transform.scale;
              const ny = (e.clientY - rect.top - transform.y) / transform.scale;
              saveAlterPosition(placingAlter, nx, ny, snapToGrid);
              setPlacingAlter(null);
            } else {
              setRelPopover(null);
            }
          }}
        >
          <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
            {sortedLocations.map(loc => (
              <LocationNode
                key={loc.id}
                location={loc}
                isSelected={selectedLocation?.id === loc.id}
                zoom={transform.scale}
                onSelect={() => { setSelectedLocation(loc); setEditingLocation(loc); }}
                onUpdate={(fields) => updateLocation(loc, fields)}
                onDelete={() => deleteLocation(loc)}
              />
            ))}

            <RelationshipLines
              relationships={relationships}
              alters={placedAlters}
              relMode={relMode}
              selectedAlter={selectedAlter}
              onRelClick={(rel, e) => setRelPopover({ rel, x: e.clientX, y: e.clientY })}
            />

            {placedAlters.map(alter => (
              <g key={alter.id}>
                <AlterNode
                  alter={alter}
                  isSelected={selectedAlter?.id === alter.id}
                  isRelMode={relModeAlter?.id === alter.id}
                  zoom={transform.scale}
                  onTap={() => handleAlterTap(alter)}
                  onDoubleTap={() => handleAlterDoubleTap(alter)}
                  onDragEnd={(nx, ny) => saveAlterPosition(alter, nx, ny, snapToGrid)}
                />
                <g onClick={() => removeAlterFromCanvas(alter)} style={{ cursor: "pointer" }}>
                  <circle
                    cx={(alter.inner_world_x ?? 0) + NODE_RADIUS}
                    cy={(alter.inner_world_y ?? 0) - NODE_RADIUS}
                    r={8} fill="#ef4444" opacity={0.85} />
                  <text
                    x={(alter.inner_world_x ?? 0) + NODE_RADIUS}
                    y={(alter.inner_world_y ?? 0) - NODE_RADIUS + 4}
                    textAnchor="middle" fontSize={10} fill="white" pointerEvents="none">×</text>
                </g>
              </g>
            ))}
          </g>
        </svg>

        {/* Rel mode banner */}
        {relModeAlter && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg z-20">
            Relationship mode: click another alter — Esc to cancel
          </div>
        )}

        {/* Toolbar */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-20">
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2" onClick={addLocation}>
            <Plus className="w-3 h-3" /> Location
          </Button>
          <button onClick={() => setSnapToGrid(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${snapToGrid ? "bg-primary/20 text-primary border-primary/40" : "bg-card border-border text-muted-foreground hover:border-primary/30"}`}>
            <Grid className="w-3 h-3" /> Snap
          </button>
          <button onClick={() => setRelMode(m => m === 'all' ? 'selected' : m === 'selected' ? 'none' : 'all')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${relMode !== 'none' ? "bg-primary/20 text-primary border-primary/40" : "bg-card border-border text-muted-foreground"}`}>
            {relMode === 'all' ? <Eye className="w-3 h-3" /> : relMode === 'selected' ? <Users className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {relMode === 'all' ? 'Rels: All' : relMode === 'selected' ? 'Rels: Selected' : 'Rels: Hidden'}
          </button>
          <button onClick={() => setShowAll(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${showAll ? "bg-primary/20 text-primary border-primary/40" : "bg-card border-border text-muted-foreground"}`}>
            <Users className="w-3 h-3" /> All Alters
          </button>
          <div className="flex flex-col gap-1 mt-1">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleZoom("in")}><ZoomIn className="w-3 h-3" /></Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleZoom("out")}><ZoomOut className="w-3 h-3" /></Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={handleReset}><RotateCcw className="w-3 h-3" /></Button>
          </div>
        </div>

        {/* Location edit sidebar */}
        {editingLocation && (
          <div className="absolute right-3 top-56 bg-card border border-border rounded-xl p-3 space-y-2 w-56 z-20 shadow-lg max-h-[calc(100%-220px)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Edit Location</p>
              <button onClick={() => setEditingLocation(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
            </div>
            <input value={editingLocation.name || ""} onChange={e => {
              const v = e.target.value;
              setEditingLocation(l => ({ ...l, name: v }));
              updateLocation(editingLocation, { name: v });
            }} placeholder="Name" className="w-full h-7 px-2 text-xs border border-border rounded bg-background" />

            <select value={editingLocation.shape || "rectangle"} onChange={e => {
              const v = e.target.value;
              setEditingLocation(l => ({ ...l, shape: v }));
              updateLocation(editingLocation, { shape: v });
            }} className="w-full h-7 px-2 text-xs border border-border rounded bg-background">
              <option value="rectangle">Rectangle</option>
              <option value="oval">Oval</option>
            </select>

            {/* Color picker */}
             <div className="space-y-1">
               <p className="text-xs text-muted-foreground">Color</p>
               <ColorPicker 
                 value={editingLocation.color || "#6366f1"} 
                 onChange={v => {
                   setEditingLocation(l => ({ ...l, color: v }));
                   if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLocation(editingLocation, { color: v });
                 }}
                 className="justify-between"
               />
             </div>

            {/* Background image */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Background image URL</p>
              <input value={editingLocation.background_image_url || ""} onChange={e => {
                const v = e.target.value;
                setEditingLocation(l => ({ ...l, background_image_url: v }));
                updateLocation(editingLocation, { background_image_url: v });
              }} placeholder="https://..." className="w-full h-7 px-2 text-xs border border-border rounded bg-background" />
              <button
                onClick={() => bgFileRef.current?.click()}
                className="w-full flex items-center justify-center gap-1 h-7 text-xs border border-dashed border-border rounded hover:border-primary/50 hover:bg-muted/30 transition-colors text-muted-foreground">
                <Upload className="w-3 h-3" /> Upload image file
              </button>
              <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={handleBgImageFile} />
              {editingLocation.background_image_url && (
                <img src={editingLocation.background_image_url} alt="bg preview"
                  className="w-full h-16 object-cover rounded border border-border" />
              )}
            </div>

            {/* Background image opacity */}
            {editingLocation.background_image_url && (
              <div className='space-y-1'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs text-muted-foreground'>Image opacity</p>
                  <span className='text-xs text-muted-foreground font-mono'>
                    {Math.round((editingLocation.background_opacity ?? 0.7) * 100)}%
                  </span>
                </div>
                <input
                  type='range'
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={editingLocation.background_opacity ?? 0.7}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setEditingLocation(l => ({ ...l, background_opacity: v }));
                    updateLocation(editingLocation, { background_opacity: v });
                  }}
                  className='w-full accent-primary'
                />
              </div>
            )}

            {/* Layer order */}
            <div className='space-y-1'>
              <p className='text-xs text-muted-foreground'>Layer order</p>
              <div className='flex gap-1'>
                <button
                  onClick={() => {
                    const newOrder = (editingLocation.order || 0) + 1;
                    setEditingLocation(l => ({ ...l, order: newOrder }));
                    updateLocation(editingLocation, { order: newOrder });
                  }}
                  className='flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50 transition-colors'
                >
                  ↑ Bring forward
                </button>
                <button
                  onClick={() => {
                    const newOrder = Math.max(0, (editingLocation.order || 0) - 1);
                    setEditingLocation(l => ({ ...l, order: newOrder }));
                    updateLocation(editingLocation, { order: newOrder });
                  }}
                  className='flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50 transition-colors'
                >
                  ↓ Send back
                </button>
              </div>
              <p className='text-xs text-muted-foreground text-center'>Layer: {editingLocation.order || 0}</p>
            </div>

            <textarea value={editingLocation.description || ""} onChange={e => {
              const v = e.target.value;
              setEditingLocation(l => ({ ...l, description: v }));
              updateLocation(editingLocation, { description: v });
            }} placeholder="Description..." rows={2}
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background resize-none" />

            <Button size="sm" variant="destructive" className="w-full h-7 text-xs"
              onClick={() => { if (confirm("Delete this location?")) deleteLocation(editingLocation); }}>
              Delete Location
            </Button>
          </div>
        )}

        {/* Relationship line popover */}
        {relPopover && (() => {
          const rect = svgRef.current?.getBoundingClientRect();
          const left = relPopover.x - (rect?.left || 0) + 8;
          const top = relPopover.y - (rect?.top || 0) + 8;
          const rel = relPopover.rel;
          const label = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
          return (
            <div
              className="absolute z-30 bg-card border border-border rounded-xl p-3 shadow-lg space-y-1.5 min-w-[160px]"
              style={{ left, top }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <button onClick={() => setRelPopover(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rel.color || "#6b7280" }} />
                {rel.direction === "bidirectional" ? "↔" : "→"}
              </div>
              {rel.notes && <p className="text-xs text-muted-foreground italic">{rel.notes}</p>}
              <button
                onClick={() => { setEditingRelFromPopover(rel); setRelPopover(null); }}
                className="text-xs text-primary hover:underline block">
                Edit relationship
              </button>
            </div>
          );
        })()}

        {/* Alter detail panel */}
        {selectedAlter && !relModeAlter && (
          <div className="absolute bottom-3 left-3 bg-card border border-border rounded-xl p-3 space-y-1.5 w-52 z-20 shadow-lg max-h-80 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedAlter.avatar_url ? (
                  <img src={selectedAlter.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: selectedAlter.color || "#8b5cf6", fontSize: 12 }}>
                    {selectedAlter.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <p className="text-sm font-semibold">{selectedAlter.name}</p>
              </div>
              <button onClick={() => setSelectedAlter(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
            </div>
            {selectedAlter.pronouns && <p className="text-xs text-muted-foreground">{selectedAlter.pronouns}</p>}
            {selectedAlter.role && <p className="text-xs text-muted-foreground capitalize">{selectedAlter.role}</p>}
            <button onClick={() => window.location.href = `/alter/${selectedAlter.id}`}
              className="text-xs text-primary hover:underline">View full profile →</button>
            <Button variant="outline" className="flex-1" size="sm" onClick={() => {
            const loc = locations.find(l => l.id === selectedAlter?.inner_world_location_id);
            if (loc) {
            setEditingLocation(loc);
            bgFileRef.current?.click();
            }
            }}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Location Image
            </Button>
            {/* Relationships for this alter */}
            <AlterRelationshipsSection
              alter={selectedAlter}
              relationships={relationships}
              alterMap={alterMap}
            />
          </div>
        )}
      </div>

      {showCreateRelModal && selectedAlter && (
        <CreateRelationshipModal
          alterA={selectedAlter}
          allAlters={allAlters}
          alterB={null}
          onSave={handleSaveRelationship}
          onClose={() => setShowCreateRelModal(false)}
        />
      )}

      {createRelModal && (
        <CreateRelationshipModal
          alterA={createRelModal.alterA}
          allAlters={allAlters}
          alterB={createRelModal.alterB}
          onSave={handleSaveRelationship}
          onClose={() => setCreateRelModal(null)}
        />
      )}

      {editingRelFromPopover && (
        <EditRelFromPopover
          rel={editingRelFromPopover}
          alterMap={alterMap}
          onClose={() => setEditingRelFromPopover(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
            onRefreshRelationships?.();
            setEditingRelFromPopover(null);
          }}
        />
      )}
    </div>
  );
}

// Minimal inline edit modal for relationships opened from popover
function EditRelFromPopover({ rel, alterMap, onClose, onSaved }) {
  const [direction, setDirection] = useState(rel.direction);
  const [relType, setRelType] = useState(rel.relationship_type);
  const [customLabel, setCustomLabel] = useState(rel.custom_label || "");
  const [color, setColor] = useState(rel.color || "#6b7280");
  const [notes, setNotes] = useState(rel.notes || "");
  const alterA = alterMap[rel.alter_id_a];
  const alterB = alterMap[rel.alter_id_b];

  const handleSave = async () => {
    await base44.entities.AlterRelationship.update(rel.id, { direction, relationship_type: relType, custom_label: customLabel, color, notes });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Edit Relationship</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direction</p>
          {[
            { value: "a_to_b", label: `${alterA?.name} → ${alterB?.name}` },
            { value: "b_to_a", label: `${alterB?.name} → ${alterA?.name}` },
            { value: "bidirectional", label: `${alterA?.name} ↔ ${alterB?.name}` },
          ].map(opt => (
            <button key={opt.value} onClick={() => setDirection(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border mb-1 transition-colors ${direction === opt.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border hover:bg-muted/40"}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Type</p>
          <select value={relType} onChange={e => setRelType(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
            {RELATIONSHIP_PRESETS.map(p => <option key={p.type} value={p.type}>{p.type}</option>)}
          </select>
          {relType === "Custom" && (
            <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
              placeholder="Custom label..." className="mt-2 w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}