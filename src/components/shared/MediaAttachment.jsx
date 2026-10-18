import React, { useRef } from "react";
import { File as FileIcon, Film, Music, Loader2 } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { createLocalImageUrl } from "@/lib/localImageStorage";
import { formatBytes } from "@/lib/assetFiles";
import { useMediaTuning } from "@/lib/mediaTuning";
import MediaPlayer from "@/components/shared/MediaPlayer";
import MediaTuningPanel from "@/components/shared/MediaTuningPanel";

// An attached file inside a message / bulletin / comment: a video or audio
// player (play, seek, loop, full screen) with a tempo & pitch panel, or a file
// card. Always the ORIGINAL bytes — tempo and pitch only change how it plays
// right now. Rendered from the inert <div data-media-id="…"> placeholder (see
// renderBulletinContent.jsx); the id is the file's key in the local file store.

export default function MediaAttachment({ id, kind: kindHint, name: nameHint, size: sizeHint }) {
  const kind = kindHint || "file";
  const playable = kind === "video" || kind === "audio";
  const url = useResolvedAvatarUrl(id ? createLocalImageUrl(id) : null);
  const mediaRef = useRef(null);
  const tuning = useMediaTuning(mediaRef, id);
  const name = nameHint || "file";
  const size = Number(sizeHint) || 0;
  const Icon = kind === "video" ? Film : kind === "audio" ? Music : FileIcon;

  if (playable && url) {
    return (
      <div className="my-1.5 w-full max-w-md rounded-xl border border-border/50 bg-muted/20 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
        <MediaPlayer mediaRef={mediaRef} src={url} kind={kind} tuning={tuning} />
        <MediaTuningPanel tuning={tuning} />
        <p className="text-[0.6875rem] text-muted-foreground min-w-0 truncate">{name}{size ? ` · ${formatBytes(size)}` : ""}</p>
      </div>
    );
  }

  if (playable && !url) {
    // Still resolving, or not on this device: the resolver retries a few
    // times, so show a quiet "loading" line that names the file either way.
    return (
      <div className="my-1.5 inline-flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        <span className="min-w-0 break-words">{name}{size ? ` (${formatBytes(size)})` : ""} — loading. If it never loads, it isn&apos;t stored on this device.</span>
      </div>
    );
  }

  // Any other file: a simple card. Saving it lives in Assets.
  return (
    <div className="my-1.5 inline-flex max-w-full items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <Icon className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-[0.6875rem] text-muted-foreground">{size ? `${formatBytes(size)} · ` : ""}original file · save it from Assets</p>
      </div>
    </div>
  );
}
