// Info and Media widgets (v0.295.0) — display functions over an alter's info.
//
// The garden model: an alter's information lives in one list (Alter info,
// the record); widgets choose what to show and how. The Info widget shows
// any entries from that list; the Media widget shows pictures, GIFs and
// video links. Both are edited in their Content tab, and anything added
// there is stored in the alter's info (an entry, or one of their Pictures),
// so it outlives the widget.
//
// Each widget has ONE visible box (widget contract): flush and borderless
// until the person sets a border, background or padding, like Text.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, ExternalLink, Image as ImageIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { boxStyle, valignBoxStyle } from "@/v2/primitives";
import { useBoardSubject } from "@/lib/boardSubject";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { FieldValue } from "@/components/alters/profile/fieldControls";
import { infoEntriesFor, entryValue, writeEntry, hiddenEntryIdsOf } from "@/lib/alterInfoEntries";
import { refreshAlter } from "@/lib/alterEntry";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EntryInput, BioEntry, KIND_LABEL } from "@/components/alters/info/entryEditors";
import { mediaItemsOf, parseVideoLink, mediaTransform, MEDIA_FOCUS } from "@/lib/mediaItems";
import { framedImageStyle, framingFor } from "@/lib/imageFraming";
import { PICTURE_ROLE } from "@/lib/alterImageUpload";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { barPictureFor } from "@/lib/barPicture";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

const flush = () => boxStyle({ borderFallback: false, padFallback: false });

// Whose info: the profile's alter, or the one picked in the widget's
// options on the home screen. Same query key and reader as the profile page.
export function useInfoAlter(settings) {
  const subject = useBoardSubject();
  const id = subject?.type === "alter" ? subject.id : (settings?.alterId || null);
  const { data = null } = useQuery({
    queryKey: ["alter", id],
    queryFn: async () => (await base44.entities.Alter.list()).find((a) => String(a.id) === String(id)) || null,
    enabled: !!id,
    staleTime: 0,
  });
  return { alterId: id, alter: id ? data : null, onProfile: subject?.type === "alter" };
}

export const useSystemFields = () => useQuery({
  queryKey: ["customFields"],
  queryFn: () => base44.entities.CustomField.list("order"),
}).data || [];

const isEmpty = (v) => v === undefined || v === null || (typeof v === "string" && !v.replace(/<[^>]*>/g, "").trim());

function EntryShown({ alter, entry, value }) {
  // Long text (the bio, and parts of a bio a conversion split out) shows
  // the same way the bio always has, HTML and all.
  if (entry.kind === "bio" || entry.kind === "richtext") {
    return <BioShown alter={alter} html={value} />;
  }
  if (entry.id.startsWith("basic:")) return <span className="whitespace-pre-wrap break-words">{value}</span>;
  return <FieldValue type={entry.kind} value={value} />;
}

function BioShown({ alter, html }) {
  const blocks = useMemo(() => htmlToBlocks(html || ""), [html]);
  return <SimplePreview blocks={blocks} onBlockChange={() => {}} readOnly scopeId={alter?.id} />;
}

export const DEFAULT_INFO_ENTRIES = ["bio"];

// "Every other field" (v0.305.0): stands for every custom field — shared and
// the alter's own — that isn't listed on its own, so a field added later
// shows without touching the widget.
export const ALL_FIELDS_ENTRY = "*fields";
export const ALL_FIELDS_LABEL = "Every other field";
// Shared entries hidden from profiles (v0.310.0, Entries → ⋯ → Hide) are
// left out of it; one listed on its own still shows.
export function expandInfoEntryIds(ids, all, hiddenFieldIds = []) {
  if (!ids.includes(ALL_FIELDS_ENTRY)) return ids;
  const named = new Set(ids);
  const hidden = new Set(hiddenFieldIds.map((id) => `field:${id}`));
  const rest = all.filter((e) => (e.id.startsWith("field:") || e.id.startsWith("own:")) && !named.has(e.id) && !hidden.has(e.id)).map((e) => e.id);
  return ids.flatMap((id) => (id === ALL_FIELDS_ENTRY ? rest : [id]));
}

const longKind = (entry) => entry.kind === "bio" || entry.kind === "richtext";

