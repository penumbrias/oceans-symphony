// Options-sheet rows that frame an alter's picture (v0.314.0). The frame
// is saved on the alter (Alter.image_framing, keyed by the picture), so a
// profile picture framed here is framed the same on cards, bars and every
// widget that shows it. See src/lib/imageFraming.js.

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StackedRow } from "@/components/shared/SettingRows";
import ImageFramer from "@/components/shared/ImageFramer";
import { useInfoAlter } from "@/v2/infoWidgets";
import { refreshAlter } from "@/lib/alterEntry";
import { framingFor, setAlterImageFraming } from "@/lib/imageFraming";

export function AlterPictureFramer({ alter, url, shape = "circle", label = "Frame the picture", hint }) {
  const qc = useQueryClient();
  if (!alter || !url) return null;
  const save = async (frame) => {
    try {
      await setAlterImageFraming(alter.id, url, frame);
      refreshAlter(qc, alter.id);
    } catch (e) { toast.error(e?.message || "Couldn't save the framing"); }
  };
  return (
    <StackedRow label={label} hint={hint || "Saved with the picture, so it shows this way everywhere"}>
      <ImageFramer src={url} value={framingFor(alter, url)} onChange={save} shape={shape} label={label} />
    </StackedRow>
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
