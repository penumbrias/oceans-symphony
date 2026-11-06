// The picture sheet (v0.364.0) — what opens between "the person picked or
// uploaded pictures" and "the pictures land in the text", and again when a
// picture already in a bio / note is tapped. It used to be a centred
// size dialog for one image; it is now the standard inspector sheet:
//
//   Content · the pictures (frame each one by dragging, like a profile
//             picture; reorder; add more at once) and, with several, how
//             they show: one after another, a carousel, or a slideshow
//   Shape   · shape, width, corners
//
// The result is plain HTML (src/lib/richPictures.js), so it reads the same
// in every place written text shows. Nothing is written until Insert/Done.
//
// Props: `url` (one picture) or `urls`, and/or `files` (picked files, stored
// here); `initial` (a set read back from the text — edit mode);
// `onInsert(html)`; `onRemove()` (edit mode: take it out of the text);
// `onClose()`; `prefix` names the stored pictures.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Images, Square, Crop, Check, X, MoreHorizontal, ImagePlus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";
import { Group, ChoiceRow, SliderRow, ResetRow, TabBar } from "@/components/shared/SettingRows";
import ImageFramer from "@/components/shared/ImageFramer";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { framedImageStyle, framingOf } from "@/lib/imageFraming";
import {
  DEFAULTS, LAYOUTS, MAX_SLIDES, SHAPES, normalizePictureSet, pictureSetHtml, shapesFor,
} from "@/lib/richPictures";

const btn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 text-xs font-medium hover:bg-muted/50 disabled:opacity-40";

// Store one picked file the way every text editor does: compressed (GIFs
// kept as they are, so they still move) in this device's picture store.
export async function storePickedPicture(file, prefix = "textimg") {
  if (!file?.type?.startsWith("image/") && !/\.(gif|png|jpe?g|webp|heic|avif|bmp)$/i.test(file?.name || "")) {
    throw new Error("That doesn't look like a picture.");
  }
  const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 800, 0.85);
  if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await saveLocalImage(id, dataUrl);
  return createLocalImageUrl(id);
}

function Thumb({ src, frame }) {
  const url = useResolvedAvatarUrl(src);
  return (
    <span className="w-12 h-12 rounded-lg overflow-hidden border border-border/50 bg-muted/30 flex-shrink-0">
      {url && <img src={url} alt="" className="w-full h-full block" style={framedImageStyle(frame)} />}
    </span>
  );
}

