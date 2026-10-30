// Full profile page for one inner-world location — the SAME structure as
// the alter (/alter/:id) and group (/group/:id) profiles: PageBackground +
// os-pf theming, and since v0.291.0 the page itself is a widget board
// (LocationSections.jsx + src/v2/profileWidgets.jsx on the home-screen
// canvas). The record's own fields — name, colour, rich description, the
// shared ProfileStyleEditor, the on-map box — are edited on the form below
// (the pencil), with undo/redo. Profile styling is stored in
// location.custom_fields using the exact same keys the other profiles use.
import React, { useState, useEffect, useMemo } from "react";
import ProfileBoardCanvas, { useProfilePageState, openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import PageBackground from "@/components/profile/PageBackground";
import { LOCATION_PROFILE_PAGES, NEW_LOCATION_PROFILE_PAGES, profilePageId, usesNewProfile, layoutSuffixFor } from "@/lib/profileBoard";
import NewProfileOffer from "@/components/alters/NewProfileOffer";
import ProfileLayoutSwitch from "@/components/profile/ProfileLayoutSwitch";
import { withTrashBatch } from "@/lib/localDb";
import { trashProfileBoards } from "@/lib/boardStore";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, Eye, Save, Loader2, X, MapPin, Map as MapIcon, Trash2,
  Lock, Unlock, ExternalLink, Upload, Undo2, Redo2, IdCard,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { isLocalMode } from "@/lib/storageMode";
import BioEditor from "@/components/alters/BioEditor";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import PageLookRow from "@/components/profile/PageLookRow";
import { useRegisterLookSubject, withFreshLook } from "@/lib/lookSubject";
import { useLookDefaults, withLookDefaults } from "@/lib/profileLookDefaults";
import { SubSection } from "@/components/settings/SettingsUI";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, profileSurfaceCss, profileThemeCss, PS } from "@/lib/profileStyle";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { TRASH_HINT } from "@/lib/trashSettings";
import { PictureFramingRow } from "@/components/shared/PictureFramingRow";
import { withImageFraming } from "@/lib/imageFraming";


