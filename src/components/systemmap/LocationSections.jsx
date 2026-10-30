// The sections of an inner-world location's profile page (v0.291.0) — ONE
// copy each, used by the page's widgets (src/v2/profileWidgets.jsx). Every
// section takes the location record and reads the rest (its map and layer,
// parent and sub-locations, who is placed here) through useLocationContext.
//
// "Alters here"   — alters whose inner_world_location_id === this location.
// "Sub-locations" — locations on the SAME map whose box sits inside this one
//                   (the existing coordinate-overlap nesting; cycle-safe).
import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapPin, Map as MapIcon, Lock, CornerDownRight, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { isValidHexColor } from "@/lib/colorUtils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import AlterCard from "@/components/alters/AlterCard";
import { groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, headerThemeStyleVars, PS } from "@/lib/profileStyle";


import { framedImageStyle, framingFor, framedBackgroundStyle } from "@/lib/imageFraming";
function getContrastColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a2e" : "#ffffff";
}

// Location "avatar" — the colour swatch with a map-pin, or its on-map
// background image. Mirrors GroupAvatar's role in the header.
export function LocationAvatar({ color, image, framing = null }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => { if (image) resolveImageUrl(image).then(setResolved).catch(() => setResolved(null)); else setResolved(null); }, [image]);
  const textColor = isValidHexColor(color) ? getContrastColor(color) : "#ffffff";
  return (
    <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ backgroundColor: isValidHexColor(color) ? color : "hsl(var(--muted))" }}>
      {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" style={framedImageStyle(framing)} />
        : <MapPin className="w-9 h-9" style={{ color: textColor }} />}
    </div>
  );
}

// Everything a section needs beyond the location record.
export function useLocationContext(location) {
  const navigate = useNavigate();
  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => base44.entities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => base44.entities.InnerWorldLayer.list() });
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });

  const mapName = (mid) => maps.find((m) => m.id === mid)?.name;
  const layerName = (lid) => layers.find((l) => l.id === lid)?.name;

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
  const scope = location ? [mapName(location.map_id), layerName(location.layer_id)].filter(Boolean).join(" · ") : "";
  const linkName = !location ? null
    : location.link_target_type === "map" ? mapName(location.link_target_id)
    : location.link_target_type === "layer" ? layerName(location.link_target_id) : null;

  // Open the inner-world map on the right tab + map, optionally soloing a layer.
  const openInnerWorld = (mapId, layerId) => {
    let url = "/system-map?view=inner";
    if (mapId) url += `&map=${encodeURIComponent(mapId)}`;
    if (layerId) url += `&layer=${encodeURIComponent(layerId)}&solo=1`;
    navigate(url);
  };
  const followLink = () => {
    if (!location) return;
    if (location.link_target_type === "map") openInnerWorld(location.link_target_id);
    else if (location.link_target_type === "layer") {
      const tl = layers.find((l) => l.id === location.link_target_id);
      openInnerWorld(tl?.map_id, location.link_target_id);
    }
  };
  return { locations, alters, maps, layers, activeSessions, parentLoc, subLocs, altersHere, scope, linkName, openInnerWorld, followLink };
}

// The banner (header image / bg colour / font / text colour) with the
// location's meta (scope, parent, counts), plus the locked note under it.
export function LocationHeaderSection({ location }) {
  const navigate = useNavigate();
  const t = useTerms();
  const { parentLoc, subLocs, altersHere, scope } = useLocationContext(location);
  const cf = location.custom_fields || {};
  const ps = readProfileBg(cf);
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  const headerTextColor = cf[PS.HEADER_TEXT] || "";
  const headerBgColor = ps.headerBgColorWithAlpha || cf[PS.HEADER_BG] || "";
  const headerFont = fontStackFor(cf[PS.HEADER_FONT]);
  const headerOpacity = ps.headerOpacity;
  const [resolvedHeader, setResolvedHeader] = useState(null);
  useEffect(() => { if (headerImage) resolveImageUrl(headerImage).then(setResolvedHeader).catch(() => setResolvedHeader(null)); else setResolvedHeader(null); }, [headerImage]);
  const hasHeader = !!(headerImage && resolvedHeader);
  const nameColor = headerTextColor || (hasHeader ? "#ffffff" : groupNameColor(location.color));
  const memberCount = altersHere.length;
  const subCount = subLocs.length;
  const locked = location.is_locked ? (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <Lock className="w-3.5 h-3.5" /> Position locked on the map
    </div>
  ) : null;
  if (cf[PS.HIDE_HEADER]) return locked;
  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(cf), ...(headerTextColor ? { color: headerTextColor } : {}), ...(headerBgColor ? { backgroundColor: headerBgColor } : {}) }}>
        {hasHeader && (
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${resolvedHeader}")`, ...framedBackgroundStyle(cf[PS.HEADER_IMAGE_FRAMING]), opacity: headerOpacity }} />
        )}
        <div className={`relative z-10 flex gap-4 items-start ${hasHeader || headerBgColor ? "p-4" : ""}`} style={headerFont ? { fontFamily: headerFont } : undefined}>
          <LocationAvatar color={location.color} image={location.background_image_url} framing={framingFor(location, location.background_image_url)} />
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
              {memberCount} {memberCount === 1 ? t.alter : t.alters}{subCount ? ` · ${subCount} sub-location${subCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>
      </div>
      {locked}
    </div>
  );
}

export function LocationBioSection({ location }) {
  return location.description ? (
    <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
      <SimplePreview blocks={htmlToBlocks(location.description)} onBlockChange={() => {}} readOnly scopeId={location?.id} />
    </div>
  ) : (
    <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
      No description yet. Tap <strong>Edit</strong> to add one.
    </div>
  );
}

export function LocationSubLocationsSection({ location }) {
  const navigate = useNavigate();
  const { subLocs } = useLocationContext(location);
  if (subLocs.length === 0) return null;
  return (
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
  );
}

export function LocationMembersSection({ location }) {
  const t = useTerms();
  const { altersHere, activeSessions } = useLocationContext(location);
  return (
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
  );
}

// Where this location leads on the map, and the way to the map itself.
export function LocationOnMapSection({ location }) {
  const { linkName, followLink, openInnerWorld } = useLocationContext(location);
  return (
    <div className="space-y-6">
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
      <Button variant="outline" className="w-full gap-1.5" onClick={() => openInnerWorld(location.map_id)}>
        <MapIcon className="w-4 h-4" /> Open inner-world map
      </Button>
    </div>
  );
}