// What the pictures will look like, drawn from the same HTML that goes
// into the text (with this device's picture addresses).
function Preview({ set }) {
  const srcs = set.images.map((im) => im.src).join("\n");
  const [resolved, setResolved] = useState({});
  useEffect(() => {
    let off = false;
    const list = srcs ? srcs.split("\n") : [];
    Promise.all(list.map((s) => resolveImageUrl(s).then((u) => [s, u]).catch(() => [s, null])))
      .then((pairs) => { if (!off) setResolved(Object.fromEntries(pairs.filter(([, u]) => u))); });
    return () => { off = true; };
  }, [srcs]);
  const html = useMemo(() => pictureSetHtml(set, { srcFor: (s) => resolved[s] || s, editable: false }), [set, resolved]);
  if (!set.images.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-2 max-h-36 overflow-auto" aria-label="Preview" data-picture-preview="">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default function ImageInsertPreview({ url, urls, files, initial = null, onInsert, onRemove, onClose, prefix = "textimg" }) {
  const editing = !!initial;
  const [draft, setDraft] = useState(() => normalizePictureSet(initial || {
    images: [...(urls || []), ...(url ? [url] : [])].map((src) => ({ src })),
  }));
  const set = normalizePictureSet(draft);
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const setImages = (fn) => setDraft((d) => ({ ...d, images: fn(d.images || []) }));
  const [tab, setTab] = useState("content");
  const [framing, setFraming] = useState(null);
  const [adding, setAdding] = useState(0);
  const fileRef = useRef(null);
  const peek = usePeekHeight("symphony_picture_sheet_peek_h", 55);
  useEdgeSafeSliders(true, [tab, framing]);

  const addFiles = async (list) => {
    const picked = [...(list || [])];
    if (!picked.length) return;
    setAdding((n) => n + picked.length);
    for (const file of picked) {
      try {
        const src = await storePickedPicture(file, prefix);
        setImages((ims) => [...ims, { src }]);
      } catch (err) {
        toast.error(err?.message || "Couldn't add that picture.");
      } finally {
        setAdding((n) => n - 1);
      }
    }
  };
  // Files picked before the sheet opened are stored here, once.
  const filesDone = useRef(false);
  useEffect(() => {
    if (filesDone.current || !files?.length) return;
    filesDone.current = true;
    addFiles(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = set.images.length;
  const layout = draft.layout || DEFAULTS.layout;
  const several = (draft.images || []).length > 1;
  const shapeOptions = shapesFor(set.layout).map(({ value, label }) => ({ value, label }));
  const ratio = SHAPES.find((s) => s.value === set.shape)?.ratio || "natural";
  const move = (i, dir) => setImages((ims) => {
    const j = i + dir;
    if (j < 0 || j >= ims.length) return ims;
    const next = [...ims];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const setFrame = (i, frame) => setImages((ims) => ims.map((im, j) => {
    if (j !== i) return im;
    const f = framingOf(frame);
    return f ? { ...im, frame: f } : { src: im.src };
  }));

  const done = () => {
    if (!count) { onClose(); return; }
    onInsert(pictureSetHtml(set));
    onClose();
  };

  const tabs = [
    { id: "content", label: "Content", icon: Images },
    { id: "shape", label: "Shape", icon: Square, dot: set.shape !== (set.layout === "inline" ? DEFAULTS.shape : "wide") || set.width !== DEFAULTS.width || set.corners !== DEFAULTS.corners },
  ];
  const title = editing ? (count > 1 ? "Pictures" : "Picture") : (count > 1 ? `Insert ${count} pictures` : "Insert a picture");

  return (
    <Drawer open modal={false} shouldScaleBackground={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh`, zIndex: 140 }}
        {...sheetPortalGuards} data-picture-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">Frame the pictures and choose how they show. Nothing changes until you tap {editing ? "Done" : "Insert"}.</DrawerDescription>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3" key={tab}>
          <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
            <div className="py-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 text-sm font-semibold truncate">{title}</p>
              {editing && onRemove && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More" title="More"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><MoreHorizontal className="w-4 h-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" data-picture-sheet="" style={{ zIndex: 150 }}>
                    <DropdownMenuItem className="text-destructive" onSelect={() => { onRemove(); onClose(); }}>
                      Take {count > 1 ? "them" : "it"} out of the text
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button type="button" onClick={done} disabled={!count || adding > 0}
                className="h-9 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground inline-flex items-center gap-1.5 disabled:opacity-40">
                <Check className="w-3.5 h-3.5" /> {editing ? "Done" : "Insert"}
              </button>
              <button type="button" aria-label="Cancel" title="Cancel" onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><X className="w-4 h-4" /></button>
            </div>
            <TabBar tabs={tabs} value={tab} onChange={(id) => { setTab(id); setFraming(null); }} />
          </div>

          <div className="pt-3">
            <Preview set={set} />
          </div>

          {tab === "content" && (
            <>
              <Group title="Pictures" first>
                {(draft.images || []).map((im, i) => (
                  <div key={`${i}:${im.src}`} className="border-b border-border/30">
                    <div className="flex items-center gap-2 py-1.5">
                      <Thumb src={im.src} frame={im.frame} />
                      <span className="flex-1 min-w-0 text-sm truncate">Picture {i + 1}{framingOf(im.frame) ? " · framed" : ""}</span>
                      <button type="button" onClick={() => setFraming(framing === i ? null : i)} aria-expanded={framing === i}
                        aria-label={`Frame picture ${i + 1}`} title="Frame: choose what stays in view"
                        className={`w-11 h-11 flex items-center justify-center rounded flex-shrink-0 ${framing === i || framingOf(im.frame) ? "text-foreground" : "text-muted-foreground"}`}>
                        <Crop className="w-4 h-4" />
                      </button>
                      {several && (
                        <>
                          <button type="button" onClick={() => { setFraming(null); move(i, -1); }} disabled={i === 0} aria-label={`Move picture ${i + 1} up`}
                            className="w-9 h-11 flex items-center justify-center rounded text-muted-foreground disabled:opacity-25"><ChevronUp className="w-4 h-4" /></button>
                          <button type="button" onClick={() => { setFraming(null); move(i, 1); }} disabled={i === draft.images.length - 1} aria-label={`Move picture ${i + 1} down`}
                            className="w-9 h-11 flex items-center justify-center rounded text-muted-foreground disabled:opacity-25"><ChevronDown className="w-4 h-4" /></button>
                        </>
                      )}
                      <button type="button" onClick={() => { setFraming(null); setImages((ims) => ims.filter((_, j) => j !== i)); }}
                        aria-label={`Leave out picture ${i + 1}`} title="Leave this one out"
                        className="w-11 h-11 flex items-center justify-center rounded text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                    </div>
                    {framing === i && (
                      <ImageFramer src={im.src} value={im.frame} onChange={(f) => setFrame(i, f)}
                        shape={set.shape === "circle" ? "circle" : "box"} ratio={ratio} label={`Picture ${i + 1}`} />
                    )}
                  </div>
                ))}
                {adding > 0 && (
                  <p className="py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding {adding} {adding === 1 ? "picture" : "pictures"}…
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="w-4 h-4" /> Add pictures
                  </button>
                  <AssetButton onPick={(src) => setImages((ims) => [...ims, { src }])} title="From your library" label="From your library" className={btn} />
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden
                    onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; addFiles(l); }} />
                </div>
                <p className="text-[0.6875rem] text-muted-foreground pt-1.5">Pick several at once. Tap the crop button to drag a picture into place.</p>
              </Group>
              {several && (
                <Group title="With several">
                  <ChoiceRow label="Show them" options={LAYOUTS} value={layout}
                    hint={layout === "slideshow" && count > MAX_SLIDES ? `A slideshow holds up to ${MAX_SLIDES} — these show as a carousel` : undefined}
                    onChange={(v) => patch({ layout: v })} />
                  {set.layout === "slideshow" && (
                    <SliderRow label="Seconds per picture" value={set.seconds} fallback={DEFAULTS.seconds} min={2} max={30} step={1} unit="s"
                      onChange={(v) => patch({ seconds: v })} />
                  )}
                </Group>
              )}
              <ResetRow label="Reset this tab" onReset={() => {
                setFraming(null);
                setDraft((d) => ({ ...d, layout: DEFAULTS.layout, seconds: DEFAULTS.seconds, images: (d.images || []).map((im) => ({ src: im.src })) }));
              }} />
            </>
          )}

          {tab === "shape" && (
            <>
              <Group title="Shape" first>
                <ChoiceRow label="Shape" options={shapeOptions} value={set.shape}
                  hint={set.layout !== "inline" ? "A carousel or slideshow keeps every picture the same shape" : undefined}
                  onChange={(v) => patch({ shape: v })} />
                <SliderRow label="Width" hint="Of the text's width" value={set.width} fallback={DEFAULTS.width} min={10} max={100} step={5} unit="%"
                  onChange={(v) => patch({ width: v })} />
                {set.shape !== "circle" && (
                  <SliderRow label="Corners" value={set.corners} fallback={DEFAULTS.corners} min={0} max={40} step={1} unit="px"
                    onChange={(v) => patch({ corners: v })} />
                )}
              </Group>
              <ResetRow label="Reset this tab" onReset={() => patch({ shape: DEFAULTS.shape, width: DEFAULTS.width, corners: DEFAULTS.corners })} />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
