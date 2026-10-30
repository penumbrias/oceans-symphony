// Rows that frame a picture (v0.320.0 — every picture, not only an alter's).
// A record's picture frame is saved on the record (`image_framing`, keyed
// by the picture), so a picture framed here is framed the same on cards,
// bars, lists and every widget that shows it. See src/lib/imageFraming.js.
//
// - PictureFramingRow: for a form that holds the record until Save (the
//   new-alter sheet, the profile pencil form, group / contact / location
//   edit forms, Settings). Collapsed to one row with a "Frame it" button
//   until opened, so forms stay short.
// - RecordPictureFramer: saves straight onto the record (options sheets,
//   the picture pool).

import React, { useState } from "react";
import { toast } from "sonner";
import { Crop, X } from "lucide-react";
import { Row, StackedRow } from "@/components/shared/SettingRows";
import ImageFramer from "@/components/shared/ImageFramer";
import { framingFor, framingOf, setRecordImageFraming } from "@/lib/imageFraming";

const btn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 text-xs font-medium hover:bg-muted/50";

// `value` is the frame itself ({x,y,zoom} or null); `onChange(frame)` gets
// the cleaned frame (null = centred). `aspect` "wide" shows a banner-shaped
// preview; `shape` is the shape the picture shows in.
export function PictureFramingRow({ url, value, onChange, shape = "circle", aspect = "square", label = "Framing", hint, open: openProp, onOpenChange }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v) => { setOpenState(v); onOpenChange?.(v); };
  if (!url) return null;
  const framed = !!framingOf(value);
  if (!open) {
    return (
      <Row label={label} hint={hint} own={framed} onClear={framed ? () => onChange(null) : undefined}>
        <button type="button" onClick={() => setOpen(true)} className={btn} aria-expanded={false}>
          <Crop className="w-4 h-4" /> {framed ? "Change the framing" : "Frame it"}
        </button>
      </Row>
    );
  }
  return (
    <StackedRow label={label} hint={hint || "Which part of the picture stays in view, and how far it's zoomed in"}>
      <ImageFramer src={url} value={value} onChange={onChange} shape={shape} aspect={aspect} label={label} />
      <div className="flex justify-end pt-1">
        <button type="button" onClick={() => setOpen(false)} className={btn} aria-expanded={true}>
          <X className="w-4 h-4" /> Done
        </button>
      </div>
    </StackedRow>
  );
}

// Frames one of a record's pictures and saves straight onto the record.
// `entity` is the entity name; `refresh` runs after a save (invalidate the
// record's queries). Collapsible like PictureFramingRow unless `always`.
export function RecordPictureFramer({ entity, record, url, shape = "circle", aspect = "square", label = "Frame the picture", hint, refresh, always = false }) {
  const [open, setOpen] = useState(false);
  if (!record?.id || !url) return null;
  const save = async (frame) => {
    try {
      await setRecordImageFraming(entity, record.id, url, frame);
      refresh?.();
    } catch (e) { toast.error(e?.message || "Couldn't save the framing"); }
  };
  const value = framingFor(record, url);
  if (always) {
    return (
      <StackedRow label={label} hint={hint || "Saved with the picture, so it shows this way everywhere"}>
        <ImageFramer src={url} value={value} onChange={save} shape={shape} aspect={aspect} label={label} />
      </StackedRow>
    );
  }
  return <PictureFramingRow url={url} value={value} onChange={save} shape={shape} aspect={aspect} label={label} hint={hint} open={open} onOpenChange={setOpen} />;
}

