import React, { useRef, useEffect, useCallback, useState } from "react";
import { ImagePlus, Loader2, Images } from "lucide-react";
import { toast } from "sonner";
import { MiniToolbar } from "@/components/shared/MiniToolbar";
import { saveLocalImage, createLocalImageUrl, compressImageDataUrl } from "@/lib/localImageStorage";
import AssetPickerModal from "@/components/shared/AssetPickerModal";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// The Plain bio editor: a contentEditable surface that renders formatting
// live. It now drives the SAME shared MiniToolbar the system chat uses —
// so the bio editor gets the identical toolbar (toggle-style bold/italic/
// headings/lists/align via execCommand, the 3-tier Basic/More/Fun layout,
// the "?" help legend, censor bar, internal-link picker, template-field
// pencil) instead of a separate bespoke toolbar. Image/GIF + asset inserts
// sit in their own row above it, mirroring the chat composer.
export default function WysiwygEditor({ value = "", onChange, placeholder = "Write here..." }) {
  const editorRef = useRef(null);
  const lastHtml = useRef(value);
  const imageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editorRef.current && value !== lastHtml.current) {
      editorRef.current.innerHTML = value || "";
      lastHtml.current = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  // Toggle-style formatting (bold/italic/headings/lists/align…) — flips the
  // browser's typing state so pressing Bold then typing keeps typing bold.
  const execCmd = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    try { document.execCommand(cmd, false, val); } catch { /* unsupported */ }
    emit();
  }, [emit]);

  // Wrap the current selection in markup (colours, fonts, sizes, effects,
  // censor, images…). MiniToolbar drives this through onInsert.
  const insertHTML = useCallback((before, after = "") => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      document.execCommand("insertHTML", false, `${before}${after}`);
    } else {
      const selectedText = sel.getRangeAt(0).toString();
      document.execCommand("insertHTML", false, `${before}${selectedText}${after}`);
    }
    emit();
  }, [emit]);

  // Direct image upload — stored in the local image store; drops an <img> at
  // the cursor. Animated GIFs stored raw; other formats compressed.
  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That doesn't look like an image file."); return; }
    setUploadingImage(true);
    try {
      const rawDataUrl = await fileToDataUrl(file);
      const isGif = file.type === "image/gif";
      const stored = isGif ? rawDataUrl : await compressImageDataUrl(rawDataUrl, 800, 0.85);
      const id = `bioimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(id, stored);
      const url = createLocalImageUrl(id);
      insertHTML(`<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:6px 0;" />`, "");
    } catch (err) {
      toast.error(err?.message || "Couldn't add that image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); execCmd("bold"); }
      if (k === "i") { e.preventDefault(); execCmd("italic"); }
      if (k === "u") { e.preventDefault(); execCmd("underline"); }
    }
  };

  return (
    <div className="rounded-xl border border-input bg-background overflow-hidden">
      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className="wysiwyg-content min-h-[200px] px-3 py-2.5 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none leading-relaxed"
      />

      {/* Image / GIF + asset row (mirrors the chat composer) */}
      <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10 border-t border-border/40">
        <button type="button" title="Insert image / GIF" disabled={uploadingImage}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
          className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
          {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
        </button>
        <button type="button" title="Insert from assets"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowAssetPicker(true)}
          className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0">
          <Images className="w-4 h-4" />
        </button>
        <span className="text-[0.625rem] text-muted-foreground/70 ml-1 truncate">Select text, then tap a style</span>
      </div>

      {/* Shared formatting toolbar (same as system chat) */}
      <MiniToolbar onInsert={insertHTML} onCommand={(cmd, val) => execCmd(cmd, val)} templateField />

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />

      {showAssetPicker && (
        <AssetPickerModal
          open
          onClose={() => setShowAssetPicker(false)}
          onSelect={(url) => {
            insertHTML(`<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:6px 0;" />`, "");
            setShowAssetPicker(false);
          }}
        />
      )}
    </div>
  );
}
