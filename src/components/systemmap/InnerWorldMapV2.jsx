// Inner-world map (v2) — layered, multi-map canvas on the new data model
// (innerWorldModel + useInnerWorld). Replaces the legacy single-placement
// InnerWorldMap.jsx in the Inner World tab; the old file is kept untouched
// so the tab can be reverted in one line.
//
// Features: multiple maps; layers (show/hide, reorder, rename, LOCK); alter
// placements (an alter on multiple layers); backdrop images (drag/resize/
// opacity/rotation/LOCK, sourced from the asset library); location links;
// a global VIEW MODE (display + navigate only). Render order per visible
// layer: images → locations → alters; relationship lines on top.
//
// View/lock model: an element is non-editable (no move/resize/edit/remove)
// when global view mode is on, OR its layer is locked, OR (image/placement)
// it's individually locked. Layer visibility + location links still work in
// view mode — it's navigate-only, not hidden.

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { getMemberAlters, isSubsystem } from "@/lib/subsystemUtils";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { toast } from "sonner";
import {
  ZoomIn, ZoomOut, RotateCcw, Plus, Grid, Eye, EyeOff, Users, X, Image as ImageIcon,
  Layers as LayersIcon, ChevronUp, ChevronDown, Trash2, Pencil, PencilOff, Lock, Unlock, Search, MapPin, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchableSelect from "@/components/shared/SearchableSelect";
import ColorPicker from "@/components/shared/ColorPicker";
import LocationNode from "./LocationNode";
import MapImageNode from "./MapImageNode";
import CreateRelationshipModal, { RELATIONSHIP_PRESETS } from "./CreateRelationshipModal";
import { useInnerWorldMaps, useInnerWorld } from "@/hooks/useInnerWorld";

const SNAP = 20;
const NODE_RADIUS = 28;
const snapVal = (v) => Math.round(v / SNAP) * SNAP;

// The asset picker hands back the SW-path form (/local-image/<id>); the map
// nodes (and resolveImageUrl) speak the scheme form (local-image://<id>),
// which also resolves on native where the SW may not intercept. Normalise so
// stored image URLs stay in the scheme form the rest of the map uses.
function toLocalScheme(url) {
  if (typeof url === "string" && url.startsWith("/local-image/")) {
    return `local-image://${decodeURIComponent(url.slice("/local-image/".length))}`;
  }
  return url;
}

// Flatten groups into a depth-tagged list by folder nesting (group.parent may
// reference an id OR an sp_id), cycle-guarded + depth-clamped. Feeds the nested
// group/subsystem FILTER picker — never a flat native <select> (CLAUDE.md rule).
function flattenGroupTree(groups) {
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const spToId = {};
  for (const g of groups) if (g.sp_id) spToId[g.sp_id] = g.id;
  const resolveParent = (p) => (!p || p === "root" ? null : byId[p] ? p : spToId[p] || null);
  const childrenOf = (pid) => groups.filter((g) => resolveParent(g.parent) === pid).sort((a, b) => (a.order || 0) - (b.order || 0));
  const out = [];
  const seen = new Set();
  const visit = (g, depth) => {
    if (!g || seen.has(g.id) || depth > 12) return;
    seen.add(g.id);
    out.push({ ...g, _depth: depth });
    for (const c of childrenOf(g.id)) visit(c, depth + 1);
  };
  for (const g of childrenOf(null)) visit(g, 0);
  for (const g of groups) if (!seen.has(g.id)) { seen.add(g.id); out.push({ ...g, _depth: 0 }); }
  return out;
}

function UnplacedAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
  ) : (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 10 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

function SelectedAlterAvatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return resolved ? (
    <img src={resolved} className="w-8 h-8 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
  ) : (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 12 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

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
        if (now - tapRef.current.time < 300) { clearTimeout(tapRef.current.timer); tapRef.current.time = 0; onDoubleTap(); }
        else { tapRef.current.time = now; tapRef.current.timer = setTimeout(() => onTap(), 310); }
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
      if (now - touchTapRef.current.time < 300) { clearTimeout(touchTapRef.current.timer); touchTapRef.current.time = 0; onDoubleTap(); }
      else { touchTapRef.current.time = now; touchTapRef.current.timer = setTimeout(() => onTap(), 310); }
    } else { dragRef.current = null; }
  };

  const ringColor = isRelMode ? "#f59e0b" : isSelected ? "#3b82f6" : "transparent";
  return (
    <g onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ cursor: locked ? "default" : "grab", touchAction: "none" }}>
      <circle cx={x} cy={y} r={NODE_RADIUS + 18} fill="transparent" />
      {(isSelected || isRelMode) && <circle cx={x} cy={y} r={NODE_RADIUS + 5} fill="none" stroke={ringColor} strokeWidth={2.5} opacity={0.8} />}
      <circle cx={x} cy={y} r={NODE_RADIUS} fill={alter.color || "#8b5cf6"} opacity={0.9} />
      {resolvedAvatar ? (
        <image x={x - NODE_RADIUS + 2} y={y - NODE_RADIUS + 2} width={(NODE_RADIUS - 2) * 2} height={(NODE_RADIUS - 2) * 2} href={resolvedAvatar} preserveAspectRatio="xMidYMid slice" style={{ clipPath: `circle(${NODE_RADIUS - 2}px)` }} />
      ) : (
        <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="white" pointerEvents="none">{alter.name?.charAt(0)?.toUpperCase()}</text>
      )}
      <text x={x} y={y + NODE_RADIUS + 13} textAnchor="middle" fontSize={10} fill="var(--color-text-primary)" pointerEvents="none" style={{ userSelect: "none" }}>
        {alter.name?.length > 14 ? alter.name.slice(0, 12) + "…" : alter.name}
      </text>
      {locked && <text x={x + NODE_RADIUS - 4} y={y + NODE_RADIUS - 4} textAnchor="middle" fontSize={10} pointerEvents="none">🔒</text>}
    </g>
  );
}

