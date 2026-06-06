// Inner-world map (v2) — layered, multi-map canvas built on the new data
// model (src/lib/innerWorldModel.js + useInnerWorld). Replaces the legacy
// single-placement InnerWorldMap.jsx in the Inner World tab; the old file is
// kept untouched so the tab can be reverted in one line if needed.
//
// Increment 1 (this file): multiple maps (switch/create/rename/delete), layers
// within a map (show/hide, reorder, rename, add/delete, pick the active one),
// and the canvas rendering each visible layer's locations + alter placements
// (an alter can be placed on multiple layers). Pan / zoom / drag ported from
// v1. Backdrop images and location→map/layer links are follow-up increments
// (2b / 2c) — the entities + hooks already exist for them.

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { useTerms } from "@/lib/useTerms";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { toast } from "sonner";
import {
  ZoomIn, ZoomOut, RotateCcw, Plus, Grid, Eye, EyeOff, Users, X, Upload,
  Layers as LayersIcon, ChevronUp, ChevronDown, Trash2, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ColorPicker from "@/components/shared/ColorPicker";
import LocationNode from "./LocationNode";
import CreateRelationshipModal, { RELATIONSHIP_PRESETS } from "./CreateRelationshipModal";
import { useInnerWorldMaps, useInnerWorld } from "@/hooks/useInnerWorld";

const SNAP = 20;
const NODE_RADIUS = 28;
const snapVal = (v) => Math.round(v / SNAP) * SNAP;

// ── Avatars (resolve legacy local-image:// before render) ────────────────────

function UnplacedAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
  ) : (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 10 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

function SelectedAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
  ) : (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
      style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 12 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

// ── Alter node (position comes from a PLACEMENT, not the alter record) ────────

function AlterNode({ alter, x, y, locked, isSelected, isRelMode, onTap, onDoubleTap, onDragEnd, zoom }) {
  const resolvedAvatar = useResolvedAvatarUrl(alter?.avatar_url);
  const dragRef = useRef(null);
  const tapRef = useRef({ time: 0, timer: null });
  const touchTapRef = useRef({ time: 0, timer: null });

  const handleMouseDown = (e) => {
    e.stopPropagation();
    dragRef.current = { startMx: e.clientX, startMy: e.clientY, startX: x, startY: y, moved: false };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.startMx) / zoom;
      const dy = (ev.clientY - dragRef.current.startMy) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    };
    const onUp = (ev) => {
      if (!dragRef.current) return;
      if (dragRef.current.moved) {
        if (!locked) {
          const dx = (ev.clientX - dragRef.current.startMx) / zoom;
          const dy = (ev.clientY - dragRef.current.startMy) / zoom;
          onDragEnd(dragRef.current.startX + dx, dragRef.current.startY + dy);
        }
      } else {
        const now = Date.now();
        if (now - tapRef.current.time < 300) {
          clearTimeout(tapRef.current.timer);
          tapRef.current.time = 0;
          onDoubleTap();
        } else {
          tapRef.current.time = now;
          tapRef.current.timer = setTimeout(() => onTap(), 310);
        }
      }
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e) => {
    e.stopPropagation(); e.preventDefault();
    const t = e.touches[0];
    dragRef.current = { startMx: t.clientX, startMy: t.clientY, startX: x, startY: y, moved: false, startTime: Date.now() };
  };
  const handleTouchMove = (e) => {
    e.stopPropagation(); e.preventDefault();
    if (!dragRef.current) return;
    const t = e.touches[0];
    const dx = (t.clientX - dragRef.current.startMx) / zoom;
    const dy = (t.clientY - dragRef.current.startMy) / zoom;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragRef.current.moved = true;
  };
  const handleTouchEnd = (e) => {
    e.stopPropagation(); e.preventDefault();
    if (!dragRef.current) return;
    const touch = e.changedTouches[0];
    const elapsed = Date.now() - dragRef.current.startTime;
    if (dragRef.current.moved) {
      if (!locked) {
        const dx = (touch.clientX - dragRef.current.startMx) / zoom;
        const dy = (touch.clientY - dragRef.current.startMy) / zoom;
        onDragEnd(dragRef.current.startX + dx, dragRef.current.startY + dy);
      }
      dragRef.current = null;
    } else if (elapsed < 500) {
      dragRef.current = null;
      const now = Date.now();
      if (now - touchTapRef.current.time < 300) {
        clearTimeout(touchTapRef.current.timer);
        touchTapRef.current.time = 0;
        onDoubleTap();
      } else {
        touchTapRef.current.time = now;
        touchTapRef.current.timer = setTimeout(() => onTap(), 310);
      }
    } else {
      dragRef.current = null;
    }
  };

  const ringColor = isRelMode ? "#f59e0b" : isSelected ? "#3b82f6" : "transparent";
  return (
    <g onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      style={{ cursor: locked ? "default" : "grab", touchAction: "none" }}>
      <circle cx={x} cy={y} r={NODE_RADIUS + 18} fill="transparent" />
      {(isSelected || isRelMode) && (
        <circle cx={x} cy={y} r={NODE_RADIUS + 5} fill="none" stroke={ringColor} strokeWidth={2.5} opacity={0.8} />
      )}
      <circle cx={x} cy={y} r={NODE_RADIUS} fill={alter.color || "#8b5cf6"} opacity={0.9} />
      {resolvedAvatar ? (
        <image x={x - NODE_RADIUS + 2} y={y - NODE_RADIUS + 2} width={(NODE_RADIUS - 2) * 2} height={(NODE_RADIUS - 2) * 2}
          href={resolvedAvatar} preserveAspectRatio="xMidYMid slice" style={{ clipPath: `circle(${NODE_RADIUS - 2}px)` }} />
      ) : (
        <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="white" pointerEvents="none">
          {alter.name?.charAt(0)?.toUpperCase()}
        </text>
      )}
      <text x={x} y={y + NODE_RADIUS + 13} textAnchor="middle" fontSize={10} fill="var(--color-text-primary)" pointerEvents="none" style={{ userSelect: "none" }}>
        {alter.name?.length > 14 ? alter.name.slice(0, 12) + "…" : alter.name}
      </text>
      {locked && <text x={x + NODE_RADIUS - 4} y={y + NODE_RADIUS - 4} textAnchor="middle" fontSize={10} pointerEvents="none">🔒</text>}
    </g>
  );
}

