import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isLocalImageUrl } from "@/lib/localImageStorage";
import { readAssetBlob, formatBytes, extForMime } from "@/lib/assetFiles";

// "Info" for one item in the Assets library: what the file is, how big, where
// it lives and whether it goes into backups. Read-only — looking never changes
// or re-saves the file. (From ShineSpark330's fork, adapted to our file store.)

const KIND_LABEL = { audio: "Audio", video: "Video", file: "File", image: "Picture" };

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Dimensions of a picture / video, or the length of audio, read from the file itself.
function probeElement(kind, url) {
  return new Promise((resolve) => {
    if (!url) { resolve({}); return; }
    const timer = setTimeout(() => resolve({}), 8000);
    const done = (v) => { clearTimeout(timer); resolve(v); };
    if (kind === "image") {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done({});
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => done({ duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0 });
    el.onerror = () => done({});
    el.src = url;
  });
}

async function loadDetails(item) {
  const info = {};
  const kind = item.kind || "image";
  const local = item.url && isLocalImageUrl(item.url);
  const blob = item.url ? await readAssetBlob(item.url) : null;
  if (blob) {
    info.mime = item.mime || blob.type || "";
    info.size = blob.size;
  }
  if (local) info.storage = blob ? "On this device — the app's file store" : "Not stored on this device";
  else if (item.url) {
    try { info.host = new URL(item.url, window.location.href).host; } catch { /* leave blank */ }
    info.storage = item.refOnly ? "In use on a profile, or built into the app" : "Linked from a web address";
  }
  if (item.asset?.created_date) info.added = item.asset.created_date;
  if (item.asset?.file_name) info.original = item.asset.file_name;

  let objectUrl = null;
  try {
    objectUrl = blob ? URL.createObjectURL(blob) : (local ? null : item.url);
    if (kind !== "file") Object.assign(info, await probeElement(kind, objectUrl));
  } finally {
    if (blob && objectUrl) URL.revokeObjectURL(objectUrl);
  }
  return info;
}

export default function AssetInfoDialog({ item, backupSkipped = false, onClose }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    loadDetails(item).then((v) => { if (alive) setInfo(v); }).catch(() => { if (alive) setInfo({}); });
    return () => { alive = false; };
  }, [item]);

  const kind = item.isGif ? "gif" : (item.kind || "image");
  const typeLabel = kind === "gif" ? "Animated picture (GIF)" : (KIND_LABEL[kind] || "File");
  const format = (info?.mime && (extForMime(info.mime) || info.mime.split("/")[1])) || "";

  const rows = [
    ["Name", item.name],
    info?.original && info.original !== item.name ? ["Original name", info.original] : null,
    ["Type", typeLabel],
    info?.mime ? ["Format", `${format ? format.toUpperCase() + " · " : ""}${info.mime}`] : null,
    info?.size ? ["Size", `${formatBytes(info.size)} (${info.size.toLocaleString()} bytes)`] : (item.size ? ["Size", formatBytes(item.size)] : null),
    info?.width && info?.height ? ["Dimensions", `${info.width} × ${info.height} px`] : null,
    info?.duration ? ["Length", formatDuration(info.duration)] : null,
    item.folder ? ["Folder", item.folder] : null,
    info?.storage ? ["Stored", info.storage] : null,
    info?.host ? ["From", info.host] : null,
    info?.added ? ["Added", formatDate(info.added)] : null,
    ["Backups", item.refOnly ? "Follows the profile it belongs to" : backupSkipped ? "Left out of backups (stays on this device only)" : "Included in backups"],
  ].filter(Boolean);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined} onClick={(e) => e.stopPropagation()}>
        <DialogTitle className="text-sm">File details</DialogTitle>
        {info === null ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Reading details…</div>
        ) : (
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-xs">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-border text-sm">Close</button>
      </DialogContent>
    </Dialog>
  );
}
