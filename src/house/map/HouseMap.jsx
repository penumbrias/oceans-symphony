// The house's System map room: board 02-SystemMap on a computer and tablet
// (an editor: tools on the left, the maps as tabs over the canvas, Layers
// and Info on the right, the status line under all three) and board
// 11-SystemMapPhone on a phone (the maps as tabs, the canvas, the place's
// panel under it, and Move · Place · Room · Link · Layers as the room's bar
// in the frame's bottom zone). House mode only: the frames draw it on
// /system-map (houseMapRoom); the old page is gated off (HouseRoomGate) and
// stays exactly as it was with the new house off.
//
// One canvas. The map itself (pan, pinch, wheel zoom, drag, resize, the
// places, pictures, who's placed and the relationship lines) is the old
// InnerWorldMapV2, drawn through its `renderHouse` door: it keeps every
// piece of state and every write (innerWorldModel through useInnerWorld,
// relationships through their editors) and hands this room an `api`. The
// room only draws the frame around it and calls those handlers.
//
// The other views are the old ones in house panels: "Who fronts together"
// (the analytics map and the relationships list) and the text list of every
// place (InnerWorldListView). Place profiles (/location/:id) stay the old
// page in the frame.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MousePointer2, UserPlus, MapPin, Spline, Image as ImageIcon, Grid, ZoomIn, ZoomOut, Maximize, RotateCcw,
  Eye, EyeOff, Users, Lock, Unlock, Plus, Trash2, Pencil, ChevronUp, ChevronDown, ExternalLink, List as ListIcon,
  Globe, Map as MapIcon, X,
} from "lucide-react";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { TextField } from "@/house/kit/Field";
import { Segmented, SliderRow } from "@/house/kit/Choices";
import { NestedPicker, ColourField } from "@/house/kit/Pickers";
import { AlterChip, AlterAvatar } from "@/house/kit/Content";
import { Sheet } from "@/house/kit/Sheet";
import Menu from "@/house/kit/Menu";
import { useRoomTools } from "@/house/frame/roomTools";
import { PixelBack } from "@/house/tokens/PixelGlyphs";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getAccessibilitySettings } from "@/lib/useAccessibility";
import InnerWorldMap from "@/components/systemmap/InnerWorldMapV2";
import InnerWorldListView from "@/components/systemmap/InnerWorldListView";
import RelationshipsPanel from "@/components/systemmap/RelationshipsPanel";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import RichText from "@/components/shared/RichText";
import AnalyticsMap from "@/components/system/SystemMap";
import { useSystemMapData, AnalyticsMapErrorBoundary, AnalyticsMapTooLargeFallback } from "@/pages/SystemMap";
import {
  mapViewOf, mapViewHref, mapLanding, statusWords, canvasLine, relModeWords, viewingWords, mapKeyAction,
  overviewGeometry, relationshipWords, plural, zoomWords,
} from "@/house/map/mapModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/map/map.css";

