// Full profile page for one inner-world location — recycles the SAME
// structure as the alter (/alter/:id) and group (/group/:id) profiles:
// PageBackground + os-pf theming, a styled ViewHeader banner, a rich BioEditor
// description, the shared ProfileStyleEditor (header/body colours, images,
// fonts, opacity), view/edit toolbar with undo/redo, and AlterCard rows for
// the members inside it. Profile styling is stored in location.custom_fields
// using the exact same keys the other profiles use, so the shared helpers and
// editor work unchanged.
//
// "Alters here"   — alters whose inner_world_location_id === this location.
// "Sub-locations" — locations on the SAME map whose box sits inside this one
//                   (the existing coordinate-overlap nesting; cycle-safe).
import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, Eye, Save, Loader2, X, MapPin, Map as MapIcon, Trash2,
  Lock, Unlock, Image as ImageIcon, CornerDownRight, ExternalLink, Upload, Undo2, Redo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { isValidHexColor } from "@/lib/colorUtils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { isLocalMode } from "@/lib/storageMode";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import BioEditor from "@/components/alters/BioEditor";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ProfileStyleEditor from "@/components/shared/ProfileStyleEditor";
import { SubSection } from "@/components/settings/SettingsUI";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import SearchableSelect from "@/components/shared/SearchableSelect";
import AlterCard from "@/components/alters/AlterCard";
import { groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, profileSurfaceCss, profileThemeCss, headerThemeStyleVars } from "@/lib/profileStyle";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import { useUndoRedo } from "@/hooks/useUndoRedo";

const HEADER_IMAGE_KEY = "_header_image";
const HEADER_BG_KEY = "_header_bg_color";
const HEADER_FONT_KEY = "_header_font";
const HIDE_HEADER_KEY = "_hide_header";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";
const HEADER_TEXT_KEY = "_header_text_color";

function getContrastColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a2e" : "#ffffff";
}

