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
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (dismissed) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      await doExport();
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-3 flex items-start gap-3 relative z-[60]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight">⚠️ App Outdated!</p>
        <p className="text-xs mt-0.5 leading-snug">
          Export your data, then import it at{" "}
          <a
            href="https://oceans-symphony.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold inline-flex items-center gap-0.5"
          >
            oceans-symphony.vercel.app <ExternalLink className="w-3 h-3" />
          </a>{" "}
          to use the most up-to-date version.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-1.5 bg-amber-900 text-amber-50 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {done ? "Exported! ✓" : loading ? "Exporting…" : "Export My Data"}
          </button>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 rounded hover:bg-amber-600/30 transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}