export default function HouseMap({ size = "full", tokens }) {
  const phone = size === "phone";
  const navigate = useNavigate();
  const location = useLocation();
  const terms = useTerms();
  const data = useSystemMapData();
  const view = mapViewOf(location.search, { a11y: getAccessibilitySettings().a11yMode });
  // The landing (?map, ?layer, ?solo) is read once when the canvas mounts.
  const [landing] = useState(() => mapLanding(location.search));
  const [relsOpen, setRelsOpen] = useState(false);
  const goView = useCallback((v) => { if (v !== view) navigate(mapViewHref(v)); }, [view, navigate]);

  // Stable, so the phone's ⋯ (published to the frame) doesn't change every render.
  const openRels = useCallback(() => setRelsOpen(true), []);
  const ctx = { phone, size, terms, data, view, goView, navigate, openRels };

  const relSheet = (
    <Sheet open={relsOpen} onClose={() => setRelsOpen(false)} title="Relationships" size={phone ? "full" : "half"} side={phone ? "bottom" : "right"}>
      <div className="hmp-old">
        <RelationshipsPanel relationships={data.relationships} alters={data.alters} locations={data.locations} onRefreshRelationships={data.refetchRelationships} />
      </div>
    </Sheet>
  );

  if (view === "inner") {
    return (
      <HouseScope tokens={tokens} className={`hmp hmp--${phone ? "phone" : "studio"}`} data-house-size={size} data-map-room="">
        <InnerWorldMap
          alters={data.alters}
          relationships={data.relationships}
          onRefreshRelationships={data.refetchRelationships}
          initialMapId={landing.mapId}
          initialLayerId={landing.layerId}
          initialSolo={landing.solo}
          initialView="fit"
          houseSize={size}
          renderHouse={(api) => (phone ? <MapPhone api={api} ctx={ctx} /> : <MapStudio api={api} ctx={ctx} />)}
        />
        {relSheet}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className={`hmp hmp--page hmp--${phone ? "phone" : "studio"}`} data-house-size={size} data-map-room="">
      {phone ? <ViewTools ctx={ctx} /> : null}
      <div className="hmp-pagehead">
        {phone ? <PhoneTabs ctx={ctx} maps={data.maps} /> : <ViewSwitch ctx={ctx} />}
      </div>
      {view === "together" ? <TogetherView ctx={ctx} /> : <ListPage ctx={ctx} />}
      {relSheet}
    </HouseScope>
  );
}

// ── The three views as one radio row (studio) ───────────────────────────
function ViewSwitch({ ctx }) {
  return (
    <div className="hmp-views" data-tour="system-map-views">
      <Segmented label="Map view" value={ctx.view} onChange={ctx.goView} options={[
        { value: "inner", label: "Inner world", icon: Globe },
        { value: "together", label: `Who ${ctx.terms.fronts || "fronts"} together`, icon: MapIcon },
        { value: "list", label: "List", icon: ListIcon },
      ]} />
    </div>
  );
}

// ── Phone: board 11's tabs (the maps, then Who fronts together) ─────────
function PhoneTabs({ ctx, maps = [], activeMapId, onMap }) {
  const together = "__together__";
  const list = "__list__";
  const tabs = [
    ...maps.map((m) => ({ id: m.id, label: m.name || "Map" })),
    { id: together, label: `Who ${ctx.terms.fronts || "fronts"} together` },
    { id: list, label: "List" },
  ];
  const value = ctx.view === "together" ? together : ctx.view === "list" ? list : (activeMapId || maps[0]?.id || together);
  return (
    <div className="hmp-tabs" data-tour="system-map-views">
      <PageTabs label="Maps" idPrefix="hmp-maps" value={value} tabs={tabs}
        onChange={(id) => {
          if (id === together) { ctx.goView("together"); return; }
          if (id === list) { ctx.goView("list"); return; }
          if (ctx.view !== "inner") { ctx.navigate(`/system-map?view=inner&map=${encodeURIComponent(id)}`); return; }
          onMap?.(id);
        }} />
    </div>
  );
}

// The phone's ⋯ on the two non-canvas views.
function ViewTools({ ctx }) {
  const tools = useMemo(() => ({
    items: [
      { id: "inner", label: "Inner world map", icon: Globe, onSelect: () => ctx.goView("inner") },
      { id: "list", label: "List every place", icon: ListIcon, onSelect: () => ctx.goView("list") },
      { id: "rels", label: "Relationships", icon: Spline, onSelect: ctx.openRels },
    ],
  }), [ctx.goView, ctx.openRels]); // eslint-disable-line react-hooks/exhaustive-deps -- ctx itself is new each render
  useRoomTools(tools);
  return null;
}

// ── Who fronts together (the old analytics map) ─────────────────────────
function TogetherView({ ctx }) {
  const { terms, data } = ctx;
  return (
    <div className="hmp-pagebody">
      <Panel title={`Who ${terms.fronts || "fronts"} together`} className="hmp-together" bodyClassName="hmp-together-body"
        tools={<span className="hmp-aside">{`sized by ${terms.fronting} time`}</span>}>
        <p className="hmp-lead">{`Every ${terms.alter} sized by ${terms.fronting} time. Pick one to move the others by how much ${terms.cofronting || `co-${terms.fronting}`} time they shared: closer means more.`}</p>
        <div className="hmp-old hmp-analytics">
          <AnalyticsMapErrorBoundary fallback={
            <AnalyticsMapTooLargeFallback systemTerm={terms.system} altersTerm={terms.alters} alterCount={data.alters.length} onUseInnerWorld={() => ctx.goView("inner")} />
          }>
            <AnalyticsMap relationships={data.relationships} />
          </AnalyticsMapErrorBoundary>
        </div>
      </Panel>
      <Panel title="Relationships" className="hmp-rels">
        <div className="hmp-old">
          <RelationshipsPanel relationships={data.relationships} alters={data.alters} locations={data.locations} onRefreshRelationships={data.refetchRelationships} />
        </div>
      </Panel>
    </div>
  );
}

// ── The text list of every place ────────────────────────────────────────
function ListPage({ ctx }) {
  const { data } = ctx;
  return (
    <div className="hmp-pagebody">
      <Panel title="Every place" tools={<span className="hmp-aside">a screen-reader-friendly index</span>}>
        <div className="hmp-old"><InnerWorldListView maps={data.maps} layers={data.layers} locations={data.locations} alters={data.alters} /></div>
      </Panel>
    </div>
  );
}

// ═══ The studio (board 02) ══════════════════════════════════════════════
function MapStudio({ api, ctx }) {
  const { terms } = ctx;
  const apiRef = useRef(api);
  apiRef.current = api;
  const [cursor, setCursor] = useState(null);
  const raf = useRef(0);
  const onMove = (e) => {
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setCursor(apiRef.current.toWorld(clientX, clientY)));
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Board 02's keys: V move, P place, L a place, R link, B picture, G snap,
  // + − zoom, 0 reset, F fit, Esc cancel.
  useEffect(() => {
    const on = (e) => {
      const act = mapKeyAction(e);
      if (!act) return;
      const a = apiRef.current;
      const edit = !a.viewOnly;
      const run = {
        move: a.move, place: edit ? a.place : null, addPlace: edit ? a.addPlace : null, link: edit ? a.link : null,
        addPicture: edit ? a.addPicture : null, snap: edit ? a.toggleSnap : null,
        zoomIn: () => a.zoom("in"), zoomOut: () => a.zoom("out"), reset: a.resetView, fit: a.fit,
        cancel: () => { a.cancelPlace(); a.cancelLink(); },
      }[act];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const st = statusWords({
    mapName: api.activeMap?.name, layerName: api.layerName, cursor, placed: api.placedCount, total: api.alterCount,
    rels: api.relCount, viewOnly: api.viewOnly, scale: api.transform.scale, snap: api.snap, snapPx: api.snapPx,
  });

  return (
    <div className="hmp-studio" data-house-size={ctx.size}>
      <ToolColumn api={api} />
      <div className="hmp-center">
        <div className="hmp-mapsrow">
          <span className="hmp-mapslabel">Maps</span>
          <div className="hmp-mapstabs" data-tour="system-map-maps">
            <PageTabs label="Maps" idPrefix="hmp-maps" value={api.activeMapId} onChange={api.selectMap}
              tabs={api.maps.map((m) => ({ id: m.id, label: m.name || "Map" }))} />
          </div>
          {!api.viewOnly ? <IconButton icon={Plus} label="New map" rank="secondary" onClick={api.newMap} /> : null}
          {!api.viewOnly && api.activeMap ? (
            <Menu label={`More for ${api.activeMap.name || "this map"}`} items={[
              { id: "rename", label: "Rename this map", icon: Pencil, onSelect: api.renameMap },
              ...(api.deleteMap ? [{ id: "delete", label: "Delete this map", icon: Trash2, danger: true, onSelect: api.deleteMap }] : []),
            ]} />
          ) : null}
          <span className="hmp-grow" />
          <ViewSwitch ctx={ctx} />
        </div>
        <CanvasLine api={api} terms={terms} />
        <div className="hmp-stage" data-tour="system-map-canvas" onMouseMove={onMove} onMouseLeave={() => setCursor(null)}>
          {api.canvas}
          <Overview api={api} />
        </div>
      </div>
      <div className="hmp-right">
        <LayersPanel api={api} ctx={ctx} />
        <InfoPanel api={api} ctx={ctx} />
      </div>
      <div className="hmp-status" aria-live="off">
        {st.left.map((w) => <span key={w}>{w}</span>)}
        <span className="hmp-grow" />
        {st.right.map((w) => <span key={w}>{w}</span>)}
      </div>
      {api.modals}
    </div>
  );
}

// Board 02's tool column: the editing tools, then the view tools, and the
// eye (viewing only) at the foot.
function ToolColumn({ api }) {
  const edit = !api.viewOnly;
  const tool = (label, key, icon, onClick, pressed = false) => (
    <IconButton key={label} icon={icon} label={key ? `${label} (${key})` : label} rank={pressed ? "primary" : "secondary"}
      aria-pressed={pressed} onClick={onClick} className="hmp-tool" />
  );
  return (
    <div className="hmp-tools" role="toolbar" aria-label="Map tools" aria-orientation="vertical" data-tour="system-map-tools">
      {tool("Move and select", "V", MousePointer2, api.move, api.tool === "move")}
      {edit ? tool("Place someone", "P", UserPlus, api.place, api.tool === "place") : null}
      {edit ? tool("Add a place", "L", MapPin, api.addPlace) : null}
      {edit ? tool("Link two people", "R", Spline, api.link, api.tool === "link") : null}
      {edit ? tool("Add a backdrop picture", "B", ImageIcon, api.addPicture) : null}
      {edit ? tool(api.snap ? "Snap to grid: on" : "Snap to grid: off", "G", Grid, api.toggleSnap, api.snap) : null}
      <span className="hmp-tools-gap" aria-hidden="true" />
      {tool("Zoom in", "+", ZoomIn, () => api.zoom("in"))}
      {tool("Zoom out", "-", ZoomOut, () => api.zoom("out"))}
      {tool("Fit everything on screen", "F", Maximize, api.fit)}
      {tool("Reset the view", "0", RotateCcw, api.resetView)}
      <span className="hmp-grow" />
      {tool(api.viewOnly ? "Viewing only: switch to editing" : "Switch to viewing only", "", Eye, api.toggleViewOnly, api.viewOnly)}
    </div>
  );
}

// The line over the canvas (board 02's "Backdrop: house plan.png (locked)"),
// which also says what an armed tool is waiting for. Never floats.
function CanvasLine({ api, terms }) {
  const formatAlter = useAlterLabel();
  const imgs = api.activeLayerId ? api.imagesOnLayer(api.activeLayerId) : [];
  const line = canvasLine({
    tool: api.tool, placingName: api.placingAlter ? formatAlter(api.placingAlter) : null,
    linkFromName: api.relModeAlter ? formatAlter(api.relModeAlter) : null,
    layerName: api.layerName, soloName: api.soloLayer?.name || null,
    backdropCount: imgs.length, backdropLocked: imgs.length > 0 && imgs.every((im) => im.is_locked) || !!api.activeLayer?.is_locked,
    terms,
  });
  return (
    <div className="hmp-line" data-kind={line?.kind || "none"} aria-live="polite">
      <span className="hmp-line-text">{line?.text || ""}</span>
      {api.tool === "place" && api.placingAlter ? <Button rank="quiet" onClick={api.cancelPlace}>Cancel</Button> : null}
      {api.tool === "link" ? <Button rank="quiet" onClick={api.cancelLink}>Cancel</Button> : null}
      {line?.kind === "solo" ? <Button rank="quiet" onClick={api.clearSolo}>Show every layer</Button> : null}
    </div>
  );
}

// Board 02's Overview box: the whole map small, with the frame of what's on
// screen; a click moves the view there. It only shows and moves the view.
function Overview({ api }) {
  const g = overviewGeometry({
    locations: api.locations, images: api.images, placements: api.placements, shownLayerIds: api.visibleLayerIds,
    colourOf: (id) => (api.alterMap[id] ? (api.alterMap[id].color || null) : undefined),
    transform: api.transform, canvas: api.canvasSize(),
  });
  const onClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = g.toWorld(e.clientX - r.left, e.clientY - r.top);
    api.centerOn(w.x, w.y);
  };
  return (
    <div className="hmp-ov" data-iw-panel="" onMouseDown={(e) => e.stopPropagation()}>
      <div className="hmp-ov-ttl"><span>Overview</span><span>{zoomWords(api.transform.scale).replace("Zoom ", "")}</span></div>
      <svg width={g.W} height={g.H} onClick={onClick} role="img" aria-label="Overview of the whole map; click to move the view there" shapeRendering="crispEdges" className="hmp-ov-svg">
        {g.boxes.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.c || "var(--house-title)"} fillOpacity={0.6} />)}
        {g.dots.map((d, i) => <rect key={`d${i}`} x={d.x - 1.5} y={d.y - 1.5} width={3} height={3} fill={d.c} />)}
        <rect x={g.view.x} y={g.view.y} width={g.view.w} height={g.view.h} fill="none" stroke="var(--house-accent)" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ── Layers (board 02's right column, top) ────────────────────────────────
function LayersPanel({ api, ctx, onDone }) {
  const edit = !api.viewOnly;
  return (
    <Panel title="Layers" className="hmp-layers" bodyClassName="hmp-layers-body"
      tools={edit ? <Button rank="quiet" icon={Plus} onClick={api.newLayer}>layer</Button> : (onDone ? null : undefined)}>
      <div data-tour="system-map-layers" className="hmp-layerlist">
        {api.layersTopFirst.length === 0 ? <p className="hmp-hint">No layers yet. Add one to start placing things.</p> : null}
        {api.layersTopFirst.map((layer, i) => {
          const n = api.placesOn(layer.id);
          const sel = layer.id === api.activeLayerId;
          return (
            <div key={layer.id} className="hmp-layer" data-selected={sel || undefined} data-off={!layer.is_visible || undefined}>
              <IconButton icon={layer.is_visible ? Eye : EyeOff} label={layer.is_visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                onClick={() => api.setLayerVisible(layer, !layer.is_visible)} className="hmp-mini" />
              <Button rank="quiet" className="hmp-layer-name" aria-pressed={sel} onClick={() => api.selectLayer(layer.id)}>
                <span className="hmp-layer-words">{layer.name || "Layer"}</span>
                <span className="hmp-layer-n">{plural(n, "place")}</span>
              </Button>
              {edit ? (
                <IconButton icon={layer.is_locked ? Lock : Unlock} label={layer.is_locked ? `Unlock ${layer.name}` : `Lock ${layer.name} (view only)`}
                  aria-pressed={!!layer.is_locked} onClick={() => api.setLayerLocked(layer, !layer.is_locked)} className="hmp-mini" />
              ) : layer.is_locked ? <span className="hmp-layer-lock" title="Locked"><Lock aria-label="Locked" /></span> : null}
              {edit ? (
                <Menu label={`More for ${layer.name || "this layer"}`} items={[
                  { id: "up", label: "Move up", icon: ChevronUp, onSelect: () => api.moveLayer(layer, "up"), disabledReason: i === 0 ? "Already the top layer" : undefined },
                  { id: "down", label: "Move down", icon: ChevronDown, onSelect: () => api.moveLayer(layer, "down"), disabledReason: i === api.layersTopFirst.length - 1 ? "Already the bottom layer" : undefined },
                  { id: "rename", label: "Rename", icon: Pencil, onSelect: () => api.renameLayer(layer) },
                  ...(api.deleteLayer ? [{ id: "delete", label: "Delete this layer", icon: Trash2, danger: true, onSelect: () => api.deleteLayer(layer) }] : []),
                ]} />
              ) : null}
            </div>
          );
        })}
        <div className="hmp-layer hmp-layer--sub" data-off={api.relMode === "none" || undefined}>
          <IconButton icon={api.relMode === "all" ? Eye : api.relMode === "selected" ? Users : EyeOff}
            label={`Relationship lines: ${relModeWords(api.relMode)}. Change what shows`} onClick={api.cycleRelMode} className="hmp-mini" />
          <span className="hmp-layer-tree" aria-hidden="true">└</span>
          <span className="hmp-layer-words">{`Relationship lines${api.relMode === "selected" ? " (picked)" : ""}`}</span>
          <span className="hmp-layer-n">{api.relCount}</span>
          <Menu label="More for relationship lines" items={[
            { id: "list", label: "List every relationship", icon: ListIcon, onSelect: ctx.openRels },
          ]} />
        </div>
        <div className="hmp-layer hmp-layer--sub">
          <span className="hmp-mini-gap" aria-hidden="true" />
          <span className="hmp-layer-tree" aria-hidden="true">└</span>
          <span className="hmp-layer-words">{api.images.length === 1 ? "Backdrop picture" : "Backdrop pictures"}</span>
          <span className="hmp-layer-n">{api.images.length}</span>
        </div>
      </div>
      {onDone ? <div className="hmp-actions"><Button block onClick={onDone}>Done</Button></div> : null}
    </Panel>
  );
}

// ── Info (board 02's right column, under Layers) ─────────────────────────
function InfoPanel({ api, ctx, phone = false, onClose }) {
  const formatAlter = useAlterLabel();
  const { terms, navigate } = ctx;
  const close = onClose ? <IconButton icon={X} label="Close" onClick={onClose} className="hmp-mini" /> : null;

  if (api.editingImage) {
    const im = api.editingImage;
    return (
      <Panel title="Info: backdrop picture" className="hmp-info" bodyClassName="hmp-info-body" tools={close}>
        <div className="hmp-form" data-tour="system-map-info">
          <div className="hmp-btns">
            <Button aria-pressed={!!im.is_locked} rank={im.is_locked ? "primary" : "secondary"} icon={im.is_locked ? Lock : Unlock}
              onClick={() => api.setImageFields({ is_locked: !im.is_locked })}>{im.is_locked ? "Locked" : "Lock"}</Button>
            <Button icon={ImageIcon} onClick={api.replaceImage}>Replace</Button>
          </div>
          <SliderRow label="Opacity" value={Math.round((im.opacity ?? 1) * 100)} min={10} max={100} step={5} unit="%"
            onChange={(v) => api.setImageFields({ opacity: Math.max(0.1, Math.min(1, Number(v) / 100)) })} />
          <SliderRow label="Turn" value={Math.round(im.rotation ?? 0)} min={0} max={360} step={1} unit="°"
            onChange={(v) => api.setImageFields({ rotation: Math.round(Number(v)) || 0 })} />
          <div className="hmp-btns">
            <Button onClick={() => api.setImageFields({ order: (im.order || 0) + 1 })}>↑ Forward</Button>
            <Button onClick={() => api.setImageFields({ order: Math.max(0, (im.order || 0) - 1) })}>↓ Back</Button>
            <Button rank="danger" icon={Trash2} onClick={api.removeImage}>Remove</Button>
          </div>
          <p className="hmp-hint">Drag the picture to move it; drag its corner to resize.</p>
          {!onClose ? <Button rank="quiet" onClick={api.closeImage}>Done</Button> : null}
        </div>
      </Panel>
    );
  }

  if (api.selectedLocation) return <PlaceInfo api={api} ctx={ctx} phone={phone} close={close} />;

  if (api.selectedRel) {
    const rel = api.selectedRel;
    const nameOf = (id) => (api.alterMap[id] ? formatAlter(api.alterMap[id]) : "?");
    return (
      <Panel title="Info: relationship" className="hmp-info" bodyClassName="hmp-info-body"
        tools={close || <IconButton icon={X} label="Close" onClick={api.closeRel} className="hmp-mini" />}>
        <div className="hmp-form" data-tour="system-map-info">
          <p className="hmp-big">{relationshipWords(rel, nameOf)}</p>
          {rel.notes ? <div className="hmp-notes"><RichText content={rel.notes} /></div> : null}
          {!api.viewOnly ? <div className="hmp-btns"><Button onClick={() => api.editRel(rel)}>Edit relationship</Button></div> : null}
        </div>
      </Panel>
    );
  }

  if (api.selectedAlter) {
    const a = api.selectedAlter;
    const pl = api.placementOf(a);
    const rels = api.relationshipsOf(a);
    const nameOf = (id) => (api.alterMap[id] ? formatAlter(api.alterMap[id]) : "?");
    return (
      <Panel title={`Info: ${formatAlter(a)}`} className="hmp-info" bodyClassName="hmp-info-body"
        tools={close || <IconButton icon={X} label="Close" onClick={api.closeAlter} className="hmp-mini" />}>
        <div className="hmp-form" data-tour="system-map-info">
          <div className="hmp-who">
            <AlterAvatar alter={a} size="md" />
            <div className="hmp-who-words"><span className="hmp-big">{formatAlter(a)}</span>{a.pronouns ? <span className="hmp-hint">{a.pronouns}</span> : null}</div>
          </div>
          <div className="hmp-btns">
            <Button rank="primary" onClick={() => navigate(`/alter/${a.id}`)}>Open profile</Button>
            {!api.viewOnly ? <Button icon={Spline} onClick={() => api.startLinkFrom(a)}>Link to someone</Button> : null}
            {!api.viewOnly && pl && !api.layerById[pl.layer_id]?.is_locked ? <Button rank="danger" onClick={() => api.takeOffMap(pl)}>Take off the map</Button> : null}
          </div>
          <p className="hmp-sub">Relationships</p>
          {rels.length === 0 ? <p className="hmp-hint">None yet.</p> : (
            <ul className="hmp-rellist">
              {rels.map((r) => <li key={r.id}><span className="hmp-reldot" style={{ background: r.color || "var(--house-muted)" }} />{relationshipWords(r, nameOf)}</li>)}
            </ul>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={api.viewOnly ? "Info" : "Place someone"} className="hmp-info" bodyClassName="hmp-info-body" tools={close}>
      <div className="hmp-form" data-tour="system-map-info">
        {api.viewOnly ? <p className="hmp-hint">{`Tap a place or ${terms.alter} on the map to see them here.`}</p> : <PlaceList api={api} terms={terms} phone={phone} />}
      </div>
    </Panel>
  );
}

// "Place someone": pick who, then tap the map. Those already on this layer
// are dimmed (the shared tree keeps subsystems and groups reachable).
function PlaceList({ api, terms, phone, onPicked }) {
  const formatAlter = useAlterLabel();
  return (
    <>
      <p className="hmp-hint">{api.placingAlter
        ? `Now tap the map where ${formatAlter(api.placingAlter)} goes.`
        : `Pick ${an(terms.alter)}, then tap the map. Those already on ${api.layerName || "this layer"} are dimmed.`}</p>
      <div className="hmp-old hmp-tree">
        <AlterTreeSelect selectionMode="single" disabledIds={api.alterIdsOnActiveLayer} isSelected={(id) => api.placingAlter?.id === id}
          onToggle={(a) => { api.pickToPlace(a); onPicked?.(); }} maxHeight={phone ? "40vh" : "100%"} />
      </div>
    </>
  );
}

// The size boxes: free typing, written once the number is a real size.
function SizeBox({ label, value, onCommit, min = 40 }) {
  const [text, setText] = useState(String(value));
  const [typing, setTyping] = useState(false);
  useEffect(() => { if (!typing) setText(String(value)); }, [value, typing]);
  return (
    <span className="hmp-size" onFocus={() => setTyping(true)}
      onBlur={() => { setTyping(false); const n = parseInt(text, 10); const v = Number.isFinite(n) ? Math.max(min, n) : value; setText(String(v)); if (v !== value) onCommit(v); }}>
      <TextField label={label} value={text} inputMode="numeric"
        onChange={(v) => { setText(v); const n = parseInt(v, 10); if (Number.isFinite(n) && n >= min) onCommit(n); }} />
    </span>
  );
}

function PlaceInfo({ api, ctx, phone, close }) {
  const { navigate } = ctx;
  const loc = api.selectedLocation;
  const ed = api.editingLocation;
  const [placeOpen, setPlaceOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { setPlaceOpen(false); setLinkOpen(false); }, [loc.id]);
  const who = api.whoIsHere(loc);
  const layer = api.layerById[loc.layer_id];
  const linkName = api.linkName(loc);

  const chips = (
    <div className="hmp-chips">
      {who.map((a) => <AlterChip key={a.id} alter={a} onClick={() => navigate(`/alter/${a.id}`)} />)}
      {api.canEditLocation ? (
        <Button rank="quiet" className="hmp-addchip" aria-expanded={placeOpen} onClick={() => setPlaceOpen((v) => !v)}>
          {phone ? "+ place someone" : "+ place"}
        </Button>
      ) : null}
      {!who.length && !api.canEditLocation ? <span className="hmp-hint">Nobody here yet.</span> : null}
    </div>
  );
  const picker = placeOpen && api.canEditLocation ? (
    <div className="hmp-old hmp-tree">
      <AlterTreeSelect selectionMode="single" disabledIds={who.map((a) => a.id)} isSelected={() => false}
        onToggle={(a) => { api.placeInto(loc, a); setPlaceOpen(false); }} maxHeight="30vh" />
    </div>
  ) : null;
  const notes = (
    <div className="hmp-notes">{loc.description ? <RichText content={loc.description} /> : <span className="hmp-hint">No notes yet. Write them on the place&apos;s profile.</span>}</div>
  );

  // Phone, not editing: board 11's panel (swatch, name, layer; notes; who's
  // here; Open profile · Edit room).
  if (phone && !ed) {
    return (
      <section className="hmp-place" aria-label={`Place: ${loc.name || "Place"}`} data-tour="system-map-info">
        <div className="hmp-place-head">
          <span className="hmp-swatch" style={{ background: loc.color || "#6366f1" }} aria-hidden="true" />
          <h2 className="hmp-place-name">{loc.name || "Place"}</h2>
          <span className="hmp-aside">{layer?.name || ""}</span>
          {close}
        </div>
        {loc.description ? <div className="hmp-place-notes"><RichText content={loc.description} /></div> : null}
        <p className="hmp-sub">Who&apos;s here</p>
        {chips}
        {picker}
        {linkName ? <Button block icon={ExternalLink} onClick={() => api.jumpToLink(loc)}>{`Go to ${linkName}`}</Button> : null}
        <div className="hmp-two">
          <Button rank="primary" block onClick={() => navigate(`/location/${loc.id}`)}>Open profile</Button>
          {api.canEditLocation || (!api.viewOnly && !layer?.is_locked)
            ? <Button block onClick={() => api.openLocationEditor(loc)}>Edit room</Button>
            : null}
        </div>
      </section>
    );
  }

  return (
    <Panel title={`Info: ${loc.name || "Place"}`} className="hmp-info" bodyClassName="hmp-info-body"
      tools={<>
        <Button rank="quiet" onClick={() => navigate(`/location/${loc.id}`)}>Open profile</Button>
        {close}
      </>}>
      <div className="hmp-form" data-tour="system-map-info">
        <div className="hmp-row"><span className="hmp-key">Name</span>
          {ed ? <span className="hmp-val hmp-val--field"><TextField label="Name" value={ed.name || ""} onChange={(v) => api.setLocationFields({ name: v })} placeholder="Place name" /></span>
            : <span className="hmp-val">{loc.name}</span>}
        </div>
        <div className="hmp-row"><span className="hmp-key">Layer</span><span className="hmp-val hmp-val--box">{layer?.name || "None"}</span></div>
        {ed ? (
          <div className="hmp-row"><span className="hmp-key">Size</span>
            <span className="hmp-val hmp-sizes">
              <SizeBox label="Width" value={Math.round(ed.width || 200)} onCommit={(v) => api.setLocationFields({ width: v })} />
              <span className="hmp-x" aria-hidden="true">x</span>
              <SizeBox label="Height" value={Math.round(ed.height || 150)} onCommit={(v) => api.setLocationFields({ height: v })} />
            </span>
          </div>
        ) : null}
        {ed ? (
          <div className="hmp-colour"><ColourField label="Colour" value={ed.color || "#6366f1"} onChange={(hex) => api.setLocationFields({ color: hex })} /></div>
        ) : (
          <div className="hmp-row"><span className="hmp-key">Colour</span><span className="hmp-swatch" style={{ background: loc.color || "#6366f1" }} aria-hidden="true" /></div>
        )}
        <p className="hmp-sub">Who&apos;s here</p>
        {chips}
        {picker}
        <p className="hmp-sub">Notes</p>
        {notes}
        {linkName ? <Button icon={ExternalLink} onClick={() => api.jumpToLink(loc)}>{`Go to ${linkName}`}</Button> : null}
        {ed ? (
          <>
            <div className="hmp-btns">
              <Button aria-expanded={linkOpen} onClick={() => setLinkOpen((v) => !v)}>Link to a map</Button>
              <Button aria-pressed={!!ed.is_locked} rank={ed.is_locked ? "primary" : "secondary"} icon={ed.is_locked ? Lock : undefined}
                onClick={() => api.setLocationFields({ is_locked: !ed.is_locked })}>{ed.is_locked ? "Locked" : "Lock"}</Button>
              <Button rank="quiet" aria-expanded={more} onClick={() => setMore((v) => !v)}>{more ? "Less" : "More"}</Button>
            </div>
            {linkOpen ? (
              <NestedPicker label="Tapping its ↗ on the map goes to" value={api.linkValue || ""} options={api.linkOptions}
                placeholder="Nothing (no link)" searchPlaceholder="Search maps and layers…" onChange={api.setLocationLink} />
            ) : null}
            {more ? (
              <div className="hmp-more">
                <div className="hmp-btns">
                  <Button onClick={() => api.setLocationFields({ shape: ed.shape === "oval" ? "rectangle" : "oval" })}>{`Shape: ${ed.shape === "oval" ? "oval" : "box"}`}</Button>
                  <Button icon={ImageIcon} onClick={api.pickLocationPicture}>{ed.background_image_url ? "Change picture" : "Picture"}</Button>
                </div>
                <SliderRow label="Opacity" value={Math.round((ed.opacity ?? 1) * 100)} min={10} max={100} step={5} unit="%"
                  onChange={(v) => api.setLocationFields({ opacity: Math.max(0.1, Math.min(1, Number(v) / 100)) })} />
                <SliderRow label="Turn" value={ed.rotation ?? 0} min={0} max={360} step={1} unit="°"
                  onChange={(v) => api.setLocationFields({ rotation: Math.round(Number(v)) || 0 })} />
                <div className="hmp-btns">
                  <Button onClick={() => api.setLocationFields({ order: (ed.order || 0) + 1 })}>↑ Forward</Button>
                  <Button onClick={() => api.setLocationFields({ order: Math.max(0, (ed.order || 0) - 1) })}>↓ Back</Button>
                  <Button rank="danger" icon={Trash2} onClick={api.deleteLocation}>Delete</Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          api.viewOnly ? null : <p className="hmp-hint">{layer?.is_locked ? `${layer.name} is locked. Unlock it in Layers to change this place.` : `Tap the place's name on the map to change it.`}</p>
        )}
        {phone && ed ? <Button rank="quiet" icon={PixelBack} onClick={api.closeLocation}>Done</Button> : null}
      </div>
    </Panel>
  );
}

// ═══ The phone (board 11) ═══════════════════════════════════════════════
function MapPhone({ api, ctx }) {
  const formatAlter = useAlterLabel();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [panel, setPanel] = useState(null); // "layers" | "place" | null
  const a = () => apiRef.current;

  // Room tools: board 11's Move · Place · Room · Link · Layers, docked in the
  // frame's bottom zone (nothing floats over the page); the rest in ⋯.
  const tool = api.tool;
  const viewOnly = api.viewOnly;
  const tools = useMemo(() => ({
    bar: (
      <div className="hmp-bar" role="toolbar" aria-label="Map tools" data-tour="system-map-tools">
        <Button rank={tool === "move" && panel !== "layers" ? "primary" : "secondary"} aria-pressed={tool === "move"} onClick={() => { a().move(); setPanel(null); }}>Move</Button>
        {!viewOnly ? <Button rank={tool === "place" || panel === "place" ? "primary" : "secondary"} aria-pressed={tool === "place" || panel === "place"} onClick={() => { a().place(); setPanel("place"); }}>Place</Button> : null}
        {!viewOnly ? <Button onClick={() => { setPanel(null); a().addPlace(); }}>Room</Button> : null}
        {!viewOnly ? <Button rank={tool === "link" ? "primary" : "secondary"} aria-pressed={tool === "link"} onClick={() => { setPanel(null); a().link(); }}>Link</Button> : null}
        <Button rank={panel === "layers" ? "primary" : "secondary"} aria-pressed={panel === "layers"} onClick={() => setPanel((p) => (p === "layers" ? null : "layers"))}>Layers</Button>
      </div>
    ),
    items: [
      ...(!viewOnly ? [
        { id: "new-map", label: "New map", icon: Plus, onSelect: () => a().newMap() },
        { id: "rename-map", label: "Rename this map", icon: Pencil, onSelect: () => a().renameMap() },
        { id: "picture", label: "Add a backdrop picture", icon: ImageIcon, onSelect: () => a().addPicture() },
        { id: "snap", label: "Snap to grid", icon: Grid, onSelect: () => a().toggleSnap() },
      ] : []),
      { id: "view-only", label: viewOnly ? "Switch to editing" : "Switch to viewing only", icon: Eye, onSelect: () => a().toggleViewOnly() },
      { id: "reset", label: "Reset the view", icon: RotateCcw, onSelect: () => a().resetView() },
      { id: "rels", label: "Relationships", icon: Spline, onSelect: ctx.openRels },
      ...(!viewOnly && a().deleteMap ? [{ id: "delete-map", label: "Delete this map", icon: Trash2, danger: true, onSelect: () => a().deleteMap() }] : []),
    ],
  }), [tool, viewOnly, panel, api.maps.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(tools);

  // Picking who to place closes the list so the map can be tapped.
  useEffect(() => { if (api.placingAlter && panel === "place") setPanel(null); }, [api.placingAlter]); // eslint-disable-line react-hooks/exhaustive-deps
  // Something picked on the map: its panel replaces Layers.
  const picked = api.selectedLocation?.id || api.selectedAlter?.id || api.selectedRel?.id || api.editingImage?.id || null;
  useEffect(() => { if (picked) setPanel(null); }, [picked]);

  const viewing = viewingWords({ layers: api.layersTopFirst, soloName: api.soloLayer?.name, viewOnly: api.viewOnly });
  const line = canvasLine({
    tool: api.tool, placingName: api.placingAlter ? formatAlter(api.placingAlter) : null, linkFromName: api.relModeAlter ? formatAlter(api.relModeAlter) : null,
    layerName: api.layerName, soloName: api.soloLayer?.name || null, terms: ctx.terms,
  });

  let bottom = null;
  if (panel === "layers") bottom = <LayersPanel api={api} ctx={ctx} onDone={() => setPanel(null)} />;
  else if (panel === "place" && !api.viewOnly) {
    bottom = (
      <Panel title="Place someone" className="hmp-info" bodyClassName="hmp-info-body"
        tools={<IconButton icon={X} label="Close" onClick={() => setPanel(null)} className="hmp-mini" />}>
        <div className="hmp-form"><PlaceList api={api} terms={ctx.terms} phone onPicked={() => setPanel(null)} /></div>
      </Panel>
    );
  } else if (picked) {
    const closeAll = () => { api.closeLocation(); api.closeAlter(); api.closeRel(); api.closeImage(); };
    bottom = <InfoPanel api={api} ctx={ctx} phone onClose={closeAll} />;
  }

  return (
    <div className="hmp-phonecol">
      <PhoneTabs ctx={ctx} maps={api.maps} activeMapId={api.activeMapId} onMap={api.selectMap} />
      {line ? (
        <div className="hmp-line" data-kind={line.kind} aria-live="polite">
          <span className="hmp-line-text">{line.text}</span>
          {api.tool === "place" && api.placingAlter ? <Button rank="quiet" onClick={api.cancelPlace}>Cancel</Button> : null}
          {api.tool === "link" ? <Button rank="quiet" onClick={api.cancelLink}>Cancel</Button> : null}
          {line.kind === "solo" ? <Button rank="quiet" onClick={api.clearSolo}>Show all</Button> : null}
        </div>
      ) : null}
      <div className="hmp-stage hmp-stage--phone" data-tour="system-map-canvas">
        {api.canvas}
        <div className="hmp-chip" data-iw-panel="">
          <Button rank="secondary" onClick={() => setPanel((p) => (p === "layers" ? null : "layers"))} aria-label={`${viewing.lead}: ${viewing.names}. Open layers`}>
            <span className="hmp-chip-lead">{viewing.lead}</span><span className="hmp-chip-sep" aria-hidden="true">|</span><span className="hmp-chip-names">{viewing.names}</span>
          </Button>
        </div>
        <div className="hmp-zoom" data-iw-panel="" role="group" aria-label="Zoom">
          <Button rank="secondary" aria-label="Zoom in" onClick={() => api.zoom("in")}>+</Button>
          <Button rank="secondary" aria-label="Zoom out" onClick={() => api.zoom("out")}>-</Button>
          <Button rank="secondary" aria-label="Fit everything on screen" onClick={api.fit}>Fit</Button>
        </div>
      </div>
      {bottom ? <div className="hmp-bottom">{bottom}</div> : null}
      {api.modals}
    </div>
  );
}
