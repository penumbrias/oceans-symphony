// The new inner-world location profile's widgets (v0.309.0): Identity,
// About, Who's here and Places for a location's page.
//
// Built the same way as the alter, group and contact widgets: they show the
// location and never own its data (its fields are edited on the pencil form,
// its place on the map in the inner-world editor); Minimal / Normal /
// Expanded where that means something; ONE box (GardenBox); em text; 44px
// targets; nothing on the page when there's nothing to show. Where the
// location sits — its map, layer, the box it's inside and the boxes inside
// it — comes from useLocationContext, the same reading the classic sections
// use (cycle-safe coordinate containment on one map).

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapPin, Map as MapIcon, Lock, CornerDownRight, ExternalLink, User, IdCard, AlignLeft, Users, Landmark } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useBoardSubject } from "@/lib/boardSubject";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import { useLocationContext } from "@/components/systemmap/LocationSections";
import { GardenBox, Heading, chipCls, chipStyle, MODES, textBtnCls } from "@/v2/gardenProfileWidgets";

// The location whose page this is. Same ["innerWorldLocations"] query
// every location surface reads.
export function useSubjectLocation() {
  const subject = useBoardSubject();
  const id = subject?.type === "location" ? subject.id : null;
  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list(), enabled: !!id });
  if (!id) return null;
  return locations.find((l) => String(l.id) === String(id)) || null;
}

const AVATAR_RADIUS = { circle: "9999px", rounded: "22%", square: "6%" };

function LocationPicture({ location, size, shape }) {
  const [url, setUrl] = useState(null);
  const image = location.background_image_url;
  useEffect(() => {
    let live = true;
    if (image) resolveImageUrl(image).then((u) => { if (live) setUrl(u); }).catch(() => { if (live) setUrl(null); });
    else setUrl(null);
    return () => { live = false; };
  }, [image]);
  return (
    <div className="overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: AVATAR_RADIUS[shape] || AVATAR_RADIUS.rounded, backgroundColor: location.color || "color-mix(in srgb, var(--v2-accent) 20%, transparent)" }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <MapPin className="w-1/2 h-1/2 opacity-70" aria-hidden="true" />}
    </div>
  );
}

function AlterFace({ alter, size = "2.25em" }) {
  const url = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <span className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, backgroundColor: alter.color || "color-mix(in srgb, var(--v2-accent) 20%, transparent)" }} aria-hidden="true">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-1/2 h-1/2 opacity-70" />}
    </span>
  );
}

// ── Identity ─────────────────────────────────────────────────────────

export function LocationIdentityWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const navigate = useNavigate();
  const location = useSubjectLocation();
  const { parentLoc, subLocs, altersHere, scope } = useLocationContext(location);
  if (!location) return null;
  const minimal = mode === "minimal";
  const expanded = mode === "expanded";
  const center = settings?.align === "center";
  const size = Math.max(32, Math.min(200, Number(settings?.avatarSize) || 88));
  return (
    <GardenBox data-location-identity-widget="" data-mode={mode}>
      <div className={`flex gap-[0.9em] ${center ? "flex-col items-center text-center" : "items-start"}`}>
        {settings?.showAvatar !== false && <LocationPicture location={location} size={size} shape={settings?.avatarShape} />}
        <div className="min-w-0 flex-1 space-y-[0.15em]">
          <h2 className="font-display text-[1.5em] font-semibold leading-tight break-words">{location.name}</h2>
          {!minimal && scope && <p className="text-[0.875em] opacity-70">{scope}</p>}
          {!minimal && parentLoc && (
            <button type="button" onClick={() => navigate(`/location/${parentLoc.id}`)} className="inline-flex items-center gap-[0.3em] min-h-[2.75em] hover:underline opacity-80">
              <CornerDownRight className="w-[1em] h-[1em]" aria-hidden="true" /> Inside {parentLoc.name}
            </button>
          )}
          {!minimal && (
            <p className="text-[0.875em] opacity-70">
              {altersHere.length} {altersHere.length === 1 ? t.alter : t.alters}{subLocs.length ? ` · ${subLocs.length} inside` : ""}
            </p>
          )}
          {expanded && location.is_locked && (
            <p className="inline-flex items-center gap-[0.3em] text-[0.8125em] opacity-80"><Lock className="w-[1em] h-[1em]" aria-hidden="true" /> Position locked on the map</p>
          )}
        </div>
      </div>
    </GardenBox>
  );
}

