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

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, ExternalLink, Image as ImageIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { boxStyle } from "@/v2/primitives";
import { useBoardSubject } from "@/lib/boardSubject";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { FieldValue } from "@/components/alters/profile/fieldControls";
import { infoEntriesFor, entryValue } from "@/lib/alterInfoEntries";
import { mediaItemsOf, parseVideoLink, mediaTransform, MEDIA_FOCUS } from "@/lib/mediaItems";

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
  if (entry.kind === "bio") {
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

export function InfoWidget({ settings }) {
  const { alter, alterId } = useInfoAlter(settings);
  const systemFields = useSystemFields();
  const ids = Array.isArray(settings?.entries) && settings.entries.length ? settings.entries : DEFAULT_INFO_ENTRIES;
  const layout = settings?.layout || "labelled";
  const showEmpty = !!settings?.showEmpty;
  const all = useMemo(() => infoEntriesFor(alter, systemFields), [alter, systemFields]);
  if (!alterId) {
    return <div className="text-[0.8125em] opacity-70 p-2" style={flush()}>Choose whose info to show in this widget's options.</div>;
  }
  if (!alter) return null;
  const rows = ids
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
  return (
    <div className="h-full text-[0.875em] leading-relaxed" style={flush()} data-info-widget="">
      {layout === "inline" ? (
        <dl className="space-y-0.5">
          {rows.map(({ entry, value }) => (
            <div key={entry.id} className="flex gap-1.5 flex-wrap">
              <dt className="font-semibold">{entry.label}:</dt>
              <dd className="min-w-0">{isEmpty(value) ? <span className="opacity-60">—</span> : <EntryShown alter={alter} entry={entry} value={value} />}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className={one ? "" : "space-y-2.5"}>
          {rows.map(({ entry, value }) => (
            <div key={entry.id}>
              {layout === "labelled" && !(one && entry.kind === "bio") && (
                <p className="text-[0.75em] font-semibold uppercase tracking-wide opacity-70 mb-0.5">{entry.label}</p>
              )}
              {isEmpty(value) ? <span className="opacity-60">Not filled yet</span> : <EntryShown alter={alter} entry={entry} value={value} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Media ────────────────────────────────────────────────────────────

function MediaImage({ item, settings }) {
  const src = useResolvedAvatarUrl(item.src);
  if (!src) return <div className="w-full h-full flex items-center justify-center opacity-50"><ImageIcon className="w-6 h-6" /></div>;
  return (
    <img src={src} alt={item.caption || ""} draggable={false}
      className="w-full h-full block select-none"
      style={{
        objectFit: settings?.fit === "contain" ? "contain" : "cover",
        objectPosition: MEDIA_FOCUS[settings?.focus] || "center",
        transform: mediaTransform(settings),
      }} />
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

export function MediaWidget({ settings }) {
  const items = mediaItemsOf(settings);
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
  if (!count) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-[0.8125em] opacity-70 p-2 text-center" style={flush()}>
        <ImageIcon className="w-6 h-6" />
        Add a picture, GIF or video link in this widget's options.
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
  return (
    <figure className="h-full flex flex-col min-h-0 m-0" style={flush()} data-media-widget="">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <MediaItem key={`${current.src}-${index}`} item={current} settings={settings} />
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
