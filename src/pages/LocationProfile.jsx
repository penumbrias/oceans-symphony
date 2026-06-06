// Full profile page for one inner-world location — the same shape as the
// alter and group profiles (/alter/:id, /group/:id), just for a
// InnerWorldLocation. View mode shows the location's banner, description,
// which map/layer it lives on, its sub-locations, and the alters inside it;
// edit mode covers name / colour / shape / description / background image /
// link target / lock.
//
// "Alters here"   — alters whose inner_world_location_id === this location.
// "Sub-locations" — locations on the SAME map whose box sits inside this one
//                   (the existing coordinate-overlap nesting model; cycle-safe
//                   because a box can't strictly contain itself).
import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, Eye, Save, Loader2, Upload, X, MapPin, Map as MapIcon,
  Trash2, Lock, Unlock, CornerDownRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import ColorPicker from "@/components/shared/ColorPicker";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { AssetButton } from "@/components/shared/AssetPickerModal";

function getContrastColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a2e" : "#ffffff";
}

// One alter row inside "Alters here" — taps through to the alter profile.
function MemberRow({ alter, onClick }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left">
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
        style={{ backgroundColor: alter.color || "#8b5cf6" }}>
        {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" />
          : <span className="text-xs font-bold text-white">{alter.name?.charAt(0)?.toUpperCase()}</span>}
      </div>
      <span className="text-sm text-foreground flex-1 truncate">{alter.name}</span>
    </button>
  );
}

function LocationProfileInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resolvedBg, setResolvedBg] = useState(null);
  const bgFileRef = useRef(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => base44.entities.InnerWorldLocation.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["innerWorldMaps"],
    queryFn: () => base44.entities.InnerWorldMap.list(),
  });
  const { data: layers = [] } = useQuery({
    queryKey: ["innerWorldLayers"],
    queryFn: () => base44.entities.InnerWorldLayer.list(),
  });

  const location = locations.find((l) => String(l.id) === String(id)) || null;

  // Seed the edit form when the location loads / changes.
  useEffect(() => { if (location) setEditData((d) => d && d.id === location.id ? d : { ...location }); }, [location?.id]);

  // Resolve the (possibly local-image://) background for the banner.
  const bgSource = editMode ? editData?.background_image_url : location?.background_image_url;
  useEffect(() => {
    if (!bgSource) { setResolvedBg(null); return; }
    resolveImageUrl(bgSource).then(setResolvedBg).catch(() => setResolvedBg(null));
  }, [bgSource]);

  // Map/layer scope + nested link options (other maps → their layers).
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

  const handleBgFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
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
      setEditData((l) => ({ ...l, background_image_url: url }));
    } catch { toast.error("Failed to process image"); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!editData.name?.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await base44.entities.InnerWorldLocation.update(location.id, {
        name: editData.name.trim(),
        description: editData.description || "",
        color: editData.color || "",
        shape: editData.shape || "rectangle",
        background_image_url: editData.background_image_url || "",
        background_opacity: editData.background_opacity ?? 0.7,
        is_locked: !!editData.is_locked,
        link_target_type: editData.link_target_type || null,
        link_target_id: editData.link_target_id || null,
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

  if (isLoading || (location && !editData)) {
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

  const scopeBits = [mapName(location.map_id), layerName(location.layer_id)].filter(Boolean);
  const linkValue = location.link_target_type ? `${location.link_target_type}:${location.link_target_id}` : "";
  const linkName = location.link_target_type === "map" ? mapName(location.link_target_id)
    : location.link_target_type === "layer" ? layerName(location.link_target_id) : null;
  const color = (editMode ? editData.color : location.color) || "#6366f1";
  const hasBg = !!(bgSource && resolvedBg);
  const bgOpacity = (editMode ? editData.background_opacity : location.background_opacity) ?? 0.7;

  // ---------- HEADER (shared) ----------
  const header = (
    <div className="relative rounded-2xl overflow-hidden flex items-end p-4 min-h-[140px]" style={{ backgroundColor: color }}>
      {hasBg && <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${resolvedBg}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOpacity }} />}
      <div className="absolute inset-0 bg-black/25 pointer-events-none" />
      <div className="relative z-10 min-w-0">
        {editMode ? (
          <Input value={editData.name || ""} onChange={(e) => setEditData((l) => ({ ...l, name: e.target.value }))}
            className="text-2xl font-bold bg-black/30 border-white/30 text-white max-w-md" placeholder="Location name" />
        ) : (
          <h1 className="font-display text-2xl font-bold" style={{ color: getContrastColor(color) === "#1a1a2e" && !hasBg ? "#1a1a2e" : "#ffffff" }}>{location.name}</h1>
        )}
        {scopeBits.length > 0 && (
          <p className="text-xs text-white/85 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {scopeBits.join(" · ")}</p>
        )}
      </div>
    </div>
  );

  // ---------- VIEW MODE ----------
  if (!editMode) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
        <div className="flex items-center justify-between px-1">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>

        {header}

        {location.is_locked && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Lock className="w-3.5 h-3.5" /> Position locked on the map
          </div>
        )}

        {/* Description */}
        <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
          {location.description
            ? <p className="text-sm text-foreground whitespace-pre-wrap break-words">{location.description}</p>
            : <p className="text-sm text-muted-foreground">No description yet. Tap <strong>Edit</strong> to add one.</p>}
        </div>

        {/* Parent location */}
        {parentLoc && (
          <button type="button" onClick={() => navigate(`/location/${parentLoc.id}`)}
            className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left">
            <CornerDownRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Located inside</p>
              <p className="text-sm text-foreground font-medium truncate">{parentLoc.name}</p>
            </div>
          </button>
        )}

        {/* Link target */}
        {linkName && (
          <button type="button" onClick={() => navigate(`/system-map`)}
            className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left">
            <ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Tapping this on the map jumps to</p>
              <p className="text-sm text-primary font-medium truncate">{linkName} {location.link_target_type === "layer" ? "(layer)" : "(map)"}</p>
            </div>
          </button>
        )}

        {/* Sub-locations */}
        {subLocs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Sub-locations ({subLocs.length})</p>
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

        {/* Alters here */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {t.Alters} here{altersHere.length ? ` (${altersHere.length})` : ""}
          </p>
          {altersHere.length === 0
            ? <p className="text-xs text-muted-foreground">No {t.alters} are placed in this location yet.</p>
            : <div className="space-y-2">{altersHere.map((a) => <MemberRow key={a.id} alter={a} onClick={() => navigate(`/alter/${a.id}`)} />)}</div>}
        </div>

        <Button variant="outline" className="w-full gap-1.5" onClick={() => navigate("/system-map")}>
          <MapIcon className="w-4 h-4" /> Open inner-world map
        </Button>
      </motion.div>
    );
  }

  // ---------- EDIT MODE ----------
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => { setEditMode(false); setEditData({ ...location }); }}>
          <Eye className="w-4 h-4 mr-1.5" /> View
        </Button>
        <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </Button>
      </div>

      {header}

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Description</label>
        <textarea value={editData.description || ""} onChange={(e) => setEditData((l) => ({ ...l, description: e.target.value }))}
          rows={3} className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
      </div>

      {/* Color + shape */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <ColorPicker value={editData.color || "#6366f1"} onChange={(hex) => setEditData((l) => ({ ...l, color: hex }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Shape</label>
          <div className="flex gap-1.5">
            {["rectangle", "oval"].map((sh) => (
              <button key={sh} type="button" onClick={() => setEditData((l) => ({ ...l, shape: sh }))}
                className={`flex-1 h-9 rounded-lg border text-xs font-medium capitalize transition-colors ${(editData.shape || "rectangle") === sh ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                {sh}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Background image */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">Background image</label>
        <div className="flex gap-2">
          <Input value={editData.background_image_url || ""} onChange={(e) => setEditData((l) => ({ ...l, background_image_url: e.target.value }))}
            placeholder="https://… or pick / upload →" className="flex-1 text-xs h-8" />
          <AssetButton onPick={(url) => setEditData((l) => ({ ...l, background_image_url: url }))}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0" />
          <button type="button" onClick={() => bgFileRef.current?.click()} disabled={uploading}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={handleBgFile} />
          {editData.background_image_url && (
            <button type="button" onClick={() => setEditData((l) => ({ ...l, background_image_url: "" }))}
              className="text-muted-foreground hover:text-destructive flex-shrink-0 self-center"><X className="w-4 h-4" /></button>
          )}
        </div>
        {editData.background_image_url && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Image opacity</span>
              <span className="text-xs text-muted-foreground font-mono">{Math.round((editData.background_opacity ?? 0.7) * 100)}%</span>
            </div>
            <input type="range" min={0.05} max={1} step={0.05} value={editData.background_opacity ?? 0.7}
              onChange={(e) => setEditData((l) => ({ ...l, background_opacity: parseFloat(e.target.value) }))} className="w-full accent-primary" />
          </div>
        )}
      </div>

      {/* Link target — searchable, nested (maps → their layers) */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Tapping this on the map jumps to…</label>
        <SearchableSelect value={linkValue} options={linkOptions} placeholder="Nothing (no link)" searchPlaceholder="Search maps & layers…"
          renderOption={renderNestedOpt}
          onChange={(v) => {
            if (!v) { setEditData((l) => ({ ...l, link_target_type: null, link_target_id: null })); return; }
            const [type, lid] = v.split(":");
            setEditData((l) => ({ ...l, link_target_type: type, link_target_id: lid }));
          }} />
      </div>

      {/* Lock toggle */}
      <button type="button" onClick={() => setEditData((l) => ({ ...l, is_locked: !l.is_locked }))}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${editData.is_locked ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
        {editData.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {editData.is_locked ? "Position locked" : "Lock position on map"}
      </button>

      <div className="flex flex-col gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Changes
        </Button>
        <Button variant="outline" onClick={handleDelete} disabled={deleting} className="w-full text-destructive hover:text-destructive border-destructive/30">
          {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete location
        </Button>
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