// ── About ────────────────────────────────────────────────────────────

const plain = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function LocationAboutWidget({ mode = "normal" }) {
  const location = useSubjectLocation();
  if (!location) return null;
  const html = location.description || "";
  const text = plain(html);
  return (
    <GardenBox empty={!text} name="About" data-location-about-widget="">
      {mode === "minimal"
        ? <p className="line-clamp-3 break-words">{text}</p>
        : <SimplePreview blocks={htmlToBlocks(html)} onBlockChange={() => {}} readOnly scopeId={location.id} />}
    </GardenBox>
  );
}

// ── Who's here ───────────────────────────────────────────────────────

export function LocationAltersWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const location = useSubjectLocation();
  const { altersHere, activeSessions } = useLocationContext(location);
  const [all, setAll] = useState(false);
  const frontIds = useMemo(() => activeSessions.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean), [activeSessions]);
  const sorted = useMemo(() => {
    const list = [...altersHere];
    if (settings?.sort === "front") list.sort((a, b) => Number(frontIds.includes(b.id)) - Number(frontIds.includes(a.id)));
    else list.sort((a, b) => formatAlter(a).localeCompare(formatAlter(b)));
    return list;
  }, [altersHere, settings?.sort, frontIds, formatAlter]);
  if (!location) return null;
  const step = Math.max(1, Number(settings?.count) || 12);
  const shown = all ? sorted : sorted.slice(0, step);
  const open = (a) => navigate(`/alter/${a.id}`);
  return (
    <GardenBox empty={!altersHere.length} name={`${t.Alters} here`} data-location-alters-widget="" data-mode={mode}>
      {settings?.showHeading !== false && <Heading>{`${t.Alters} here (${altersHere.length})`}</Heading>}
      {mode === "minimal" ? (
        <ul className="flex flex-wrap gap-[0.4em]" aria-label={`${t.Alters} here`}>
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => open(a)} className="rounded-full min-w-[2.75em] min-h-[2.75em] flex items-center justify-center"
                aria-label={`${formatAlter(a)}${frontIds.includes(a.id) ? `, in ${t.front}` : ""}`} title={formatAlter(a)}>
                <AlterFace alter={a} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label={`${t.Alters} here`}>
          {shown.map((a) => (
            <li key={a.id} className="border-b border-current/10 last:border-b-0">
              <button type="button" onClick={() => open(a)} className="w-full flex items-center gap-[0.6em] min-h-[2.75em] py-[0.25em] text-left">
                <AlterFace alter={a} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{formatAlter(a)}</span>
                  {(a.pronouns || (mode === "expanded" && a.role)) && (
                    <span className="block truncate text-[0.75em] opacity-70">{[a.pronouns, mode === "expanded" ? a.role : null].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                {frontIds.includes(a.id) && <span className={chipCls} style={chipStyle(null)}>In {t.front}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className={`${textBtnCls} mt-[0.3em] underline`}>Show all {sorted.length}</button>
      )}
    </GardenBox>
  );
}

// ── Places ───────────────────────────────────────────────────────────

export function LocationPlacesWidget({ settings, mode = "normal" }) {
  const navigate = useNavigate();
  const location = useSubjectLocation();
  const { parentLoc, subLocs, linkName, followLink, openInnerWorld } = useLocationContext(location);
  if (!location) return null;
  const showMap = settings?.showMapButton !== false;
  const placeBtn = (l) => (
    <button key={l.id} type="button" onClick={() => navigate(`/location/${l.id}`)}
      className={mode === "minimal" ? `${chipCls} min-h-[2.75em]` : "w-full flex items-center gap-[0.5em] min-h-[2.75em] text-left hover:underline"}
      style={mode === "minimal" ? chipStyle(l.color || null) : undefined}>
      {mode !== "minimal" && <span className="w-[0.9em] h-[0.9em] rounded flex-shrink-0" style={{ background: l.color || "var(--v2-accent)" }} aria-hidden="true" />}
      <span className="truncate">{l.name}</span>
    </button>
  );
  return (
    <GardenBox data-location-places-widget="" data-mode={mode}>
      <div className="space-y-[0.7em]">
        {mode === "expanded" && parentLoc && (
          <div><Heading>Inside</Heading>{placeBtn(parentLoc)}</div>
        )}
        {subLocs.length > 0 && (
          <div>
            <Heading>{`Places inside (${subLocs.length})`}</Heading>
            <div className={mode === "minimal" ? "flex flex-wrap gap-[0.4em]" : ""}>{subLocs.map(placeBtn)}</div>
          </div>
        )}
        {mode !== "minimal" && linkName && (
          <button type="button" onClick={followLink} className="w-full flex items-center gap-[0.5em] min-h-[2.75em] text-left">
            <ExternalLink className="w-[1em] h-[1em] flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.75em] opacity-70">Tapping it on the map opens</span>
              <span className="block truncate font-medium">{linkName} {location.link_target_type === "layer" ? "(layer)" : "(map)"}</span>
            </span>
          </button>
        )}
        {showMap && (
          <button type="button" onClick={() => openInnerWorld(location.map_id)} className={`${textBtnCls} inline-flex items-center gap-[0.4em] border`}
            style={{ borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
            <MapIcon className="w-[1em] h-[1em]" aria-hidden="true" /> Open the map
          </button>
        )}
      </div>
    </GardenBox>
  );
}

// ── Registry ─────────────────────────────────────────────────────────

const base = { category: "profile", subjects: ["location"], supportsMultiInstance: true, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 40 } };

export const GARDEN_LOCATION_WIDGETS = {
  location_identity: {
    ...base, label: "Location identity", icon: IdCard,
    description: "The location's picture and name; Normal adds its map and layer, what it's inside and how many {{alters}} are here, Expanded whether it's locked.",
    render: ({ settings, mode }) => <LocationIdentityWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "showAvatar", type: "toggle", label: "Show the picture", default: true },
      { key: "avatarShape", type: "select", label: "Picture shape", default: "rounded",
        options: [{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
      { key: "avatarSize", type: "number", label: "Picture size", min: 32, max: 200, default: 88, unit: "px" },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Beside" }, { value: "center", label: "Centred" }] },
    ],
  },
  location_about: {
    ...base, label: "About the location", icon: AlignLeft,
    description: "The location's description. Minimal is the first few lines as plain text.",
    render: ({ mode }) => <LocationAboutWidget mode={mode} />,
    supportsModes: ["minimal", "normal"], defaultSpan: { cols: 12, rows: 2 },
  },
  location_alters: {
    ...base, label: "{{Alters}} here", icon: Users,
    description: "Who is placed in this location. Minimal is their pictures, Normal a list, Expanded adds roles.",
    render: ({ settings, mode }) => <LocationAltersWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 3 },
    configFields: [
      { key: "sort", type: "select", label: "Order", default: "name",
        options: [{ value: "name", label: "By name" }, { value: "front", label: "In {{front}} first" }] },
      { key: "count", type: "number", label: "How many before Show all", min: 1, max: 200, default: 12 },
      { key: "showHeading", type: "toggle", label: "Show the heading", default: true },
    ],
  },
  location_places: {
    ...base, label: "Places", icon: Landmark,
    description: "The places inside this one, where tapping it on the map leads, and the way to the map; Expanded adds what it's inside.",
    render: ({ settings, mode }) => <LocationPlacesWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "showMapButton", type: "toggle", label: "Show Open the map", default: true },
    ],
  },
};