function RelationshipLines({ relationships, posById, relMode, selectedAlterId, onRelClick }) {
  if (relMode === "none") return null;
  const visibleRels = (relMode === "selected"
    ? relationships.filter((r) => r.alter_id_a === selectedAlterId || r.alter_id_b === selectedAlterId)
    : relationships
  ).filter((r) => posById[r.alter_id_a] && posById[r.alter_id_b]);

  const pairGroups = {};
  visibleRels.forEach((rel) => { const key = [rel.alter_id_a, rel.alter_id_b].sort().join("-"); (pairGroups[key] = pairGroups[key] || []).push(rel); });

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
    const ox = (-dy / len) * baseOffset, oy = (dx / len) * baseOffset;
    const color = rel.color || "#6b7280";
    const title = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
    const markerId = `iw2arrow-${rel.id}`;
    const handleClick = (e) => { e.stopPropagation(); onRelClick?.(rel, e); };

    if (rel.direction === "b_to_a") {
      lines.push(
        <g key={rel.id} style={{ cursor: "pointer" }} onClick={handleClick}>
          <line x1={b.x + ox} y1={b.y + oy} x2={a.x + ox} y2={a.y + oy} stroke="transparent" strokeWidth={12} />
          <line x1={b.x + ox} y1={b.y + oy} x2={a.x + ox} y2={a.y + oy} stroke={color} strokeWidth={2} opacity={0.75} markerEnd={`url(#${markerId})`}><title>{title}</title></line>
        </g>
      );
    } else if (rel.direction === "bidirectional") {
      const startId = `${markerId}-start`;
      lines.push(
        <React.Fragment key={rel.id}>
          <defs>
            <marker id={startId} markerWidth="8" markerHeight="6" refX={NODE_RADIUS + 6} refY="3" orient="auto-start-reverse"><path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.9} /></marker>
          </defs>
          <g style={{ cursor: "pointer" }} onClick={handleClick}>
            <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke="transparent" strokeWidth={12} />
            <line x1={a.x + ox} y1={a.y + oy} x2={b.x + ox} y2={b.y + oy} stroke={color} strokeWidth={2} opacity={0.75} markerStart={`url(#${startId})`} markerEnd={`url(#${markerId})`}><title>{title}</title></line>
          </g>
        </React.Fragment>
      );
    } else {
      lines.push(
        <g key={rel.id} style={{ cursor: "pointer" }} onClick={handleClick}>
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
          <marker key={`arr-${rel.id}`} id={`iw2arrow-${rel.id}`} markerWidth="8" markerHeight="6" refX={NODE_RADIUS + 6} refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill={rel.color || "#6b7280"} opacity={0.9} /></marker>
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

export default function InnerWorldMapV2({ alters: allAlters, relationships, onRefreshRelationships, initialMapId = null, initialLayerId = null, initialSolo = false }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const svgRef = useRef(null);
  const mapContainerRef = useRef(null);
  const lastPinchRef = useRef(null);
  const touchStartPos = useRef(null);
  const justSelectedRef = useRef(false);
  const panMovedRef = useRef(false);

  const { maps, createMap, renameMap, deleteMap } = useInnerWorldMaps();
  // Seed the active map from a deep-link (e.g. a location's "open on map" /
  // layer-link from its profile page) so it opens focused, not on map[0].
  const [activeMapId, setActiveMapId] = useState(initialMapId || null);
  useEffect(() => { if (maps.length && !maps.find((m) => m.id === activeMapId)) setActiveMapId(maps[0].id); }, [maps, activeMapId]);

  const iw = useInnerWorld(activeMapId);
  const { layers, locations, placements, images } = iw;
  const { data: allLayers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => localEntities.InnerWorldLayer.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => localEntities.Group.list() });

  const [activeLayerId, setActiveLayerId] = useState(null);
  useEffect(() => {
    if (!layers.length) { setActiveLayerId(null); return; }
    if (!layers.find((l) => l.id === activeLayerId)) {
      const topVisible = [...layers].reverse().find((l) => l.is_visible) || layers[layers.length - 1];
      setActiveLayerId(topVisible.id);
    }
  }, [layers, activeLayerId]);
  // One-time deep-link focus: once the target layer's map has loaded, select
  // (and optionally solo) that layer. Runs after the default layer-pick effect
  // so it wins; the ref makes it fire only once.
  const appliedInitialFocus = useRef(false);
  useEffect(() => {
    if (appliedInitialFocus.current) return;
    if (!initialLayerId) { appliedInitialFocus.current = true; return; }
    if (layers.find((l) => l.id === initialLayerId)) {
      setActiveLayerId(initialLayerId);
      if (initialSolo) setSoloLayerId(initialLayerId);
      appliedInitialFocus.current = true;
    }
  }, [layers, initialLayerId, initialSolo]);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [placingAlter, setPlacingAlter] = useState(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [relMode, setRelMode] = useState("all");
  const [panelOpen, setPanelOpen] = useState(true);
  const [viewOnly, setViewOnly] = useState(false);
  const [soloLayerId, setSoloLayerId] = useState(null); // set by a layer-link jump → show ONLY this layer
  const [unplacedSearch, setUnplacedSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  const [selectedAlter, setSelectedAlter] = useState(null);
  const [relModeAlter, setRelModeAlter] = useState(null);
  const [createRelModal, setCreateRelModal] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [viewLocExpanded, setViewLocExpanded] = useState(false); // view-mode location popup: members list
  const [relPopover, setRelPopover] = useState(null);
  const [editingRelFromPopover, setEditingRelFromPopover] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingImage, setEditingImage] = useState(null);
  const [assetPicker, setAssetPicker] = useState({ open: false, mode: null });

  // Open one editor closes the others + any selected alter (so a bottom-sheet
  // editor doesn't fight the alter detail card).
  const openLocationEditor = (loc) => { setSelectedLocation(loc); setEditingLocation(loc); setEditingImage(null); setSelectedImage(null); setSelectedAlter(null); };
  const openImageEditor = (im) => { setSelectedImage(im); setEditingImage(im); setEditingLocation(null); setSelectedLocation(null); setSelectedAlter(null); };

  const alterMap = useMemo(() => Object.fromEntries(allAlters.map((a) => [a.id, a])), [allAlters]);
  const layerById = useMemo(() => Object.fromEntries(layers.map((l) => [l.id, l])), [layers]);
  const isLayerLocked = useCallback((layerId) => !!layerById[layerId]?.is_locked, [layerById]);
  const visibleLayerIds = useMemo(() => {
    const solo = soloLayerId && layers.some((l) => l.id === soloLayerId) ? soloLayerId : null;
    return new Set((solo ? layers.filter((l) => l.id === solo) : layers.filter((l) => l.is_visible)).map((l) => l.id));
  }, [layers, soloLayerId]);
  const layersBottomToTop = useMemo(() => [...layers].sort((a, b) => (a.order || 0) - (b.order || 0)), [layers]);
  // A location link to a specific LAYER isolates it (solo) so it's distinct
  // from linking to a whole map. Guarded: a stale solo (layer not on the
  // active map) falls back to normal per-layer visibility.
  const effectiveSolo = soloLayerId && layers.some((l) => l.id === soloLayerId) ? soloLayerId : null;

  const alterIdsOnActiveLayer = useMemo(() => new Set(placements.filter((p) => p.layer_id === activeLayerId).map((p) => p.alter_id)), [placements, activeLayerId]);
  const unplacedAlters = useMemo(() => allAlters.filter((a) => !a.is_archived && !alterIdsOnActiveLayer.has(a.id)), [allAlters, alterIdsOnActiveLayer]);

  // Search + group/subsystem filter for the "not on this layer" list.
  const groupFilterIds = useMemo(() => {
    if (groupFilter === "all") return null;
    const g = groups.find((x) => x.id === groupFilter);
    if (!g) return null;
    return new Set(getMemberAlters(g, allAlters).map((a) => a.id));
  }, [groupFilter, groups, allAlters]);
  const filteredUnplaced = useMemo(() => {
    const q = unplacedSearch.trim().toLowerCase();
    return unplacedAlters.filter((a) =>
      (!q || (a.name || "").toLowerCase().includes(q) || (a.alias || "").toLowerCase().includes(q)) &&
      (!groupFilterIds || groupFilterIds.has(a.id))
    );
  }, [unplacedAlters, unplacedSearch, groupFilterIds]);

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
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinchRef.current !== null) { const delta = dist / lastPinchRef.current; setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * delta)) })); }
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
          placeAt(placingAlter, (touch.clientX - rect.left - transform.x) / transform.scale, (touch.clientY - rect.top - transform.y) / transform.scale);
          setPlacingAlter(null);
        } else { setRelPopover(null); }
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
  const handleWheel = useCallback((e) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * delta)) })); }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    // Block page scroll / browser pinch over the canvas — BUT let touches that
    // land inside an editor panel ([data-iw-panel]) through, so its sliders and
    // scroll work (the old blanket preventDefault is why sliders only tapped).
    const prevent = (e) => { if (e.target?.closest?.("[data-iw-panel]")) return; e.preventDefault(); };
    el.addEventListener("wheel", prevent, { passive: false });
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => { el.removeEventListener("wheel", prevent); el.removeEventListener("touchmove", prevent); };
  }, []);

  const handleZoom = (dir) => setTransform((t) => ({ ...t, scale: Math.max(0.2, Math.min(4, t.scale * (dir === "in" ? 1.2 : 0.85))) }));
  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });

  // Collapse the "members here" list whenever the viewed location changes.
  useEffect(() => { setViewLocExpanded(false); }, [selectedLocation?.id]);

  // ── Placements ──
  const placeAt = useCallback(async (alter, nx, ny) => {
    if (!activeLayerId) { toast.error("Add a layer first"); return; }
    if (isLayerLocked(activeLayerId)) { toast.error("This layer is locked"); return; }
    await iw.placeAlter(alter.id, activeLayerId, snapToGrid ? snapVal(nx) : nx, snapToGrid ? snapVal(ny) : ny);
  }, [activeLayerId, snapToGrid, iw, isLayerLocked]);
  const movePlacement = useCallback(async (placement, nx, ny) => {
    await iw.moveAlterPlacement(placement.id, snapToGrid ? snapVal(nx) : nx, snapToGrid ? snapVal(ny) : ny);
  }, [snapToGrid, iw]);
  const handleSvgDrop = (e) => {
    e.preventDefault();
    if (viewOnly) return;
    const alter = allAlters.find((a) => a.id === e.dataTransfer.getData("alterId"));
    if (!alter) return;
    const rect = svgRef.current.getBoundingClientRect();
    placeAt(alter, (e.clientX - rect.left - transform.x) / transform.scale, (e.clientY - rect.top - transform.y) / transform.scale);
  };

  // ── Locations ──
  const addLocation = async () => {
    if (!activeLayerId) { toast.error("Add a layer first"); return; }
    const cx = (-transform.x / transform.scale) + 200;
    const cy = (-transform.y / transform.scale) + 200;
    const loc = await iw.createLocation(activeLayerId, { name: "New Location", color: "#6366f1", x: cx, y: cy, order: locations.length });
    openLocationEditor(loc);
  };
  const updateLocation = useCallback((loc, fields) => iw.updateLocation(loc.id, fields), [iw]);

  const jumpToLink = useCallback((location) => {
    const link = iw.resolveLocationLink(location);
    if (!link) return;
    if (link.type === "map") { setActiveMapId(link.id); setActiveLayerId(null); setSoloLayerId(null); }
    else if (link.type === "layer") {
      const layer = allLayers.find((l) => l.id === link.id);
      // Isolate the linked layer — show ONLY it (distinct from a map link).
      if (layer) { setActiveMapId(layer.map_id); setActiveLayerId(layer.id); setSoloLayerId(layer.id); }
    }
    setSelectedLocation(null); setEditingLocation(null); setSelectedImage(null); setEditingImage(null);
  }, [iw, allLayers]);

  // ── Backdrop images (sourced via the asset picker = upload OR library) ──
  const addImage = () => { if (!activeLayerId) { toast.error("Add a layer first"); return; } setAssetPicker({ open: true, mode: "add" }); };
  const onAssetSelect = async (rawUrl) => {
    const mode = assetPicker.mode;
    const url = toLocalScheme(rawUrl);
    setAssetPicker({ open: false, mode: null });
    if (mode === "add") {
      if (!activeLayerId) return;
      const cx = (-transform.x / transform.scale) + 220;
      const cy = (-transform.y / transform.scale) + 220;
      const img = await iw.createImage(activeLayerId, { image_url: url, x: cx, y: cy, width: 320, height: 220 });
      openImageEditor(img);
    } else if (mode === "locationBg" && editingLocation) {
      setEditingLocation((l) => ({ ...l, background_image_url: url }));
      updateLocation(editingLocation, { background_image_url: url });
    } else if (mode === "replaceImage" && editingImage) {
      setEditingImage((im) => ({ ...im, image_url: url }));
      iw.updateImage(editingImage.id, { image_url: url });
    }
  };

  // ── Alter taps / relationships ──
  const handleAlterTap = (alter) => {
    justSelectedRef.current = true;
    setTimeout(() => { justSelectedRef.current = false; }, 50);
    if (relModeAlter) {
      if (relModeAlter.id === alter.id) { setRelModeAlter(null); return; }
      setCreateRelModal({ alterA: relModeAlter, alterB: alter });
      setRelModeAlter(null);
    } else { setSelectedAlter((prev) => (prev?.id === alter.id ? null : alter)); }
  };
  const handleAlterDoubleTap = (alter) => {
    if (viewOnly) return; // relationship creation is an edit action
    setRelModeAlter((prev) => (prev?.id === alter.id ? null : alter));
    setSelectedAlter(null);
  };
  const handleSaveRelationship = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setCreateRelModal(null);
  };

  const activeMap = maps.find((m) => m.id === activeMapId);
  const activeLayer = layerById[activeLayerId];
  const linkValue = editingLocation?.link_target_type ? `${editingLocation.link_target_type}:${editingLocation.link_target_id}` : "";

  // Indented option renderer for the nested pickers (SearchableSelect).
  const renderNestedOpt = (opt) => (
    <>
      {opt._depth > 0 && <span style={{ width: opt._depth * 14 }} className="flex-shrink-0 inline-block" />}
      {opt._depth > 0 && <span className="text-muted-foreground/50 flex-shrink-0">↳</span>}
      {opt.isSub && <span className="text-primary/70 flex-shrink-0 text-xs">◆</span>}
      {opt.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />}
      <span className="truncate text-sm flex-1">{opt.label}</span>
    </>
  );
  // Group/subsystem filter options (folder-nested + subsystem-marked).
  const groupFilterOptions = useMemo(() => ([
    { id: "all", label: `All ${terms.groups || "groups"}` },
    ...flattenGroupTree(groups).map((g) => ({ id: g.id, label: g.name || "Unnamed", color: g.color, _depth: g._depth, isSub: isSubsystem(g) })),
  ]), [groups, terms.groups]);
  // Location-link options — other maps and (nested under them) their layers.
  const linkOptions = useMemo(() => {
    const opts = [{ id: "", label: "Nothing (no link)" }];
    for (const m of maps.filter((mm) => mm.id !== activeMapId)) {
      opts.push({ id: `map:${m.id}`, label: m.name || "Map", _depth: 0, isMap: true });
      for (const l of allLayers.filter((x) => x.map_id === m.id).sort((a, b) => (a.order || 0) - (b.order || 0))) {
        opts.push({ id: `layer:${l.id}`, label: l.name || "Layer", _depth: 1 });
      }
    }
    return opts;
  }, [maps, allLayers, activeMapId]);
  // Consistent toolbar icon-button styling.
  const tbBtn = (active) => `h-8 w-8 flex items-center justify-center rounded-lg border bg-card/90 backdrop-blur-sm transition-colors ${active ? "border-primary/40 text-primary bg-primary/15" : "border-border text-muted-foreground hover:border-primary/30"}`;
  // Snap dragged/resized coords to the grid when Snap is on — applies to
  // locations + backdrop images too, not just alter placements.
  const snapFields = (f) => {
    if (!snapToGrid) return f;
    const out = { ...f };
    for (const k of ["x", "y", "width", "height"]) if (typeof out[k] === "number") out[k] = snapVal(out[k]);
    return out;
  };

  return (
    <div className="relative w-full h-full flex flex-col" style={{ touchAction: "none" }}>
      {/* Maps bar */}
      <div className="flex items-center gap-1 flex-wrap pb-2">
        {maps.map((m) => (
          <button key={m.id} onClick={() => { setActiveMapId(m.id); setSoloLayerId(null); }}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${m.id === activeMapId ? "bg-primary/15 border-primary/50 text-primary" : "border-border/50 bg-card text-muted-foreground hover:bg-muted/40"}`}>
            {m.name}
          </button>
        ))}
        {!viewOnly && (
          <>
            <button onClick={async () => { const name = window.prompt("New map name", "New map"); if (name) { const m = await createMap(name); setActiveMapId(m.id); } }}
              className="px-2 py-1 rounded-lg text-xs border border-dashed border-border/60 text-muted-foreground hover:bg-muted/40" title="New map"><Plus className="w-3.5 h-3.5" /></button>
            {activeMap && (
              <>
                <button onClick={async () => { const n = window.prompt("Rename map", activeMap.name); if (n) await renameMap(activeMap.id, n); }} className="px-1.5 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted/40" title="Rename map"><Pencil className="w-3 h-3" /></button>
                {maps.length > 1 && (
                  <button onClick={async () => { if (window.confirm(`Delete map "${activeMap.name}" and everything on it? This can't be undone.`)) { await deleteMap(activeMap.id); setActiveMapId(null); } }} className="px-1.5 py-1 rounded-lg text-xs text-destructive hover:bg-destructive/10" title="Delete map"><Trash2 className="w-3 h-3" /></button>
                )}
              </>
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
              {[...layersBottomToTop].reverse().map((layer, idxFromTop) => {
                const idx = layersBottomToTop.findIndex((l) => l.id === layer.id);
                return (
                  <div key={layer.id} onClick={() => { setActiveLayerId(layer.id); setSoloLayerId(null); }}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border cursor-pointer text-xs ${layer.id === activeLayerId ? "border-primary/60 bg-primary/15 ring-1 ring-primary/40" : "border-border/40 bg-muted/15 hover:bg-muted/30"}`}>
                    <button onClick={(e) => { e.stopPropagation(); setSoloLayerId(null); iw.setLayerVisible(layer.id, !layer.is_visible); }} title={layer.is_visible ? "Hide layer" : "Show layer"} className="text-muted-foreground hover:text-foreground">
                      {layer.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-50" />}
                    </button>
                    <span className={`flex-1 truncate ${layer.is_visible ? "text-foreground" : "text-muted-foreground/60"}`}>{layer.name}{layer.is_locked ? " 🔒" : ""}</span>
                    {!viewOnly && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); iw.setLayerLocked(layer.id, !layer.is_locked); }} title={layer.is_locked ? "Unlock layer" : "Lock layer (view-only)"} className="text-muted-foreground hover:text-foreground">
                          {layer.is_locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); if (idx < layersBottomToTop.length - 1) iw.reorderLayers(swap(layersBottomToTop.map((l) => l.id), idx, idx + 1)); }} disabled={idxFromTop === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); if (idx > 0) iw.reorderLayers(swap(layersBottomToTop.map((l) => l.id), idx, idx - 1)); }} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); const n = window.prompt("Rename layer", layer.name); if (n) iw.renameLayer(layer.id, n); }} className="text-muted-foreground hover:text-foreground" title="Rename"><Pencil className="w-2.5 h-2.5" /></button>
                        {layers.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete layer "${layer.name}" and everything on it?`)) iw.deleteLayer(layer.id); }} className="text-destructive/70 hover:text-destructive" title="Delete layer"><Trash2 className="w-2.5 h-2.5" /></button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {!viewOnly && (
                <button onClick={async () => { const n = window.prompt("New layer name", `Layer ${layers.length + 1}`); if (n) { const l = await iw.createLayer(n); setActiveLayerId(l.id); } }} className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs border border-dashed border-border/60 text-muted-foreground hover:bg-muted/30"><Plus className="w-3 h-3" /> Add layer</button>
              )}
            </div>
            {!viewOnly && (
              <>
                <div className="px-2 py-1.5 space-y-1.5 border-b border-border/40">
                  <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide">Not on this layer</p>
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={unplacedSearch} onChange={(e) => setUnplacedSearch(e.target.value)} placeholder="Search…"
                      className="w-full h-7 pl-6 pr-2 text-xs border border-border/50 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <SearchableSelect value={groupFilter} onChange={(v) => setGroupFilter(v || "all")} options={groupFilterOptions}
                    placeholder="Filter by group…" searchPlaceholder="Search groups…" renderOption={renderNestedOpt} className="w-full" />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {filteredUnplaced.map((alter) => (
                    <div key={alter.id} draggable onDragStart={(e) => e.dataTransfer.setData("alterId", alter.id)} onClick={() => setPlacingAlter(alter)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${placingAlter?.id === alter.id ? "border-primary/60 bg-primary/15 animate-pulse" : "border-border/50 bg-muted/20 hover:bg-muted/40 active:cursor-grabbing"}`}>
                      <UnplacedAlterAvatar alter={alter} />
                      <span className="text-xs text-foreground truncate">{alter.name}</span>
                    </div>
                  ))}
                  {filteredUnplaced.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1">{unplacedAlters.length === 0 ? "Everyone's on this layer." : "No matches."}</p>}
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)} title="Show layers" className="flex-shrink-0 w-8 bg-card border-r border-border flex items-center justify-center hover:bg-muted/50 z-10"><LayersIcon className="w-4 h-4 text-muted-foreground" /></button>
        )}

        {placingAlter && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-primary/90 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg z-20 flex items-center gap-2">
            <span>Tap to place {placingAlter.name} on “{activeLayer?.name}”</span>
            <button onClick={() => setPlacingAlter(null)}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* SVG canvas */}
        <div ref={mapContainerRef} className="relative flex-1 min-w-0 h-full bg-card overflow-hidden" style={{ touchAction: "none", backgroundImage: "radial-gradient(circle, var(--color-muted) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
          {/* Active layer / view-mode indicator */}
          <div className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-lg bg-card/90 backdrop-blur-sm border border-border/50 text-xs flex items-center gap-1.5 max-w-[70%]">
            {effectiveSolo ? <Eye className="w-3 h-3 text-amber-500 flex-shrink-0" /> : viewOnly ? <Eye className="w-3 h-3 text-primary flex-shrink-0" /> : <LayersIcon className="w-3 h-3 text-primary flex-shrink-0" />}
            <span className="text-muted-foreground flex-shrink-0">{effectiveSolo ? "Only:" : viewOnly ? "Viewing:" : "On:"}</span>
            <span className="font-medium text-foreground truncate">{(effectiveSolo ? layerById[effectiveSolo]?.name : activeLayer?.name) || "—"}</span>
            {effectiveSolo && <button onClick={() => setSoloLayerId(null)} className="ml-1 text-primary hover:underline flex-shrink-0">show all</button>}
          </div>

          <svg ref={svgRef} className="w-full h-full" style={{ cursor: isDragging ? "grabbing" : relModeAlter || placingAlter ? "crosshair" : "grab", touchAction: "none" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onDrop={handleSvgDrop} onDragOver={(e) => e.preventDefault()}
            onClick={(e) => {
              if (justSelectedRef.current) return;
              if (e.target.tagName === "svg" && e.target === svgRef.current) {
                if (placingAlter) {
                  const rect = svgRef.current.getBoundingClientRect();
                  placeAt(placingAlter, (e.clientX - rect.left - transform.x) / transform.scale, (e.clientY - rect.top - transform.y) / transform.scale);
                  setPlacingAlter(null);
                } else { setRelPopover(null); setSelectedLocation(null); setSelectedImage(null); }
              }
            }}>
            <g style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
              {layersBottomToTop.filter((l) => (effectiveSolo ? l.id === effectiveSolo : l.is_visible)).map((layer) => {
                const layerLocked = viewOnly || layer.is_locked;
                return (
                  <g key={layer.id}>
                    {/* Backdrop images — below locations + alters */}
                    {images.filter((im) => im.layer_id === layer.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map((im) => {
                      const locked = layerLocked || im.is_locked;
                      return (
                        <MapImageNode key={im.id} image={im} isSelected={selectedImage?.id === im.id} selectable={!layerLocked} locked={locked} zoom={transform.scale}
                          onSelect={() => { if (!panMovedRef.current && !layerLocked) openImageEditor(im); }}
                          onUpdate={(fields) => iw.updateImage(im.id, snapFields(fields))}
                          onEdit={() => { if (!layerLocked) openImageEditor(im); }} />
                      );
                    })}
                    {/* Locations */}
                    {locations.filter((loc) => loc.layer_id === layer.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map((loc) => (
                      <g key={loc.id}>
                        <LocationNode location={loc} isSelected={selectedLocation?.id === loc.id} zoom={transform.scale} viewOnly={layerLocked}
                          onSelect={() => { if (!panMovedRef.current) setSelectedLocation(loc); }}
                          onDoubleSelect={() => { if (!panMovedRef.current && !layerLocked) openLocationEditor(loc); }}
                          onLongPress={() => { if (!layerLocked) openLocationEditor(loc); }}
                          onEdit={() => { if (!layerLocked) openLocationEditor(loc); }}
                          onUpdate={(fields) => updateLocation(loc, snapFields(fields))}
                          onDelete={() => iw.deleteLocation(loc.id)} />
                        {loc.link_target_type && (
                          <g onClick={(e) => { e.stopPropagation(); jumpToLink(loc); }} style={{ cursor: "pointer" }}>
                            <circle cx={(loc.x || 0) + 14} cy={(loc.y || 0) + (loc.height || 150) - 14} r={11} fill="#3b82f6" opacity={0.9} />
                            <text x={(loc.x || 0) + 14} y={(loc.y || 0) + (loc.height || 150) - 10} textAnchor="middle" fontSize={12} fill="white" pointerEvents="none">↗</text>
                          </g>
                        )}
                      </g>
                    ))}
                    {/* Alter placements */}
                    {placements.filter((p) => p.layer_id === layer.id).map((p) => {
                      const alter = alterMap[p.alter_id];
                      if (!alter || alter.is_archived) return null;
                      const locked = layerLocked || p.is_locked;
                      const canRemove = !layerLocked && selectedAlter?.id === alter.id;
                      return (
                        <g key={p.id}>
                          <AlterNode alter={alter} x={p.x ?? 0} y={p.y ?? 0} locked={locked} isSelected={selectedAlter?.id === alter.id} isRelMode={relModeAlter?.id === alter.id} zoom={transform.scale}
                            onTap={() => handleAlterTap(alter)} onDoubleTap={() => handleAlterDoubleTap(alter)} onDragEnd={(nx, ny) => movePlacement(p, nx, ny)} />
                          {/* Remove × only once the alter is selected — stops accidental
                              deletes when you just tap to select, especially zoomed out. */}
                          {canRemove && (
                            <g onClick={() => iw.removePlacement(p.id)} style={{ cursor: "pointer" }}>
                              <circle cx={(p.x ?? 0) + NODE_RADIUS} cy={(p.y ?? 0) - NODE_RADIUS} r={12} fill="#ef4444" opacity={0.9} />
                              <text x={(p.x ?? 0) + NODE_RADIUS} y={(p.y ?? 0) - NODE_RADIUS + 4} textAnchor="middle" fontSize={10} fill="white" pointerEvents="none">×</text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              <RelationshipLines relationships={relationships} posById={posById} relMode={relMode} selectedAlterId={selectedAlter?.id}
                onRelClick={(rel, e) => { const rect = svgRef.current?.getBoundingClientRect(); setRelPopover({ rel, x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) }); }} />
            </g>
          </svg>

          {relModeAlter && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg z-20">
              Relationship mode: tap another {terms.alter} — Esc to cancel
            </div>
          )}

          {/* Toolbar — consistent icon-only buttons */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 z-20 items-end">
            <button title={viewOnly ? "Switch to edit mode" : "Switch to view mode (display only)"} className={tbBtn(viewOnly)}
              onClick={() => { setViewOnly((v) => !v); setPlacingAlter(null); setRelModeAlter(null); setEditingLocation(null); setEditingImage(null); setSelectedImage(null); setSelectedLocation(null); setSelectedAlter(null); }}>
              {viewOnly ? <PencilOff className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            {!viewOnly && (
              <>
                <button title="Add location" className={tbBtn(false)} onClick={addLocation}><MapPin className="w-4 h-4" /></button>
                <button title="Add image" className={tbBtn(false)} onClick={addImage}><ImageIcon className="w-4 h-4" /></button>
                <button title={snapToGrid ? "Snap to grid: on" : "Snap to grid: off"} className={tbBtn(snapToGrid)} onClick={() => setSnapToGrid((v) => !v)}><Grid className="w-4 h-4" /></button>
              </>
            )}
            <button title={`Relationship lines: ${relMode === "all" ? "all" : relMode === "selected" ? "selected only" : "hidden"}`} className={tbBtn(relMode !== "none")}
              onClick={() => setRelMode((m) => (m === "all" ? "selected" : m === "selected" ? "none" : "all"))}>
              {relMode === "all" ? <Eye className="w-4 h-4" /> : relMode === "selected" ? <Users className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-3 flex flex-col gap-1 z-20">
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={() => handleZoom("in")}><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={() => handleZoom("out")}><ZoomOut className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8 bg-card/90 backdrop-blur-sm" onClick={handleReset}><RotateCcw className="w-3.5 h-3.5" /></Button>
          </div>

          {/* Backdrop image edit — bottom sheet (data-iw-panel lets its sliders slide) */}
          {editingImage && !viewOnly && (
            <div data-iw-panel className="absolute left-2 right-2 bottom-2 bg-card border border-border rounded-xl p-3 space-y-2 z-30 shadow-2xl max-h-[55%] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Edit Backdrop Image</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const v = !editingImage.is_locked; setEditingImage((im) => ({ ...im, is_locked: v })); iw.updateImage(editingImage.id, { is_locked: v }); }}
                    className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 border ${editingImage.is_locked ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40" : "border-border text-muted-foreground"}`}>
                    {editingImage.is_locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />} {editingImage.is_locked ? "Locked" : "Lock"}
                  </button>
                  <button onClick={() => { setEditingImage(null); setSelectedImage(null); }}><X className="w-3 h-3 text-muted-foreground" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Opacity</p><span className="text-xs font-mono text-muted-foreground">{Math.round((editingImage.opacity ?? 1) * 100)}%</span></div>
                  <input type="range" min={0.1} max={1} step={0.05} value={editingImage.opacity ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); setEditingImage((im) => ({ ...im, opacity: v })); iw.updateImage(editingImage.id, { opacity: v }); }} className="w-full accent-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Rotation</p><span className="text-xs font-mono text-muted-foreground">{Math.round(editingImage.rotation ?? 0)}°</span></div>
                  <input type="range" min={0} max={360} step={1} value={editingImage.rotation ?? 0} onChange={(e) => { const v = parseInt(e.target.value, 10); setEditingImage((im) => ({ ...im, rotation: v })); iw.updateImage(editingImage.id, { rotation: v }); }} className="w-full accent-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-shrink-0">Stack:</span>
                <button onClick={() => { const o = (editingImage.order || 0) + 1; setEditingImage((im) => ({ ...im, order: o })); iw.updateImage(editingImage.id, { order: o }); }} className="flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50">↑ Forward</button>
                <button onClick={() => { const o = Math.max(0, (editingImage.order || 0) - 1); setEditingImage((im) => ({ ...im, order: o })); iw.updateImage(editingImage.id, { order: o }); }} className="flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50">↓ Back</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAssetPicker({ open: true, mode: "replaceImage" })} className="flex-1 flex items-center justify-center gap-1 h-7 text-xs border border-dashed border-border rounded hover:border-primary/50 text-muted-foreground"><ImageIcon className="w-3 h-3" /> Replace</button>
                <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" onClick={() => { iw.deleteImage(editingImage.id); setEditingImage(null); setSelectedImage(null); }}>Remove</Button>
              </div>
              <p className="text-[0.625rem] text-muted-foreground/70">Drag the image to move; drag its corner handle to resize.</p>
            </div>
          )}

          {/* Location edit — minimal bottom sheet. Description, lock, and the
              background-image opacity live on the full profile page (↗) to keep
              this compact. */}
          {editingLocation && !viewOnly && (
            <div data-iw-panel className="absolute left-2 right-2 bottom-2 bg-card border border-border rounded-xl p-3 space-y-2 z-30 shadow-2xl">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground">Edit Location</p>
                <div className="flex-1" />
                <button onClick={() => navigate(`/location/${editingLocation.id}`)} title="Open full profile page" className="text-primary p-1 hover:bg-primary/10 rounded"><ExternalLink className="w-4 h-4" /></button>
                <button onClick={() => setEditingLocation(null)} title="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <input value={editingLocation.name || ""} onChange={(e) => { const v = e.target.value; setEditingLocation((l) => ({ ...l, name: v })); updateLocation(editingLocation, { name: v }); }} placeholder="Location name" className="w-full h-8 px-2 text-sm border border-border rounded bg-background" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-shrink-0">Colour</span>
                <ColorPicker value={editingLocation.color || "#6366f1"} onChange={(v) => { setEditingLocation((l) => ({ ...l, color: v })); if (/^#[0-9a-fA-F]{6}$/.test(v)) updateLocation(editingLocation, { color: v }); }} className="justify-between flex-1" />
              </div>
              <div className="flex items-center gap-2">
                {/* Single shape toggle (rectangle ↔ oval) */}
                <button onClick={() => { const v = editingLocation.shape === "oval" ? "rectangle" : "oval"; setEditingLocation((l) => ({ ...l, shape: v })); updateLocation(editingLocation, { shape: v }); }}
                  title={`Shape: ${editingLocation.shape === "oval" ? "oval" : "rectangle"} — tap to toggle`}
                  className="h-8 w-9 flex items-center justify-center border border-border rounded text-foreground flex-shrink-0">
                  <span className={editingLocation.shape === "oval" ? "w-4 h-4 rounded-full border-2 border-current inline-block" : "w-4 h-3 rounded-[2px] border-2 border-current inline-block"} />
                </button>
                {/* Background image (icon → asset picker) */}
                <button onClick={() => setAssetPicker({ open: true, mode: "locationBg" })}
                  title={editingLocation.background_image_url ? "Change background image" : "Background image"}
                  className={`h-8 w-9 flex items-center justify-center border rounded flex-shrink-0 ${editingLocation.background_image_url ? "border-primary/40 text-primary bg-primary/5" : "border-border text-muted-foreground"}`}>
                  <ImageIcon className="w-4 h-4" />
                </button>
                {/* Manual width / height */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground flex-shrink-0" title="Width">↔</span>
                  <input type="number" min="40" value={Math.round(editingLocation.width || 200)} onChange={(e) => { const v = Math.max(40, parseInt(e.target.value, 10) || 0); setEditingLocation((l) => ({ ...l, width: v })); updateLocation(editingLocation, { width: v }); }} className="w-full min-w-0 h-8 px-1.5 text-xs border border-border rounded bg-background" />
                </div>
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground flex-shrink-0" title="Height">↕</span>
                  <input type="number" min="40" value={Math.round(editingLocation.height || 150)} onChange={(e) => { const v = Math.max(40, parseInt(e.target.value, 10) || 0); setEditingLocation((l) => ({ ...l, height: v })); updateLocation(editingLocation, { height: v }); }} className="w-full min-w-0 h-8 px-1.5 text-xs border border-border rounded bg-background" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tapping the ↗ on the map jumps to…</p>
                <SearchableSelect value={linkValue} options={linkOptions} placeholder="Nothing (no link)" searchPlaceholder="Search maps & layers…"
                  renderOption={(opt) => (
                    <>
                      {opt._depth > 0 && <span style={{ width: opt._depth * 14 }} className="flex-shrink-0 inline-block" />}
                      {opt._depth > 0 ? <span className="text-muted-foreground/50 flex-shrink-0">↳</span> : (opt.isMap ? <LayersIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : null)}
                      <span className="truncate text-sm flex-1">{opt.label}</span>
                    </>
                  )}
                  onChange={(v) => {
                    if (!v) { setEditingLocation((l) => ({ ...l, link_target_type: null, link_target_id: null })); iw.clearLocationLink(editingLocation.id); return; }
                    const [type, id] = v.split(":");
                    setEditingLocation((l) => ({ ...l, link_target_type: type, link_target_id: id })); iw.setLocationLink(editingLocation.id, type, id);
                  }} />
              </div>
              <Button size="sm" variant="destructive" className="w-full h-7 text-xs" onClick={() => { if (window.confirm("Delete this location?")) { iw.deleteLocation(editingLocation.id); setEditingLocation(null); setSelectedLocation(null); } }}>Delete Location</Button>
            </div>
          )}

          {/* View-mode location popup — read-only: name (→ profile), description,
              link, an expandable members list, and any sub-locations. */}
          {viewOnly && selectedLocation && (() => {
            const loc = selectedLocation;
            const inLoc = allAlters.filter((a) => !a.is_archived && a.inner_world_location_id === loc.id);
            const subs = locations.filter((l) => {
              if (l.id === loc.id) return false;
              return (l.x ?? 0) >= (loc.x ?? 0) && (l.x ?? 0) + (l.width || 200) <= (loc.x ?? 0) + (loc.width || 200) &&
                     (l.y ?? 0) >= (loc.y ?? 0) && (l.y ?? 0) + (l.height || 150) <= (loc.y ?? 0) + (loc.height || 150);
            });
            const linkName = loc.link_target_type === "map" ? maps.find((m) => m.id === loc.link_target_id)?.name
              : loc.link_target_type === "layer" ? allLayers.find((l) => l.id === loc.link_target_id)?.name : null;
            return (
              <div data-iw-panel className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-64 bg-card border border-border rounded-xl p-3 space-y-2 z-30 shadow-lg max-h-[60%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => navigate(`/location/${loc.id}`)} title="Open profile page" className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary text-left min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: loc.color || "#6366f1" }} />
                    <span className="truncate">{loc.name}</span>
                  </button>
                  <button onClick={() => setSelectedLocation(null)}><X className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /></button>
                </div>
                {loc.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{loc.description}</p>}
                {linkName && (
                  <button onClick={() => jumpToLink(loc)} className="w-full flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> Jump to {linkName}
                  </button>
                )}
                {inLoc.length > 0 && (
                  <div>
                    <button onClick={() => setViewLocExpanded((v) => !v)} className="w-full flex items-center justify-between text-xs font-medium text-foreground">
                      <span>{terms.Alters} here ({inLoc.length})</span>
                      {viewLocExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {viewLocExpanded && (
                      <div className="mt-1.5 space-y-1">
                        {inLoc.map((a) => (
                          <button key={a.id} onClick={() => navigate(`/alter/${a.id}`)} className="w-full flex items-center gap-2 text-xs text-foreground hover:text-primary text-left">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[0.5rem] text-white flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }}>{a.name?.[0]?.toUpperCase()}</span>
                            <span className="truncate">{a.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {subs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Sub-locations ({subs.length})</p>
                    <div className="mt-1 space-y-1">
                      {subs.map((s) => (
                        <button key={s.id} onClick={() => setSelectedLocation(s)} className="w-full flex items-center gap-2 text-xs text-foreground hover:text-primary text-left">
                          <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ backgroundColor: s.color || "#6366f1" }} />
                          <span className="truncate">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Relationship popover */}
          {relPopover && (() => {
            const rel = relPopover.rel;
            const label = rel.relationship_type === "Custom" ? rel.custom_label : rel.relationship_type;
            return (
              <div data-iw-panel className="absolute z-30 bg-card border border-border rounded-xl p-3 shadow-lg space-y-1.5 min-w-[160px]" style={{ left: relPopover.x + 8, top: relPopover.y + 8 }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <button onClick={() => setRelPopover(null)}><X className="w-3 h-3 text-muted-foreground" /></button>
                </div>
                {rel.notes && <p className="text-xs text-muted-foreground italic">{rel.notes}</p>}
                {!viewOnly && <button onClick={() => { setEditingRelFromPopover(rel); setRelPopover(null); }} className="text-xs text-primary hover:underline block">Edit relationship</button>}
              </div>
            );
          })()}

          {/* Alter detail panel */}
          {selectedAlter && !relModeAlter && (
            <div data-iw-panel className="absolute bottom-3 left-3 bg-card border border-border rounded-xl p-3 space-y-1.5 w-52 z-20 shadow-lg max-h-80 overflow-y-auto" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
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

      <AssetPickerModal open={assetPicker.open} onClose={() => setAssetPicker({ open: false, mode: null })} onSelect={onAssetSelect} />

      {createRelModal && (
        <CreateRelationshipModal alterA={createRelModal.alterA} allAlters={allAlters} alterB={createRelModal.alterB} onSave={handleSaveRelationship} onClose={() => setCreateRelModal(null)} />
      )}
      {editingRelFromPopover && (
        <EditRelFromPopover rel={editingRelFromPopover} alterMap={alterMap} onClose={() => setEditingRelFromPopover(null)} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["alterRelationships"] }); onRefreshRelationships?.(); setEditingRelFromPopover(null); }} />
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