// Same full-screen themed background the alter/group profiles use.
function PageBackground({ bgColor, bgImage, bgOpacity }) {
  const [resolvedBg, setResolvedBg] = useState(null);
  useEffect(() => {
    if (bgImage) resolveImageUrl(bgImage).then(setResolvedBg).catch(() => setResolvedBg(null));
    else setResolvedBg(null);
  }, [bgImage]);
  if (!bgColor && !bgImage) return null;
  const hasImage = !!(bgImage && resolvedBg);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {hasImage ? (
        <>
          {bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor }} />}
          <div className="absolute inset-0" style={{ backgroundImage: `url("${resolvedBg}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOpacity }} />
        </>
      ) : (
        bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor, opacity: bgOpacity }} />
      )}
    </div>
  );
}

// Location "avatar" — the colour swatch with a map-pin, or its on-map
// background image. Mirrors GroupAvatar's role in the header.
function LocationAvatar({ color, image }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => { if (image) resolveImageUrl(image).then(setResolved).catch(() => setResolved(null)); else setResolved(null); }, [image]);
  const textColor = isValidHexColor(color) ? getContrastColor(color) : "#ffffff";
  return (
    <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ backgroundColor: isValidHexColor(color) ? color : "hsl(var(--muted))" }}>
      {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : <MapPin className="w-9 h-9" style={{ color: textColor }} />}
    </div>
  );
}

// The banner — recycled from the group ViewHeader (header image / bg colour /
// font / text colour), with location meta (scope, parent, counts).
function LocationHeader({ location, color, headerImage, headerTextColor, headerBgColor, headerFont, headerOpacity = 0.45, scope, parentLoc, memberCount, subCount, navigate }) {
  const [resolvedHeader, setResolvedHeader] = useState(null);
  useEffect(() => { if (headerImage) resolveImageUrl(headerImage).then(setResolvedHeader).catch(() => setResolvedHeader(null)); else setResolvedHeader(null); }, [headerImage]);
  const hasHeader = !!(headerImage && resolvedHeader);
  const nameColor = headerTextColor || (hasHeader ? "#ffffff" : groupNameColor(color));
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(location.custom_fields || {}), ...(headerTextColor ? { color: headerTextColor } : {}), ...(headerBgColor ? { backgroundColor: headerBgColor } : {}) }}>
      {hasHeader && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${resolvedHeader}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: headerOpacity }} />
      )}
      <div className={`relative z-10 flex gap-4 items-start ${hasHeader || headerBgColor ? "p-4" : ""}`} style={headerFont ? { fontFamily: headerFont } : undefined}>
        <LocationAvatar color={color} image={location.background_image_url} />
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2" style={{ color: nameColor }}>
            <MapPin className="w-5 h-5 flex-shrink-0" /> {location.name}
          </h2>
          {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
          {parentLoc && (
            <button type="button" onClick={() => navigate(`/location/${parentLoc.id}`)} className="block text-xs text-muted-foreground hover:text-foreground">
              <CornerDownRight className="w-3 h-3 inline mr-1" /> inside {parentLoc.name}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {memberCount} {memberCount === 1 ? "member" : "members"}{subCount ? ` · ${subCount} sub-location${subCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function LocationProfileInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();
  const [editMode, setEditMode] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingMapBg, setUploadingMapBg] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => base44.entities.InnerWorldLocation.list(),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => base44.entities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => base44.entities.InnerWorldLayer.list() });
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });

  const location = locations.find((l) => String(l.id) === String(id)) || null;

  // Recolour the app-header wave to this location's wave colour while open.
  const waveRaw = location?.custom_fields?.["_theme_wave"];
  useEffect(() => {
    if (!waveRaw) { setPageWaveOverride(null); return () => setPageWaveOverride(null); }
    let color = waveRaw;
    const m = typeof waveRaw === "string" && waveRaw.match(/^var\((--[\w-]+)\)/);
    if (m) { const el = document.querySelector(".os-pf"); color = el ? getComputedStyle(el).getPropertyValue(m[1]).trim() : ""; }
    setPageWaveOverride(color || null);
    return () => setPageWaveOverride(null);
  }, [waveRaw]);

  const [form, setForm, formHistory] = useUndoRedo(null);
  useEffect(() => {
    if (!location) return;
    formHistory.reset({
      name: location.name || "",
      color: location.color || "",
      shape: location.shape || "rectangle",
      description: location.description || "",
      background_image_url: location.background_image_url || "",
      background_opacity: location.background_opacity ?? 0.7,
      is_locked: !!location.is_locked,
      link_target_type: location.link_target_type || "",
      link_target_id: location.link_target_id || "",
      custom_fields: location.custom_fields || {},
    });
  }, [location?.id]);

  const setCf = (key, val) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));

  // Map/layer scope + nested link options.
  const mapName = (mid) => maps.find((m) => m.id === mid)?.name;
  const layerName = (lid) => layers.find((l) => l.id === lid)?.name;
  const linkOptions = useMemo(() => {
    const opts = [{ id: "", label: "Nothing (no link)" }];
    for (const m of [...maps].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      opts.push({ id: `map:${m.id}`, label: m.name || "Map", _depth: 0, isMap: true });
      for (const l of layers.filter((x) => x.map_id === m.id).sort((a, b) => (a.order || 0) - (b.order || 0))) {
        opts.push({ id: `layer:${l.id}`, label: l.name || "Layer", _depth: 1 });
      }
    }
    return opts;
  }, [maps, layers]);
  const renderNestedOpt = (opt) => (
    <>
      {opt._depth > 0 && <span style={{ width: opt._depth * 14 }} className="flex-shrink-0 inline-block" />}
      {opt._depth > 0 && <span className="text-muted-foreground/50 flex-shrink-0">↳</span>}
      {opt.isMap && <MapIcon className="w-3 h-3 text-primary/70 flex-shrink-0" />}
      <span className="truncate text-sm flex-1">{opt.label}</span>
    </>
  );

  // Sub-location / parent detection by coordinate containment on the same map.
  const sameMap = useMemo(() => locations.filter((l) => l.map_id === (location?.map_id)), [locations, location?.map_id]);
  const getParent = (loc) => {
    if (!loc) return null;
    const sorted = [...sameMap].sort((a, b) => (b.order || 0) - (a.order || 0));
    for (const p of sorted) {
      if (p.id === loc.id) continue;
      if (loc.x >= p.x && loc.x + (loc.width || 200) <= p.x + (p.width || 200) &&
          loc.y >= p.y && loc.y + (loc.height || 150) <= p.y + (p.height || 150)) return p;
    }
    return null;
  };
  const parentLoc = location ? getParent(location) : null;
  const subLocs = location ? sameMap.filter((l) => l.id !== location.id && getParent(l)?.id === location.id) : [];
  const altersHere = location ? alters.filter((a) => !a.is_archived && a.inner_world_location_id === location.id) : [];

  const handleMapBgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) { return; }
    e.target.value = "";
    setUploadingMapBg(true);
    try {
      const { processUploadedImage, saveLocalImage, createLocalImageUrl } = await import("@/lib/localImageStorage");
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.8);
      if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
      let url = dataUrl;
      if (isLocalMode()) {
        const imageId = `location-bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        url = createLocalImageUrl(imageId);
      }
      setForm((f) => ({ ...f, background_image_url: url }));
    } catch { toast.error("Failed to process image"); }
    finally { setUploadingMapBg(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await base44.entities.InnerWorldLocation.update(location.id, {
        name: form.name.trim(),
        color: form.color,
        shape: form.shape || "rectangle",
        description: form.description,
        background_image_url: form.background_image_url,
        background_opacity: form.background_opacity ?? 0.7,
        is_locked: !!form.is_locked,
        link_target_type: form.link_target_type || null,
        link_target_id: form.link_target_id || null,
        custom_fields: form.custom_fields,
      });
      queryClient.invalidateQueries({ queryKey: ["innerWorldLocations"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success("Saved!");
      setEditMode(false);
    } catch (e) { toast.error(e?.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the location "${location.name}"? ${t.Alters} placed here are not deleted — they just lose this location. This can't be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.InnerWorldLocation.delete(location.id);
      queryClient.invalidateQueries({ queryKey: ["innerWorldLocations"] });
      toast.success("Location deleted.");
      navigate("/system-map");
    } catch (e) { toast.error(e?.message || "Failed to delete"); }
    finally { setDeleting(false); }
  };

  if (isLoading || (location && !form)) {
    return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!location) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Location not found</p>
        <Link to="/system-map"><Button variant="outline" className="mt-4">Go to map</Button></Link>
      </div>
    );
  }

  const scope = [mapName(location.map_id), layerName(location.layer_id)].filter(Boolean).join(" · ");
  const linkName = location.link_target_type === "map" ? mapName(location.link_target_id)
    : location.link_target_type === "layer" ? layerName(location.link_target_id) : null;

  // Open the inner-world map on the right tab + map, optionally soloing a layer.
  const openInnerWorld = (mapId, layerId) => {
    let url = "/system-map?view=inner";
    if (mapId) url += `&map=${encodeURIComponent(mapId)}`;
    if (layerId) url += `&layer=${encodeURIComponent(layerId)}&solo=1`;
    navigate(url);
  };
  const followLink = () => {
    if (location.link_target_type === "map") openInnerWorld(location.link_target_id);
    else if (location.link_target_type === "layer") {
      const tl = layers.find((l) => l.id === location.link_target_id);
      openInnerWorld(tl?.map_id, location.link_target_id);
    }
  };

  // ---------- VIEW MODE ----------
  if (!editMode) {
    const cf = location.custom_fields || {};
    const ps = readProfileBg(cf);
    const themeCss = profileThemeCss("os-pf", cf);
    const surfaceCss = profileSurfaceCss("os-pf", cf);
    const pageTextColor = cf[PAGE_TEXT_KEY] || "";
    const pageFont = fontStackFor(cf[PAGE_FONT_KEY]);
    const hideHeader = !!cf[HIDE_HEADER_KEY];
    const headerBgColor = ps.headerBgColorWithAlpha || cf[HEADER_BG_KEY] || "";
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
        <PageBackground bgColor={ps.bgColor} bgImage={ps.bgImage} bgOpacity={ps.bgOpacity} />
        {themeCss && <style>{themeCss}</style>}
        {surfaceCss && <style>{surfaceCss}</style>}
        <div className="relative z-10 os-pf space-y-6" style={{ ...(pageTextColor ? { color: pageTextColor } : {}), ...(pageFont ? { fontFamily: pageFont } : {}) }}>
          <div data-pf-chrome className="flex items-center justify-between px-2 py-1.5">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)} aria-label="Back" title="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} aria-label="Edit" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>

          {!hideHeader && (
            <LocationHeader location={location} color={location.color} headerImage={cf[HEADER_IMAGE_KEY] || ""}
              headerTextColor={cf[HEADER_TEXT_KEY] || ""} headerBgColor={headerBgColor} headerFont={fontStackFor(cf[HEADER_FONT_KEY])}
              headerOpacity={ps.headerOpacity} scope={scope} parentLoc={parentLoc} memberCount={altersHere.length} subCount={subLocs.length} navigate={navigate} />
          )}

          {location.is_locked && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="w-3.5 h-3.5" /> Position locked on the map
            </div>
          )}

          {location.description ? (
            <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
              <SimplePreview blocks={htmlToBlocks(location.description)} onBlockChange={() => {}} readOnly />
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
              No description yet. Tap <strong>Edit</strong> to add one.
            </div>
          )}

          {linkName && (
            <button type="button" onClick={followLink}
              className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left">
              <ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Tapping this on the map jumps to</p>
                <p className="text-sm text-primary font-medium truncate">{linkName} {location.link_target_type === "layer" ? "(layer)" : "(map)"}</p>
              </div>
            </button>
          )}

          {subLocs.length > 0 && (
            <div>
              <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Sub-locations ({subLocs.length})</p>
              <div className="space-y-1.5">
                {subLocs.map((s) => (
                  <button key={s.id} type="button" onClick={() => navigate(`/location/${s.id}`)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
                    style={{ borderLeftColor: s.color || "transparent", borderLeftWidth: s.color ? 3 : 1 }}>
                    <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: s.color || "#6366f1" }} />
                    <span className="text-sm flex-1 truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t.Alters} here{altersHere.length ? ` (${altersHere.length})` : ""}
            </p>
            {altersHere.length === 0 ? (
              <p className="text-xs text-muted-foreground">No {t.alters} are placed in this location yet.</p>
            ) : (
              <div className="space-y-2">
                {altersHere.map((a, i) => <AlterCard key={a.id} alter={a} index={i} activeSessions={activeSessions} hideFront />)}
              </div>
            )}
          </div>

          <Button variant="outline" className="w-full gap-1.5" onClick={() => openInnerWorld(location.map_id)}>
            <MapIcon className="w-4 h-4" /> Open inner-world map
          </Button>
        </div>
      </motion.div>
    );
  }

  // ---------- EDIT MODE ----------
  const formPs = readProfileBg(form.custom_fields || {});
  const formThemeCss = profileThemeCss("os-pf", form.custom_fields || {});
  const formSurfaceCss = profileSurfaceCss("os-pf", form.custom_fields || {});
  const linkValue = form.link_target_type ? `${form.link_target_type}:${form.link_target_id}` : "";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
      <PageBackground bgColor={formPs.bgColor} bgImage={formPs.bgImage} bgOpacity={formPs.bgOpacity} />
      {formThemeCss && <style>{formThemeCss}</style>}
      {formSurfaceCss && <style>{formSurfaceCss}</style>}
      <div className="relative z-10 os-pf space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setEditMode(false)}>
            <Eye className="w-4 h-4 mr-1.5" /> View
          </Button>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={formHistory.undo} disabled={!formHistory.canUndo} className="gap-1.5" title="Undo"><Undo2 className="w-3.5 h-3.5" /> Undo</Button>
            <Button variant="outline" size="sm" onClick={formHistory.redo} disabled={!formHistory.canRedo} className="gap-1.5" title="Redo"><Redo2 className="w-3.5 h-3.5" /> Redo</Button>
            <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </Button>
          </div>
        </div>

        {form.color && <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: form.color }} />}

        {/* Name + colour */}
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Name *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Location name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Color</label>
            <button type="button" onClick={() => setShowColorPicker(true)}
              className="w-9 h-9 rounded-lg border-2 border-border hover:ring-2 hover:ring-primary transition-all" style={{ backgroundColor: form.color || "#6366f1" }} />
          </div>
        </div>

        {/* Rich description (same BioEditor as alter/group profiles) */}
        <div className="rounded-2xl" data-pf-surface>
          <BioEditor value={form.description} onChange={(val) => setForm((f) => ({ ...f, description: val }))} />
        </div>

        {/* Shared profile style editor */}
        <SubSection title="Profile style" icon={ImageIcon} defaultOpen={false}>
          <ProfileStyleEditor
            customFields={form.custom_fields}
            setField={setCf}
            clearField={(key) => setForm((f) => { const cf = { ...f.custom_fields }; delete cf[key]; return { ...f, custom_fields: cf }; })}
          />
        </SubSection>

        {/* On the map — the location's box appearance + link + lock */}
        <SubSection title="On the map" icon={MapPin} defaultOpen={false}>
          {/* Shape */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Shape</label>
            <div className="flex gap-1.5">
              {["rectangle", "oval"].map((sh) => (
                <button key={sh} type="button" onClick={() => setForm((f) => ({ ...f, shape: sh }))}
                  className={`flex-1 h-9 rounded-lg border text-xs font-medium capitalize transition-colors ${(form.shape || "rectangle") === sh ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                  {sh}
                </button>
              ))}
            </div>
          </div>
          {/* Box background image */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Box background image</label>
            <div className="flex gap-2">
              <Input value={form.background_image_url || ""} onChange={(e) => setForm((f) => ({ ...f, background_image_url: e.target.value }))} placeholder="https://… or pick / upload →" className="flex-1 text-xs h-8" />
              <AssetButton onPick={(url) => setForm((f) => ({ ...f, background_image_url: url }))} className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0" />
              <label className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0 cursor-pointer">
                {uploadingMapBg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-muted-foreground" />}
                <input type="file" accept="image/*" hidden onChange={handleMapBgUpload} />
              </label>
              {form.background_image_url && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, background_image_url: "" }))} className="text-muted-foreground hover:text-destructive flex-shrink-0 self-center"><X className="w-4 h-4" /></button>
              )}
            </div>
            {form.background_image_url && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Image opacity</span>
                  <span className="text-xs text-muted-foreground font-mono">{Math.round((form.background_opacity ?? 0.7) * 100)}%</span>
                </div>
                <input type="range" min={0.05} max={1} step={0.05} value={form.background_opacity ?? 0.7}
                  onChange={(e) => setForm((f) => ({ ...f, background_opacity: parseFloat(e.target.value) }))} className="w-full accent-primary" />
              </div>
            )}
          </div>
          {/* Link target — searchable, nested */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Tapping this on the map jumps to…</label>
            <SearchableSelect value={linkValue} options={linkOptions} placeholder="Nothing (no link)" searchPlaceholder="Search maps & layers…"
              renderOption={renderNestedOpt}
              onChange={(v) => {
                if (!v) { setForm((f) => ({ ...f, link_target_type: "", link_target_id: "" })); return; }
                const [type, lid] = v.split(":");
                setForm((f) => ({ ...f, link_target_type: type, link_target_id: lid }));
              }} />
          </div>
          {/* Lock */}
          <button type="button" onClick={() => setForm((f) => ({ ...f, is_locked: !f.is_locked }))}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${form.is_locked ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
            {form.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {form.is_locked ? "Position locked" : "Lock position on map"}
          </button>
        </SubSection>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Changes
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={deleting} className="w-full text-destructive hover:text-destructive border-destructive/30">
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete location
          </Button>
        </div>

        {showColorPicker && <ColorPickerModal color={form.color || "#6366f1"} label="Location Color" onSave={(hex) => setForm((f) => ({ ...f, color: hex }))} onClose={() => setShowColorPicker(false)} />}
      </div>
    </motion.div>
  );
}

export default function LocationProfile() {
  const { id } = useParams();
  return (
    <ErrorBoundary
      resetKeys={[id]}
      fallback={(error, reset) => (
        <div className="p-4 space-y-3">
          <Link to="/system-map"><Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back to map</Button></Link>
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-destructive">Something went wrong loading this location</p>
            <p className="text-xs text-foreground/90 break-words">{(error && (error.message || String(error))) || "Unknown error"}</p>
            <Button size="sm" variant="outline" onClick={reset}>Try again</Button>
          </div>
        </div>
      )}
    >
      <LocationProfileInner />
    </ErrorBoundary>
  );
}