// ── Relationship lines (positions come from a posById map of placements) ──────

function RelationshipLines({ relationships, posById, relMode, selectedAlterId, onRelClick }) {
  if (relMode === "none") return null;
  const visibleRels = (relMode === "selected"
    ? relationships.filter((r) => r.alter_id_a === selectedAlterId || r.alter_id_b === selectedAlterId)
    : relationships
  ).filter((r) => posById[r.alter_id_a] && posById[r.alter_id_b]);

  const pairGroups = {};
  visibleRels.forEach((rel) => {
    const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
    (pairGroups[key] = pairGroups[key] || []).push(rel);
  });

  const lines = [];
  visibleRels.forEach((rel) => {
    const a = posById[rel.alter_id_a];
    const b = posById[rel.alter_id_b];
    const pairKey = [rel.alter_id_a, rel.alter_id_b].sort().join("-");
    const pairRels = pairGroups[pairKey] || [rel];
    const relIndex = pairRels.findIndex((r) => r.id === rel.id);
    const baseOffset = (relIndex - (pairRels.length - 1) / 2) * 10;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    const ox = perpX * baseOffset, oy = perpY * baseOffset;
    const color = rel.color || "#6b7280";
    const title = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
    const markerId = `iw2arrow-${rel.id}`;
    const handleClick = (e) => { e.stopPropagation(); onRelClick?.(rel, e); };

    if (rel.direction === "b_to_a") {
      lines.push(
        <g key={`${rel.id}`} style={{ cursor: "pointer" }} onClick={handleClick}>
          <line x1={b.x + ox} y1={b.y + oy} x2={a.x + ox} y2={a.y + oy} stroke="transparent" strokeWidth={12} />
          <line x1={b.x + ox} y1={b.y + oy} x2={a.x + ox} y2={a.y + oy} stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`}><title>{title}</title></line>
        </g>
      );
    } else if (rel.direction === "bidirectional") {
      const startId = `${markerId}-start`;
      lines.push(
        <React.Fragment key={`${rel.id}`}>
          <defs>
            <marker id={startId} markerWidth="8" markerHeight="6" refX={NODE_RADIUS + 6} refY="3" orient="auto-start-reverse">
              <path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} />
            </marker>
          </defs>
          <g style={{ cursor: "pointer" }} onClick={handleClick}>
            <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke="transparent" strokeWidth={12} />
            <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke={color} strokeWidth={2} opacity={0.75} markerStart={`url(#${startId})`} markerEnd={`url(#${markerId})`}><title>{title}</title></line>
          </g>
        </React.Fragment>
      );
    } else {
      lines.push(
        <g key={`${rel.id}`} style={{ cursor: "pointer" }} onClick={handleClick}>
          <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke="transparent" strokeWidth={12} />
          <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`}><title>{title}</title></line>
        </g>
      );
    }
  });

  return (
    <g>
      <defs>
        {visibleRels.map((rel) => (
          <marker key={`arr-${rel.id}`} id={`iw2arrow-${rel.id}`} markerWidth="8" markerHeight="6" refX={NODE_RADIUS + 6} refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={rel.color || "#6b7280"} opacity={0.9} />
          </marker>
        ))}
      </defs>
      {lines}
    </g>
  );
}

function AlterRelationshipsSection({ alter, relationships, alterMap }) {
  const myRels = relationships.filter((r) => r.alter_id_a === alter.id || r.alter_id_b === alter.id);
  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Relationships</p>
      {myRels.length === 0 && <p className="text-xs text-muted-foreground italic">No relationships defined</p>}
      {myRels.map((rel) => {
        const isA = rel.alter_id_a === alter.id;
        const other = alterMap[isA ? rel.alter_id_b : rel.alter_id_a];
        const arrow = rel.direction === "bidirectional" ? "↔" : (isA && rel.direction === "a_to_b") || (!isA && rel.direction === "b_to_a") ? "→" : "←";
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

// ── Main component ───────────────────────────────────────────────────────────

export default function InnerWorldMapV2({ alters: allAlters, relationships, onRefreshRelationships }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const svgRef = useRef(null);
  const mapContainerRef = useRef(null);
  const bgFileRef = useRef(null);
  const lastPinchRef = useRef(null);
  const touchStartPos = useRef(null);
  const justSelectedRef = useRef(false);
  const panMovedRef = useRef(false);

  const { maps, createMap, renameMap, deleteMap } = useInnerWorldMaps();
  const [activeMapId, setActiveMapId] = useState(null);
  useEffect(() => {
    if (maps.length && !maps.find((m) => m.id === activeMapId)) setActiveMapId(maps[0].id);
  }, [maps, activeMapId]);

  const iw = useInnerWorld(activeMapId);
  const { layers, locations, placements } = iw;

  const [activeLayerId, setActiveLayerId] = useState(null);
  useEffect(() => {
    if (!layers.length) { setActiveLayerId(null); return; }
    if (!layers.find((l) => l.id === activeLayerId)) {
      const topVisible = [...layers].reverse().find((l) => l.is_visible) || layers[layers.length - 1];
      setActiveLayerId(topVisible.id);
    }
  }, [layers, activeLayerId]);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [placingAlter, setPlacingAlter] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [relMode, setRelMode] = useState("all");
  const [panelOpen, setPanelOpen] = useState(true);

  const [selectedAlter, setSelectedAlter] = useState(null);
  const [relModeAlter, setRelModeAlter] = useState(null);
  const [createRelModal, setCreateRelModal] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [resolvedEditBgUrl, setResolvedEditBgUrl] = useState(null);
  const [relPopover, setRelPopover] = useState(null);
  const [editingRelFromPopover, setEditingRelFromPopover] = useState(null);

  const alterMap = useMemo(() => Object.fromEntries(allAlters.map((a) => [a.id, a])), [allAlters]);
  const visibleLayerIds = useMemo(() => new Set(layers.filter((l) => l.is_visible).map((l) => l.id)), [layers]);
  const layersBottomToTop = useMemo(() => [...layers].sort((a, b) => (a.order || 0) - (b.order || 0)), [layers]);

  // Placements on the active layer (for the "unplaced" calc) and all visible
  // placements (for rendering). One alter can have several placements.
  const alterIdsOnActiveLayer = useMemo(
    () => new Set(placements.filter((p) => p.layer_id === activeLayerId).map((p) => p.alter_id)),
    [placements, activeLayerId]
  );
  const unplacedAlters = useMemo(
    () => allAlters.filter((a) => !a.is_archived && !alterIdsOnActiveLayer.has(a.id)),
    [allAlters, alterIdsOnActiveLayer]
  );

  // posById for relationship lines — prefer a placement on a visible layer.
  const posById = useMemo(() => {
    const m = {};
    for (const p of placements) {
      if (!visibleLayerIds.has(p.layer_id)) continue;
      if (!m[p.alter_id] || p.layer_id === activeLayerId) m[p.alter_id] = { x: p.x ?? 0, y: p.y ?? 0 };
    }
    return m;
  }, [placements, visibleLayerIds, activeLayerId]);

  // ── Pan / zoom ──
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      panMovedRef.current = false;
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - transform.x, y: e.touches[0].clientY - transform.y });
    }
  };
  const handleTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinchRef.current !== null) {
        const delta = dist / lastPinchRef.current;
        setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * delta)) }));
      }
      lastPinchRef.current = dist;
    } else if (e.touches.length === 1 && isDragging) {
      const dx = Math.abs(e.touches[0].clientX - (dragStart.x + transform.x));
      const dy = Math.abs(e.touches[0].clientY - (dragStart.y + transform.y));
      if (dx > 5 || dy > 5) panMovedRef.current = true;
      setTransform((t) => ({ ...t, x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }));
    }
  };
  const handleTouchEnd = (e) => {
    lastPinchRef.current = null;
    if (touchStartPos.current && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx <= 8 && dy <= 8) {
        if (placingAlter && e.target === svgRef.current) {
          const rect = svgRef.current.getBoundingClientRect();
          const nx = (touch.clientX - rect.left - transform.x) / transform.scale;
          const ny = (touch.clientY - rect.top - transform.y) / transform.scale;
          placeAt(placingAlter, nx, ny);
          setPlacingAlter(null);
        } else {
          setRelPopover(null);
        }
      }
    }
    setIsDragging(false);
    touchStartPos.current = null;
  };
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    panMovedRef.current = false;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = Math.abs(e.clientX - (dragStart.x + transform.x));
    const dy = Math.abs(e.clientY - (dragStart.y + transform.y));
    if (dx > 5 || dy > 5) panMovedRef.current = true;
    setTransform((t) => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * delta)) }));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener("wheel", prevent, { passive: false });
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => { el.removeEventListener("wheel", prevent); el.removeEventListener("touchmove", prevent); };
  }, []);

  const handleZoom = (dir) => setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * (dir === "in" ? 1.2 : 0.85))) }));
  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    const url = editingLocation?.background_image_url;
    if (!url) { setResolvedEditBgUrl(null); return; }
    resolveImageUrl(url).then(setResolvedEditBgUrl);
  }, [editingLocation?.background_image_url]);

  // ── Placement helpers ──
  const placeAt = useCallback(async (alter, nx, ny) => {
    if (!activeLayerId) { toast.error("Add a layer first"); return; }
    const fx = snapToGrid ? snapVal(nx) : nx;
    const fy = snapToGrid ? snapVal(ny) : ny;
    await iw.placeAlter(alter.id, activeLayerId, fx, fy);
  }, [activeLayerId, snapToGrid, iw]);

  const movePlacement = useCallback(async (placement, nx, ny) => {
    const fx = snapToGrid ? snapVal(nx) : nx;
    const fy = snapToGrid ? snapVal(ny) : ny;
    await iw.moveAlterPlacement(placement.id, fx, fy);
  }, [snapToGrid, iw]);

  const handleSvgDrop = (e) => {
    e.preventDefault();
    const alterId = e.dataTransfer.getData("alterId");
    const alter = allAlters.find((a) => a.id === alterId);
    if (!alter) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left - transform.x) / transform.scale;
    const ny = (e.clientY - rect.top - transform.y) / transform.scale;
    placeAt(alter, nx, ny);
  };

  // ── Locations ──
  const addLocation = async () => {
    if (!activeLayerId) { toast.error("Add a layer first"); return; }
    const cx = (-transform.x / transform.scale) + 200;
    const cy = (-transform.y / transform.scale) + 200;
    const loc = await iw.createLocation(activeLayerId, { name: "New Location", color: "#6366f1", x: cx, y: cy, order: locations.length });
    setSelectedLocation(loc);
    setEditingLocation(loc);
  };
  const updateLocation = useCallback((loc, fields) => iw.updateLocation(loc.id, fields), [iw]);

  // ── Alter tap handlers ──
  const handleAlterTap = (alter) => {
    justSelectedRef.current = true;
    setTimeout(() => { justSelectedRef.current = false; }, 50);
    if (relModeAlter) {
      if (relModeAlter.id === alter.id) { setRelModeAlter(null); return; }
      setCreateRelModal({ alterA: relModeAlter, alterB: alter });
      setRelModeAlter(null);
    } else {
      setSelectedAlter((prev) => (prev?.id === alter.id ? null : alter));
    }
  };
  const handleAlterDoubleTap = (alter) => { setRelModeAlter((prev) => (prev?.id === alter.id ? null : alter)); setSelectedAlter(null); };
  const handleSaveRelationship = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setCreateRelModal(null);
  };

  const handleBgImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingLocation) return;
    e.target.value = "";
    const { processUploadedImage, saveLocalImage, createLocalImageUrl } = await import("@/lib/localImageStorage");
    const { dataUrl } = await processUploadedImage(file, 1200, 0.8);
    let imageUrl = dataUrl;
    if (isLocalMode()) {
      const imageId = `location-bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(imageId, dataUrl);
      imageUrl = createLocalImageUrl(imageId);
    }
    setEditingLocation((l) => ({ ...l, background_image_url: imageUrl }));
    updateLocation(editingLocation, { background_image_url: imageUrl });
  };

  const activeMap = maps.find((m) => m.id === activeMapId);

  return (
    <div className="relative w-full h-full flex flex-col" style={{ touchAction: "none" }}>
      {/* Maps bar */}
      <div className="flex items-center gap-1 flex-wrap pb-2">
        {maps.map((m) => (
          <button key={m.id} onClick={() => setActiveMapId(m.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${m.id === activeMapId ? "bg-primary/15 border-primary/50 text-primary" : "border-border/50 bg-card text-muted-foreground hover:bg-muted/40"}`}>
            {m.name}
          </button>
        ))}
        <button onClick={async () => { const name = window.prompt("New map name", "New map"); if (name) { const m = await createMap(name); setActiveMapId(m.id); } }}
          className="px-2 py-1 rounded-lg text-xs border border-dashed border-border/60 text-muted-foreground hover:bg-muted/40" title="New map">
          <Plus className="w-3.5 h-3.5" />
        </button>
        {activeMap && (
          <>
            <button onClick={async () => { const n = window.prompt("Rename map", activeMap.name); if (n) await renameMap(activeMap.id, n); }}
              className="px-1.5 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted/40" title="Rename map"><Pencil className="w-3 h-3" /></button>
            {maps.length > 1 && (
              <button onClick={async () => { if (window.confirm(`Delete map "${activeMap.name}" and everything on it? This can't be undone.`)) { await deleteMap(activeMap.id); setActiveMapId(null); } }}
                className="px-1.5 py-1 rounded-lg text-xs text-destructive hover:bg-destructive/10" title="Delete map"><Trash2 className="w-3 h-3" /></button>
            )}
          </>
        )}
      </div>

      <div className="relative flex-1 min-h-0 flex">
        {/* Layers + unplaced panel */}
        {panelOpen ? (
          <div className="w-44 flex-shrink-0 bg-card border-r border-border overflow-y-auto flex flex-col z-10">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><LayersIcon className="w-3 h-3" /> Layers</p>
              <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2 space-y-1 border-b border-border/40">
              {/* top layer first in the list */}
              {[...layersBottomToTop].reverse().map((layer, idxFromTop) => {
                const idx = layersBottomToTop.findIndex((l) => l.id === layer.id);
                return (
                  <div key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border cursor-pointer text-xs ${layer.id === activeLayerId ? "border-primary/50 bg-primary/10" : "border-border/40 bg-muted/15 hover:bg-muted/30"}`}>
                    <button onClick={(e) => { e.stopPropagation(); iw.setLayerVisible(layer.id, !layer.is_visible); }} title={layer.is_visible ? "Hide layer" : "Show layer"} className="text-muted-foreground hover:text-foreground">
                      {layer.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-50" />}
                    </button>
                    <span className={`flex-1 truncate ${layer.is_visible ? "text-foreground" : "text-muted-foreground/60"}`}>{layer.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); if (idx < layersBottomToTop.length - 1) iw.reorderLayers(swap(layersBottomToTop.map((l) => l.id), idx, idx + 1)); }}
                      disabled={idxFromTop === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); if (idx > 0) iw.reorderLayers(swap(layersBottomToTop.map((l) => l.id), idx, idx - 1)); }}
                      disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                    <button onClick={async (e) => { e.stopPropagation(); const n = window.prompt("Rename layer", layer.name); if (n) iw.renameLayer(layer.id, n); }}
                      className="text-muted-foreground hover:text-foreground" title="Rename"><Pencil className="w-2.5 h-2.5" /></button>
                    {layers.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete layer "${layer.name}" and everything on it?`)) iw.deleteLayer(layer.id); }}
                        className="text-destructive/70 hover:text-destructive" title="Delete layer"><Trash2 className="w-2.5 h-2.5" /></button>
                    )}
                  </div>
                );
              })}
              <button onClick={async () => { const n = window.prompt("New layer name", `Layer ${layers.length + 1}`); if (n) { const l = await iw.createLayer(n); setActiveLayerId(l.id); } }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs border border-dashed border-border/60 text-muted-foreground hover:bg-muted/30">
                <Plus className="w-3 h-3" /> Add layer
              </button>
            </div>
            <div className="px-2 py-1.5 text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide">Not on this layer</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {unplacedAlters.map((alter) => (
                <div key={alter.id} draggable onDragStart={(e) => e.dataTransfer.setData("alterId", alter.id)}
                  onClick={() => setPlacingAlter(alter)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${placingAlter?.id === alter.id ? "border-primary/60 bg-primary/15 animate-pulse" : "border-border/50 bg-muted/20 hover:bg-muted/40 active:cursor-grabbing"}`}>
                  <UnplacedAlterAvatar alter={alter} />
                  <span className="text-xs text-foreground truncate">{alter.name}</span>
                </div>
              ))}
              {unplacedAlters.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1">Everyone's on this layer.</p>}
            </div>
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)} title="Show layers" className="flex-shrink-0 w-8 bg-card border-r border-border flex items-center justify-center hover:bg-muted/50 z-10">
            <LayersIcon className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {placingAlter && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/90 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg z-20 flex items-center gap-2">
            <span>Tap to place {placingAlter.name} on “{layers.find((l) => l.id === activeLayerId)?.name}”</span>
            <button onClick={() => setPlacingAlter(null)}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* SVG canvas */}
        <div ref={mapContainerRef} className="relative flex-1 min-w-0 h-full bg-card overflow-hidden"
          style={{ touchAction: "none", backgroundImage: "radial-gradient(circle, var(--color-muted) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
          <svg ref={svgRef} className="w-full h-full"
            style={{ cursor: isDragging ? "grabbing" : relModeAlter || placingAlter ? "crosshair" : "grab", touchAction: "none" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            onDrop={handleSvgDrop} onDragOver={(e) => e.preventDefault()}
            onClick={(e) => {
              if (justSelectedRef.current) return;
              if (e.target.tagName === "svg" && e.target === svgRef.current) {
                if (placingAlter) {
                  const rect = svgRef.current.getBoundingClientRect();
                  const nx = (e.clientX - rect.left - transform.x) / transform.scale;
                  const ny = (e.clientY - rect.top - transform.y) / transform.scale;
                  placeAt(placingAlter, nx, ny);
                  setPlacingAlter(null);
                } else { setRelPopover(null); setSelectedLocation(null); }
              }
            }}>
            <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
              {/* Layers bottom → top: locations then alter placements */}
              {layersBottomToTop.filter((l) => l.is_visible).map((layer) => (
                <g key={layer.id}>
                  {locations.filter((loc) => loc.layer_id === layer.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map((loc) => (
                    <LocationNode key={loc.id} location={loc} isSelected={selectedLocation?.id === loc.id} zoom={transform.scale} viewOnly={false}
                      onSelect={() => { if (!panMovedRef.current) setSelectedLocation(loc); }}
                      onDoubleSelect={() => { if (!panMovedRef.current) { setSelectedLocation(loc); setEditingLocation(loc); } }}
                      onLongPress={() => { setSelectedLocation(loc); setEditingLocation(loc); }}
                      onEdit={() => { setSelectedLocation(loc); setEditingLocation(loc); }}
                      onUpdate={(fields) => updateLocation(loc, fields)}
                      onDelete={() => iw.deleteLocation(loc.id)} />
                  ))}
                  {placements.filter((p) => p.layer_id === layer.id).map((p) => {
                    const alter = alterMap[p.alter_id];
                    if (!alter || alter.is_archived) return null;
                    return (
                      <g key={p.id}>
                        <AlterNode alter={alter} x={p.x ?? 0} y={p.y ?? 0} locked={p.is_locked}
                          isSelected={selectedAlter?.id === alter.id} isRelMode={relModeAlter?.id === alter.id} zoom={transform.scale}
                          onTap={() => handleAlterTap(alter)} onDoubleTap={() => handleAlterDoubleTap(alter)}
                          onDragEnd={(nx, ny) => movePlacement(p, nx, ny)} />
                        <g onClick={() => iw.removePlacement(p.id)} style={{ cursor: "pointer" }}>
                          <circle cx={(p.x ?? 0) + NODE_RADIUS} cy={(p.y ?? 0) - NODE_RADIUS} r={12} fill="#ef4444" opacity={0.85} />
                          <text x={(p.x ?? 0) + NODE_RADIUS} y={(p.y ?? 0) - NODE_RADIUS + 4} textAnchor="middle" fontSize={10} fill="white" pointerEvents="none">×</text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              ))}

              <RelationshipLines relationships={relationships} posById={posById} relMode={relMode} selectedAlterId={selectedAlter?.id}
                onRelClick={(rel, e) => { const rect = svgRef.current?.getBoundingClientRect(); setRelPopover({ rel, x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) }); }} />
            </g>
          </svg>

          {relModeAlter && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg z-20">
              Relationship mode: tap another {terms.alter} — Esc to cancel
            </div>
          )}

          {/* Toolbar */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2 bg-card/90 backdrop-blur-sm" onClick={addLocation}>
              <Plus className="w-3 h-3" /> Location
            </Button>
            <button onClick={() => setSnapToGrid((v) => !v)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-card/90 backdrop-blur-sm ${snapToGrid ? "bg-primary/20 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>
              <Grid className="w-3 h-3" /> Snap
            </button>
            <button onClick={() => setRelMode((m) => (m === "all" ? "selected" : m === "selected" ? "none" : "all"))} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-card/90 backdrop-blur-sm ${relMode !== "none" ? "bg-primary/20 text-primary border-primary/40" : "border-border text-muted-foreground"}`}>
              {relMode === "all" ? <Eye className="w-3 h-3" /> : relMode === "selected" ? <Users className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {relMode === "all" ? "Rels: All" : relMode === "selected" ? "Rels: Selected" : "Rels: Hidden"}
            </button>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-3 flex flex-col gap-1 z-20">
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={() => handleZoom("in")}><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={() => handleZoom("out")}><ZoomOut className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={handleReset}><RotateCcw className="w-3.5 h-3.5" /></Button>
          </div>

          {/* Location edit sidebar */}
          {editingLocation && (
            <div className="absolute right-3 top-32 bg-card border border-border rounded-xl p-3 space-y-2 w-56 z-20 shadow-lg max-h-[calc(100%-160px)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Edit Location</p>
                <button onClick={() => setEditingLocation(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
              </div>
              <input value={editingLocation.name || ""} onChange={(e) => { const v = e.target.value; setEditingLocation((l) => ({ ...l, name: v })); updateLocation(editingLocation, { name: v }); }}
                placeholder="Name" className="w-full h-7 px-2 text-xs border border-border rounded bg-background" />
              <select value={editingLocation.shape || "rectangle"} onChange={(e) => { const v = e.target.value; setEditingLocation((l) => ({ ...l, shape: v })); updateLocation(editingLocation, { shape: v }); }}
                className="w-full h-7 px-2 text-xs border border-border rounded bg-background">
                <option value="rectangle">Rectangle</option>
                <option value="oval">Oval</option>
              </select>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Color</p>
                <ColorPicker value={editingLocation.color || "#6366f1"} onChange={(v) => { setEditingLocation((l) => ({ ...l, color: v })); if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLocation(editingLocation, { color: v }); }} className="justify-between" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Background image</p>
                <button onClick={() => bgFileRef.current?.click()} className="w-full flex items-center justify-center gap-1 h-7 text-xs border border-dashed border-border rounded hover:border-primary/50 hover:bg-muted/30 text-muted-foreground">
                  <Upload className="w-3 h-3" /> Upload image
                </button>
                <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={handleBgImageFile} />
                {editingLocation.background_image_url && (
                  <div className="relative">
                    <img src={resolvedEditBgUrl || editingLocation.background_image_url} alt="bg" className="w-full h-16 object-cover rounded border border-border" />
                    <div className="absolute bottom-1 left-1">
                      <LocalImageFixer value={editingLocation.background_image_url} maxWidth={1200} quality={0.8}
                        onFixed={(url) => { setEditingLocation((l) => ({ ...l, background_image_url: url })); updateLocation(editingLocation, { background_image_url: url }); }} />
                    </div>
                  </div>
                )}
              </div>
              <textarea value={editingLocation.description || ""} onChange={(e) => { const v = e.target.value; setEditingLocation((l) => ({ ...l, description: v })); updateLocation(editingLocation, { description: v }); }}
                placeholder="Description..." rows={2} className="w-full px-2 py-1 text-xs border border-border rounded bg-background resize-none" />
              <Button size="sm" variant="destructive" className="w-full h-7 text-xs" onClick={() => { if (window.confirm("Delete this location?")) { iw.deleteLocation(editingLocation.id); setEditingLocation(null); setSelectedLocation(null); } }}>
                Delete Location
              </Button>
            </div>
          )}

          {/* Relationship popover */}
          {relPopover && (() => {
            const rel = relPopover.rel;
            const label = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
            return (
              <div className="absolute z-30 bg-card border border-border rounded-xl p-3 shadow-lg space-y-1.5 min-w-[160px]" style={{ left: relPopover.x + 8, top: relPopover.y + 8 }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <button onClick={() => setRelPopover(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
                </div>
                {rel.notes && <p className="text-xs text-muted-foreground italic">{rel.notes}</p>}
                <button onClick={() => { setEditingRelFromPopover(rel); setRelPopover(null); }} className="text-xs text-primary hover:underline block">Edit relationship</button>
              </div>
            );
          })()}

          {/* Alter detail panel */}
          {selectedAlter && !relModeAlter && (
            <div className="absolute bottom-3 left-3 bg-card border border-border rounded-xl p-3 space-y-1.5 w-52 z-20 shadow-lg max-h-80 overflow-y-auto"
              onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><SelectedAlterAvatar alter={selectedAlter} /><p className="text-sm font-semibold">{selectedAlter.name}</p></div>
                <button onClick={() => setSelectedAlter(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
              </div>
              {selectedAlter.pronouns && <p className="text-xs text-muted-foreground">{selectedAlter.pronouns}</p>}
              <button onClick={() => navigate(`/alter/${selectedAlter.id}`)} className="text-xs text-primary hover:underline">View full profile →</button>
              <AlterRelationshipsSection alter={selectedAlter} relationships={relationships} alterMap={alterMap} />
            </div>
          )}
        </div>
      </div>

      {createRelModal && (
        <CreateRelationshipModal alterA={createRelModal.alterA} allAlters={allAlters} alterB={createRelModal.alterB} onSave={handleSaveRelationship} onClose={() => setCreateRelModal(null)} />
      )}
      {editingRelFromPopover && (
        <EditRelFromPopover rel={editingRelFromPopover} alterMap={alterMap}
          onClose={() => setEditingRelFromPopover(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ["alterRelationships"] }); onRefreshRelationships?.(); setEditingRelFromPopover(null); }} />
      )}
    </div>
  );
}

function swap(arr, i, j) { const next = [...arr]; [next[i], next[j]] = [next[j], next[i]]; return next; }

function EditRelFromPopover({ rel, alterMap, onClose, onSaved }) {
  const [direction, setDirection] = useState(rel.direction);
  const [relType, setRelType] = useState(rel.relationship_type);
  const [customLabel, setCustomLabel] = useState(rel.custom_label || "");
  const [color, setColor] = useState(rel.color || "#6b7280");
  const [notes, setNotes] = useState(rel.notes || "");
  const [saving, setSaving] = useState(false);
  const alterA = alterMap[rel.alter_id_a];
  const alterB = alterMap[rel.alter_id_b];
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await base44.entities.AlterRelationship.update(rel.id, { direction, relationship_type: relType, custom_label: customLabel, color, notes });
      toast.success("Relationship updated");
      onSaved();
    } catch (err) { toast.error(err.message || "Failed to update"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Edit Relationship</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <button onClick={() => { const cycle = ["a_to_b", "b_to_a", "bidirectional"]; setDirection(cycle[(cycle.indexOf(direction) + 1) % cycle.length]); }}
          className="w-full px-4 py-3 rounded-xl border-2 border-primary/40 bg-primary/5 text-primary font-semibold text-sm text-center hover:bg-primary/10 select-none">
          {direction === "a_to_b" ? `${alterA?.name} → ${alterB?.name}` : direction === "b_to_a" ? `${alterB?.name} → ${alterA?.name}` : `${alterA?.name} ↔ ${alterB?.name}`}
          <span className="block text-xs text-primary/60 font-normal mt-0.5">tap to change direction</span>
        </button>
        <select value={relType} onChange={(e) => setRelType(e.target.value)} className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
          {RELATIONSHIP_PRESETS.map((p) => <option key={p.type} value={p.type}>{p.type}</option>)}
        </select>
        {relType === "Custom" && <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Custom label..." className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />}
        <ColorPicker value={color} onChange={setColor} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes" className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} loading={saving} disabled={saving}>Save</Button>
        </div>
      </div>
    </div>
  );
}
