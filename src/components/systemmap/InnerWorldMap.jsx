import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import {
  ZoomIn, ZoomOut, RotateCcw, Plus, Grid, Eye, EyeOff, Users, X, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LocationNode from "./LocationNode";
import CreateRelationshipModal from "./CreateRelationshipModal";

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
        <>
          <defs>
            <clipPath id={`iw-clip-${alter.id}`}>
              <circle cx={cx} cy={cy} r={NODE_RADIUS - 2} />
            </clipPath>
          </defs>
          <image x={cx - NODE_RADIUS + 2} y={cy - NODE_RADIUS + 2}
            width={(NODE_RADIUS - 2) * 2} height={(NODE_RADIUS - 2) * 2}
            href={alter.avatar_url} preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#iw-clip-${alter.id})`} />
        </>
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

function RelationshipLines({ relationships, alters, showRelationships }) {
  if (!showRelationships) return null;
  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));

  // Group by pair key for offset calculation
  const pairGroups = {};
  relationships.forEach(rel => {
    const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
    if (!pairGroups[key]) pairGroups[key] = [];
    pairGroups[key].push(rel);
  });

  return (
    <g>
      <defs>
        {relationships.map(rel => (
          <marker key={`arr-${rel.id}`} id={`iwarrow-${rel.id}`} markerWidth="8" markerHeight="8"
            refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={rel.color || "#6b7280"} opacity={0.9} />
          </marker>
        ))}
      </defs>
      {relationships.map(rel => {
        const a = alterMap[rel.alter_id_a];
        const b = alterMap[rel.alter_id_b];
        if (!a?.inner_world_x || !b?.inner_world_x) return null;

        // For b_to_a: swap endpoints so arrow always uses markerEnd
        let x1, y1, x2, y2;
        if (rel.direction === "b_to_a") {
          x1 = b.inner_world_x; y1 = b.inner_world_y;
          x2 = a.inner_world_x; y2 = a.inner_world_y;
        } else {
          x1 = a.inner_world_x; y1 = a.inner_world_y;
          x2 = b.inner_world_x; y2 = b.inner_world_y;
        }

        // Multi-line offset
        const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
        const pairRels = pairGroups[pairKey] || [rel];
        const relIndex = pairRels.findIndex(r => r.id === rel.id);
        const offset = (relIndex - (pairRels.length - 1) / 2) * 10;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ox = (-dy / len) * offset;
        const oy = (dx / len) * offset;

        const hasArrow = rel.direction !== "bidirectional";

        return (
          <line key={rel.id}
            x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy}
            stroke={rel.color || "#6b7280"}
            strokeWidth={2}
            opacity={0.75}
            markerEnd={hasArrow ? `url(#iwarrow-${rel.id})` : undefined}
          >
            <title>{rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type}</title>
          </line>
        );
      })}
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

  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showRel, setShowRel] = useState(true);
  const [showAll, setShowAll] = useState(true);

  const [selectedAlter, setSelectedAlter] = useState(null);
  const [relModeAlter, setRelModeAlter] = useState(null);
  const [createRelModal, setCreateRelModal] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);

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
      {/* Unplaced alters panel */}
      {showAll && unplacedAlters.length > 0 && (
        <div className="w-40 flex-shrink-0 bg-card border-r border-border overflow-y-auto p-2 space-y-1.5 z-10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">Unplaced</p>
          {unplacedAlters.map(alter => (
            <div key={alter.id}
              draggable
              onDragStart={e => e.dataTransfer.setData("alterId", alter.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-muted/20 cursor-grab hover:bg-muted/40 transition-colors">
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
      )}

      {/* SVG Canvas */}
      <div className="relative flex-1 min-w-0 h-full bg-card overflow-hidden"
        style={{ backgroundImage: "radial-gradient(circle, var(--color-muted) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ cursor: isDragging ? "grabbing" : relModeAlter ? "crosshair" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDrop={handleSvgDrop}
          onDragOver={e => e.preventDefault()}
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
              showRelationships={showRel}
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
          <button onClick={() => setShowRel(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${showRel ? "bg-primary/20 text-primary border-primary/40" : "bg-card border-border text-muted-foreground"}`}>
            {showRel ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Relations
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

            {/* Color picker — native + hex input */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Color</p>
              <div className="flex items-center gap-2">
                <input type="color" value={editingLocation.color || "#6366f1"} onChange={e => {
                  const v = e.target.value;
                  setEditingLocation(l => ({ ...l, color: v }));
                  updateLocation(editingLocation, { color: v });
                }} className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent flex-shrink-0" />
                <input value={editingLocation.color || "#6366f1"} onChange={e => {
                  const v = e.target.value;
                  setEditingLocation(l => ({ ...l, color: v }));
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLocation(editingLocation, { color: v });
                }} placeholder="#6366f1"
                  className="flex-1 h-7 px-2 text-xs border border-border rounded bg-background font-mono" />
              </div>
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
            <button onClick={() => handleAlterDoubleTap(selectedAlter)}
              className="w-full text-xs bg-amber-500/10 text-amber-600 border border-amber-500/30 rounded px-2 py-1 hover:bg-amber-500/20 transition-colors">
              + Create Relationship
            </button>
            {/* Relationships for this alter */}
            <AlterRelationshipsSection
              alter={selectedAlter}
              relationships={relationships}
              alterMap={alterMap}
            />
          </div>
        )}
      </div>

      {createRelModal && (
        <CreateRelationshipModal
          alterA={createRelModal.alterA}
          alterB={createRelModal.alterB}
          onSave={handleSaveRelationship}
          onClose={() => setCreateRelModal(null)}
        />
      )}
    </div>
  );
}