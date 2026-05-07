import React, { useState } from "react";
import { Download, X, Loader2, ExternalLink } from "lucide-react";
import { getFullDbDump } from "@/lib/localDb";
import { getAllLocalImages } from "@/lib/localImageStorage";
import pako from "pako";

function compressBackup(data) {
  const json = JSON.stringify(data);
  const compressed = pako.deflate(json);
  let binary = "";
  compressed.forEach(b => binary += String.fromCharCode(b));
  return "SYMPHONYZ:" + btoa(binary);
}

async function doExport() {
  const dump = getFullDbDump();
  let images = {};
  try { images = await getAllLocalImages(); } catch {}
  const exportData = {
    __format: "symphony_backup",
    __version: 1,
    __exported_at: new Date().toISOString(),
    data: dump,
    __local_images: images,
  };
  const compressed = compressBackup(exportData);
  const blob = new Blob([compressed], { type: "application/octet-stream" });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `symphony-backup-${date}.json`;

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/octet-stream" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Oceans Symphony Backup" }); return; } catch {}
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function AnnouncementBanner() {
  return null;
}