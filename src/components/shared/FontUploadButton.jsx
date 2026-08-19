// Upload a custom font from ANY font picker (v0.194.1) — the same
// pipeline Settings → Appearance uses (CustomFont record + local blob +
// refreshCustomFontFaces), packaged as a small button so every font
// SearchableSelect can sit next to one. New fonts appear in every picker
// via the shared ["customFonts"] query.
import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { saveLocalFont, fileToDataUrl, sniffFontFormat, MAX_FONT_SIZE_BYTES } from "@/lib/localFontStorage";
import { refreshCustomFontFaces, customFontFamilyCss } from "@/lib/customFontFaces";
import { isNative } from "@/lib/platform";

export default function FontUploadButton({ onUploaded, className = "" }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const processFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_FONT_SIZE_BYTES) { toast.error("Font files must be 5MB or smaller."); return; }
    setBusy(true);
    try {
      const format = await sniffFontFormat(file);
      if (!format) { toast.error("That doesn't look like a valid font file (.ttf/.otf/.woff/.woff2)."); return; }
      const dataUrl = await fileToDataUrl(file);
      const displayName = (file.name || "Custom font").replace(/\.[^.]+$/, "");
      const record = await base44.entities.CustomFont.create({
        display_name: displayName, format,
        mime: file.type || `font/${format}`, size_bytes: file.size,
      });
      await saveLocalFont(record.id, dataUrl);
      await refreshCustomFontFaces();
      qc.invalidateQueries({ queryKey: ["customFonts"] });
      toast.success(`"${displayName}" uploaded`);
      onUploaded?.(customFontFamilyCss(record.id));
    } catch (e) {
      toast.error(e?.message || "Couldn't upload that font");
    } finally { setBusy(false); }
  };

  const pick = async () => {
    if (isNative()) {
      try {
        const { FilePicker } = await import("@capawesome/capacitor-file-picker");
        const res = await FilePicker.pickFiles({ readData: true });
        const picked = res?.files?.[0];
        if (!picked) return;
        const byteChars = atob(picked.data);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        await processFile(new File([bytes], picked.name || "font", { type: picked.mimeType || "" }));
      } catch (e) { toast.error(e?.message || "Couldn't open the file picker"); }
    } else {
      inputRef.current?.click();
    }
  };

  return (
    <>
      <button type="button" onClick={pick} disabled={busy} aria-label="Upload a font" title="Upload a font (.ttf/.otf/.woff/.woff2)"
        className={className || "h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0 disabled:opacity-50"}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
      </button>
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden
        onChange={(e) => { processFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
