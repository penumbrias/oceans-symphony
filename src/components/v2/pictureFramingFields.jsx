// Options-sheet rows that frame an alter's picture (v0.314.0). The frame
// is saved on the alter (Alter.image_framing, keyed by the picture), so a
// profile picture framed here is framed the same on cards, bars and every
// widget that shows it. The shared rows are in
// components/shared/PictureFramingRow.jsx (v0.322.0).

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RecordPictureFramer } from "@/components/shared/PictureFramingRow";
import { useInfoAlter } from "@/v2/infoWidgets";
import { refreshAlter } from "@/lib/alterEntry";

export { PictureFramingRow, RecordPictureFramer } from "@/components/shared/PictureFramingRow";

export function AlterPictureFramer({ alter, url, shape = "circle", label = "Frame the picture", hint, always = true, open, onOpenChange }) {
  const qc = useQueryClient();
  if (!alter || !url) return null;
  return (
    <RecordPictureFramer entity="Alter" record={alter} url={url} shape={shape} label={label} always={always} open={open} onOpenChange={onOpenChange}
      hint={hint || "Saved with the picture, so it shows this way everywhere"} refresh={() => refreshAlter(qc, alter.id)} />
  );
}

// The Identity widget's "Frame the picture": the alter's profile picture.
export function AvatarFramingField({ settings }) {
  const { alter } = useInfoAlter(settings);
  if (!alter?.avatar_url || settings?.showAvatar === false) return null;
  const hint = alter.avatar_rotation_mode && alter.avatar_rotation_mode !== "off"
    ? "This frames the main profile picture; each rotating picture keeps its own"
    : undefined;
  return <AlterPictureFramer alter={alter} url={alter.avatar_url} shape={settings?.avatarShape || "rounded"} hint={hint} />;
}