// When an entry last changed, where the record keeps one per field.
function changedAt(alter, entry) {
  const key = entry.id === "bio" ? "description" : entry.id.startsWith("basic:") ? entry.id.slice(6) : null;
  const raw = key ? alter?._ft?.[key] : null;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

// One entry's value, edited where it's shown (v0.300.0). Tapping the value
// opens its editor in place (long text in a sheet with the full bio
// editor); what's typed is saved to the alter's info as it's written.
//
// On a profile page the values are only read (v0.313.0, owner: tapping
// text while getting around kept opening editors); they're changed in
// Edit page (the widget's options) or Info.
export function EditableValue({ alter, entry, value, editable: editableSetting, children, inline = false }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const onProfileBoard = !!useBoardSubject();
  const editable = editableSetting && !onProfileBoard;
  const commit = async (v) => {
    try {
      await writeEntry(alter.id, entry.id, v);
      refreshAlter(qc, alter.id);
    } catch (e) { toast.error(e?.message || "Couldn't save that"); }
  };
  if (!editable) return children;
  const open = (e) => {
    if (e?.target?.closest?.("a, button, input, textarea, audio, video")) return;
    setEditing(true);
  };
  const Tag = inline ? "span" : "div";
  const shown = (
    <Tag role="button" tabIndex={0} aria-label={`Edit ${entry.label}`} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
      className={`${inline ? "inline-block" : ""} rounded-md cursor-text min-h-[1.5em] -mx-1 px-1 hover:bg-[color-mix(in_srgb,var(--v2-accent)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-accent)]`}>
      {children}
    </Tag>
  );
  if (longKind(entry)) {
    return (
      <>
        {shown}
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogTitle>{entry.label}</DialogTitle>
            {entry.kind === "bio"
              ? <BioEntry k={`${alter.id}:bio`} value={value} onChange={commit} />
              : <EntryInput k={`${alter.id}:${entry.id}`} type="richtext" label={entry.label} value={value} onCommit={commit} />}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setEditing(false)} className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Done</button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  if (!editing) return shown;
  return (
    <Tag data-own-hold="" className={`${inline ? "inline-flex align-top text-[0.6em] font-normal" : "flex"} items-start gap-1.5`}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}>
      <div className="flex-1 min-w-0">
        <EntryInput k={`${alter.id}:${entry.id}`} type={entry.kind} label={entry.label} value={value} onCommit={commit} />
      </div>
      <button type="button" onClick={() => setEditing(false)} aria-label={`Done editing ${entry.label}`}
        className="h-9 px-3 rounded-lg border text-xs font-medium flex-shrink-0" style={{ borderColor: "var(--v2-accent)" }}>Done</button>
    </Tag>
  );
}

// The Field widget (v0.300.0; the "{{Alter}} info" widget before). Shows
// one entry from an alter's info, or several: the bio, pronouns, any
// custom field. Minimal shows only the values, Normal adds the labels,
// Expanded adds what kind of entry it is and who has it.
export function InfoWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { alter, alterId } = useInfoAlter(settings);
  const systemFields = useSystemFields();
  const ids = Array.isArray(settings?.entries) && settings.entries.length ? settings.entries : DEFAULT_INFO_ENTRIES;
  const layout = mode === "minimal" ? "plain" : (settings?.layout || "labelled");
  const expanded = mode === "expanded";
  const showEmpty = !!settings?.showEmpty;
  const editable = settings?.editInPlace !== false;
  const all = useMemo(() => infoEntriesFor(alter, systemFields), [alter, systemFields]);
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  if (!alterId) {
    return <div className="text-[0.8125em] opacity-70 p-2" style={flush()}>Choose whose info to show in this widget's options.</div>;
  }
  if (!alter) return null;
  const rows = expandInfoEntryIds(ids, all, hiddenEntryIdsOf(pickPrimarySystemSettings(settingsRows)))
    .map((id) => all.find((e) => e.id === id))
    .filter(Boolean)
    .map((entry) => ({ entry, value: entryValue(alter, entry.id) }))
    .filter((r) => showEmpty || !isEmpty(r.value));
  if (!rows.length) {
    // Nothing filled in: blank on the page, named while the layout is edited.
    return (
      <div className="h-full flex flex-col" style={flush()}>
        <div className="pf-widget-empty flex-1 items-center justify-center rounded-xl border border-dashed border-current opacity-50 text-[0.75em] px-3 text-center" aria-hidden="true">
          Nothing filled in yet — add it in this widget's options
        </div>
      </div>
    );
  }
  const one = rows.length === 1;
  const who = (entry) => (entry.own ? `Just ${formatAlter(alter)}` : entry.fieldId ? `Every ${t.alter}` : null);
  const meta = (entry) => {
    if (!expanded) return null;
    const when = changedAt(alter, entry);
    const bits = [entry.kind === "bio" ? "Long text" : KIND_LABEL[entry.kind] || "Short text", who(entry), when ? `changed ${when.toLocaleDateString()}` : null].filter(Boolean);
    return <p className="text-[0.6875em] opacity-60 mt-0.5">{bits.join(" · ")}</p>;
  };
  const valueOf = ({ entry, value }) => (
    <EditableValue alter={alter} entry={entry} value={value} editable={editable}>
      {isEmpty(value) ? <span className="opacity-60">{layout === "inline" ? "—" : "Not filled yet"}</span> : <EntryShown alter={alter} entry={entry} value={value} />}
    </EditableValue>
  );
  return (
    <div className="h-full text-[0.875em] leading-relaxed" style={{ ...flush(), ...valignBoxStyle() }} data-info-widget="" data-mode={mode}>
      {layout === "inline" ? (
        <dl className="space-y-0.5">
          {rows.map((r) => (
            <div key={r.entry.id}>
              <div className="flex gap-1.5 flex-wrap">
                <dt className="font-semibold">{r.entry.label}:</dt>
                <dd className="min-w-0 flex-1">{valueOf(r)}</dd>
              </div>
              {meta(r.entry)}
            </div>
          ))}
        </dl>
      ) : (
        <div className={one ? "" : "space-y-2.5"}>
          {rows.map((r) => (
            <section key={r.entry.id} aria-label={layout === "plain" ? r.entry.label : undefined}>
              {layout === "labelled" && !(one && r.entry.kind === "bio" && !expanded) && (
                <h3 className="text-[0.75em] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{r.entry.label}</h3>
              )}
              {valueOf(r)}
              {meta(r.entry)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Media ────────────────────────────────────────────────────────────

// A circle as big as fits its box both ways (v0.314.0 — it used to take
// the full width and get cut off in a wide box). When the box has no
// height of its own (a widget sized to its content) the width decides.
function useCircleSize() {
  const [size, setSize] = useState(0);
  const obs = useRef(null);
  const ref = useCallback((el) => {
    obs.current?.disconnect();
    obs.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const next = Math.floor(h >= 24 ? Math.min(w, h) : w);
      setSize((cur) => (Math.abs(cur - next) > 1 ? next : cur));
    };
    obs.current = new ResizeObserver(measure);
    obs.current.observe(el);
    measure();
  }, []);
  return { ref, size };
}

// The picture's frame (where it sits, zoom) under the widget's own
// rotate / mirror, and its opacity (v0.314.0).
function framedMediaStyle(item, settings) {
  const style = framedImageStyle(item.frame, {
    fit: settings?.fit === "contain" ? "contain" : "cover",
    fallbackPosition: MEDIA_FOCUS[settings?.focus] || "center",
  });
  const turn = mediaTransform(settings);
  const transform = [turn, style.transform].filter(Boolean).join(" ") || undefined;
  const opacity = Number(settings?.imageOpacity);
  return {
    ...style,
    transform,
    ...(Number.isFinite(opacity) && opacity < 100 && settings?.imageOpacity !== "" ? { opacity: Math.max(0, opacity) / 100 } : {}),
  };
}

function MediaImage({ item, settings }) {
  const src = useResolvedAvatarUrl(item.src);
  if (!src) return <div className="w-full h-full flex items-center justify-center opacity-50"><ImageIcon className="w-6 h-6" /></div>;
  return (
    <img src={src} alt={item.caption || ""} draggable={false}
      className="w-full h-full block select-none"
      style={framedMediaStyle(item, settings)} />
  );
}

// A video plays only after a tap — until then nothing is fetched from the
// video's site.
function MediaVideo({ item, settings }) {
  const video = parseVideoLink(item.src);
  const [playing, setPlaying] = useState(false);
  if (!video) {
    return <a href={item.src} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center gap-1.5 text-[0.8125em] underline">Open video <ExternalLink className="w-3.5 h-3.5" /></a>;
  }
  if (video.provider === "file") {
    return (
      <video src={video.fileUrl} controls playsInline className="w-full h-full block"
        style={{ objectFit: settings?.fit === "contain" ? "contain" : "cover", transform: mediaTransform(settings) }} />
    );
  }
  if (!playing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center" data-media-poster="">
        <button type="button" onClick={() => setPlaying(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" }}
          aria-label={`Play video from ${video.site}`}>
          <Play className="w-5 h-5" />
        </button>
        <span className="text-[0.75em] opacity-70">{video.site} video · plays from {video.site} when tapped</span>
      </div>
    );
  }
  return (
    <iframe src={video.embedUrl} title={item.caption || `${video.site} video`} className="w-full h-full block border-0 media-embed"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      style={{ transform: mediaTransform(settings) }} />
  );
}

function MediaItem({ item, settings }) {
  return item.kind === "video" ? <MediaVideo item={item} settings={settings} /> : <MediaImage item={item} settings={settings} />;
}

// "Their Pictures" (v0.297.0): the alter's own Pictures, so a picture added
// in the Alter info list shows up without touching the widget.
function useOwnPictures(settings, enabled) {
  const { alterId, alter } = useInfoAlter(settings);
  const { data = [] } = useQuery({
    queryKey: ["imageAssets", "owned", alterId],
    queryFn: () => base44.entities.ImageAsset.filter({ owner_alter_id: alterId }, "-created_date"),
    enabled: enabled && !!alterId,
  });
  return useMemo(() => (enabled ? data : [])
    .filter((a) => a?.image_url && (!a.owner_role || a.owner_role === PICTURE_ROLE))
    .map((a) => ({ src: a.image_url, kind: "image", caption: "", frame: framingFor(alter, a.image_url) })), [data, enabled, alter]);
}

// "Profile picture" and "Pinned bar picture" (v0.300.0): the one picture
// the profile header (with its rotation) or the pinned bar shows.
function useAlterPicture(settings, source) {
  const { alter } = useInfoAlter(settings);
  const on = source === "avatar" || source === "bar";
  const rotating = useRotatingImageUrl({
    alterId: on ? alter?.id : null, role: "avatar",
    mode: source === "avatar" ? alter?.avatar_rotation_mode : "off",
    fallbackUrl: alter?.avatar_url, alter,
  });
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: source === "bar",
  });
  if (!on || !alter) return [];
  const src = source === "bar" ? barPictureFor(pickPrimarySystemSettings(settingsRows), alter) : rotating;
  return src ? [{ src, kind: "image", caption: "", frame: framingFor(alter, src) }] : [];
}

export const ALTER_PICTURE_SOURCES = ["pictures", "avatar", "bar"];

export function MediaWidget({ settings }) {
  const source = ALTER_PICTURE_SOURCES.includes(settings?.source) ? settings.source : "items";
  const fromPictures = source === "pictures";
  const own = useOwnPictures(settings, fromPictures);
  const picture = useAlterPicture(settings, source);
  const items = fromPictures ? own : source === "items" ? mediaItemsOf(settings) : picture;
  const arrange = settings?.arrange || "slideshow";
  const seconds = Math.max(2, Number(settings?.interval) || 6);
  const [index, setIndex] = useState(0);
  const count = items.length;
  useEffect(() => {
    if (arrange !== "slideshow" || count < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearInterval(t);
  }, [arrange, count, seconds]);
  const showCaption = settings?.showCaption !== false;
  const circleBox = useCircleSize();
  if (!count) {
    // Nothing to show: blank on the page, a hint while the layout is edited.
    return (
      <div className="h-full flex flex-col" style={flush()}>
        <div className="pf-widget-empty flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-current opacity-50 text-[0.75em] p-2 text-center" aria-hidden="true">
          <ImageIcon className="w-6 h-6" />
          {source === "items" ? "Add a picture, GIF or video link in this widget's options"
            : source === "pictures" ? "Their Pictures show here — add some in this widget's options"
            : "No picture yet — add one in this widget's options"}
        </div>
      </div>
    );
  }
  if (arrange === "grid" && count > 1) {
    const cols = count <= 4 ? 2 : 3;
    return (
      <div className="h-full grid gap-1 overflow-hidden" style={{ ...flush(), gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-media-widget="">
        {items.map((it, i) => (
          <div key={`${it.src}-${i}`} className="relative overflow-hidden rounded-[inherit] min-h-0 aspect-square">
            <MediaItem item={it} settings={settings} />
          </div>
        ))}
      </div>
    );
  }
  const current = items[Math.min(index, count - 1)];
  const circle = settings?.shape === "circle";
  return (
    <figure className="h-full flex flex-col min-h-0 m-0" style={flush()} data-media-widget="">
      {/* A circle is as big as fits the box both ways (v0.314.0 — it used
          to take the full width and get cut off in a wide box); otherwise
          the picture fills it. */}
      <div ref={circle ? circleBox.ref : undefined}
        className={circle ? "relative flex-1 min-h-0 flex justify-center" : "relative flex-1 min-h-0 overflow-hidden"}
        // A circle in a tall box sits at the top unless Shape → Down says otherwise.
        style={circle ? { alignItems: "var(--v2-widget-valign-set, flex-start)" } : undefined}>
        {circle ? (
          <div className="relative overflow-hidden rounded-full flex-shrink-0" data-media-circle=""
            style={{ width: circleBox.size, height: circleBox.size }}>
            <MediaItem key={`${current.src}-${index}`} item={current} settings={settings} />
          </div>
        ) : <MediaItem key={`${current.src}-${index}`} item={current} settings={settings} />}
        {count > 1 && (
          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
            {items.map((_, i) => (
              <button key={i} type="button" onClick={() => setIndex(i)} aria-label={`Show item ${i + 1}`}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--v2-accent)", opacity: i === index ? 1 : 0.35 }} />
            ))}
          </div>
        )}
      </div>
      {showCaption && current.caption && <figcaption className="text-[0.75em] opacity-80 pt-1 flex-shrink-0">{current.caption}</figcaption>}
    </figure>
  );
}