const PAGE_ICONS = { [profilePageId("profile")]: MapPin };

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
  // Which profile the location shows (v0.309.0) is read off the cached
  // list, so the pages are right on the first render.
  const [onNewLayout, setOnNewLayout] = useState(() => usesNewProfile((queryClient.getQueryData(["innerWorldLocations"]) || []).find((l) => String(l.id) === String(id))));
  const page = useProfilePageState(onNewLayout ? NEW_LOCATION_PROFILE_PAGES : LOCATION_PROFILE_PAGES);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => base44.entities.InnerWorldLocation.list(),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => base44.entities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => base44.entities.InnerWorldLayer.list() });

  const location = locations.find((l) => String(l.id) === String(id)) || null;
  const locationOnNew = usesNewProfile(location);
  useEffect(() => { if (location) setOnNewLayout(locationOnNew); }, [location?.id, locationOnNew]);
  // Display options offers this location's look while the page is open.
  useRegisterLookSubject("location", location, location?.name);
  // What the page draws: the location's own look over the location
  // defaults (profileLookDefaults.js); the form keeps the raw record.
  const lookCf = withLookDefaults(location?.custom_fields, useLookDefaults("location"));

  // Recolour the app-header wave to this location's wave colour while open.
  const waveRaw = lookCf["_theme_wave"];
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
      image_framing: location.image_framing && typeof location.image_framing === "object" ? location.image_framing : {},
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
      const fresh = (await base44.entities.InnerWorldLocation.get(location.id)) || location;
      await base44.entities.InnerWorldLocation.update(location.id, {
        name: form.name.trim(),
        color: form.color,
        shape: form.shape || "rectangle",
        description: form.description,
        background_image_url: form.background_image_url,
        image_framing: form.image_framing || {},
        background_opacity: form.background_opacity ?? 0.7,
        is_locked: !!form.is_locked,
        link_target_type: form.link_target_type || null,
        link_target_id: form.link_target_id || null,
        custom_fields: withFreshLook(form.custom_fields, fresh.custom_fields),
      });
      queryClient.invalidateQueries({ queryKey: ["innerWorldLocations"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success("Saved!");
      setEditMode(false);
    } catch (e) { toast.error(e?.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!(await confirm(`Delete the location "${location.name}"? ${t.Alters} placed here are not deleted. ${TRASH_HINT}`))) return;
    setDeleting(true);
    try {
      // The location and the layout of its profile page go together.
      await withTrashBatch(async () => {
        await trashProfileBoards("location", location.id);
        await base44.entities.InnerWorldLocation.delete(location.id);
      });
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

  // ---------- VIEW MODE: the board ----------
  if (!editMode) {
    const cf = lookCf;
    const ps = readProfileBg(cf);
    const themeCss = profileThemeCss("os-pf", cf);
    const surfaceCss = profileSurfaceCss("os-pf", cf);
    const pageTextColor = cf[PS.PAGE_TEXT] || "";
    const pageFont = fontStackFor(cf[PS.PAGE_FONT]);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
        <PageBackground bgColor={ps.bgColor} bgImage={ps.bgImage} bgOpacity={ps.bgOpacity} bgFraming={ps.bgFraming} />
        {themeCss && <style>{themeCss}</style>}
        {surfaceCss && <style>{surfaceCss}</style>}
        {/* The song belongs to VIEWING the page. */}
        {cf[PS.SONG]?.ref && <ProfileSongPlayer song={cf[PS.SONG]} />}
        <div className="relative z-10 os-pf" style={{ ...(pageTextColor ? { color: pageTextColor } : {}), ...(pageFont ? { fontFamily: pageFont } : {}) }}>
          <div data-pf-chrome className="flex items-center justify-between px-2 py-1.5 mb-4">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)} aria-label="Back" title="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            {!page.layoutEditing && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setEditMode(true)} title="Its name, picture, description and settings">
                  <IdCard className="w-3.5 h-3.5" /> Info
                </Button>
                <Button
                  data-tour="location-profile-layout-btn"
                  variant="outline" size="sm" className="h-9 w-9 px-0"
                  onClick={openProfileLayoutEditor}
                  title="Edit page — move, resize and add widgets, and change what's shown"
                  aria-label="Edit page"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          {!page.onFirstPage && (
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg border border-border/40 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: location.color || "#6366f1" }}>
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-lg font-semibold truncate">{location.name}</span>
            </div>
          )}
          {page.onFirstPage && !page.layoutEditing && <NewProfileOffer ownerType="location" record={location} />}
          {/* One render behind a switch, the pages and the layout would
              disagree — wait for the page list to follow the record. */}
          {onNewLayout === locationOnNew && (
            <ProfileBoardCanvas key={locationOnNew ? "v2" : "classic"} ownerType="location" record={location} pageIcons={PAGE_ICONS} page={page}
              tourId="location-profile-tabs" api={{ alters }} layoutSuffix={layoutSuffixFor(location, "location")} />
          )}
        </div>
      </motion.div>
    );
  }

  // ---------- EDIT MODE ----------
  const formCf = form.custom_fields || {};
  const formPs = readProfileBg(form.custom_fields || {});
  const formThemeCss = profileThemeCss("os-pf", form.custom_fields || {});
  const formSurfaceCss = profileSurfaceCss("os-pf", form.custom_fields || {});
  const linkValue = form.link_target_type ? `${form.link_target_type}:${form.link_target_id}` : "";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
      <PageBackground bgColor={formPs.bgColor} bgImage={formPs.bgImage} bgOpacity={formPs.bgOpacity} bgFraming={formPs.bgFraming} />
      {formThemeCss && <style>{formThemeCss}</style>}
      {formSurfaceCss && <style>{formSurfaceCss}</style>}
      {/* This page's song, set in its style editor like any other profile. */}
      {formCf[PS.SONG]?.ref && <ProfileSongPlayer song={formCf[PS.SONG]} />}
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

        {/* The page's look is edited in Display options on this location
            (v0.310.0); the form keeps whatever the sheet wrote (withFreshLook). */}
        <PageLookRow />

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
            <PictureFramingRow url={form.background_image_url} value={form.image_framing?.[form.background_image_url]} label="Image framing"
              shape={form.shape === "oval" || form.shape === "circle" ? "circle" : "box"} aspect="wide"
              hint="Which part of the picture shows in the box, on the map and on the profile"
              onChange={(f) => setForm((cur) => ({ ...cur, image_framing: withImageFraming(cur.image_framing, cur.background_image_url, f) }))} />
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

        <ProfileLayoutSwitch ownerType="location" record={location} />

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
