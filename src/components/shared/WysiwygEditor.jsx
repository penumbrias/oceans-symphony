import { createPortal } from "react-dom";
import React, { useRef, useEffect, useCallback, useState } from "react";

import { toast } from "sonner";
import { MiniToolbar } from "@/components/shared/MiniToolbar";
import { saveLocalImage, createLocalImageUrl, compressImageDataUrl } from "@/lib/localImageStorage";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import ImageInsertPreview from "@/components/shared/ImageInsertPreview";
import { scopeBioStyles } from "@/lib/scopedBioStyle";
import useDockHeightVar from "@/hooks/useDockHeightVar";

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
// floatingToolbar: true = always dock above the keyboard; false = always
// inline; "auto" (default) = dock on touch devices (where an on-screen
// keyboard will cover an inline toolbar), inline on pointer devices.
export default function WysiwygEditor({ value = "", onChange, placeholder = "Write here...", floatingToolbar = "auto" }) {
  const touchDevice = typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  const floatResolved = floatingToolbar === true || (floatingToolbar === "auto" && touchDevice);
  // floatingToolbar: the formatting rows leave the editor's own box and
  // dock in a fixed bar just above the on-screen keyboard while the
  // editor is focused — for hosts where inline rows eat the space (the
  // notebook widget). visualViewport tracks the keyboard height.
  const editorRef = useRef(null);
  const lastHtml = useRef(value);
  const imageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  // An image waiting in the preview/size dialog before it's inserted.
  const [pendingImage, setPendingImage] = useState(null);
  // A bio's <style> must NOT apply globally while it's being edited. Keep the
  // raw <style> out of the contentEditable and inject a SCOPED copy into a
  // sibling instead; reattach the raw text on emit so the value round-trips.
  const styleTextRef = useRef("");
  const [scopedCss, setScopedCss] = useState("");

  const applyValue = useCallback((html) => {
    const raw = html || "";
    // Split <style> out of the EDITABLE body (kept verbatim in styleTextRef and
    // reattached on emit, so the saved bio round-trips unchanged) and inject a
    // scoped copy into a sibling so the CSS can't leak to the app.
    const styles = [];
    const body = raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (mm) => { styles.push(mm); return ""; });
    styleTextRef.current = styles.join("");
    const { styleCss } = scopeBioStyles(raw, "wysiwyg-live");
    if (editorRef.current) editorRef.current.innerHTML = body;
    setScopedCss(styleCss || "");
  }, []);

  useEffect(() => {
    applyValue(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editorRef.current && value !== lastHtml.current) {
      applyValue(value);
      lastHtml.current = value;
    }
  }, [value, applyValue]);

  const emit = useCallback(() => {
    const body = editorRef.current?.innerHTML ?? "";
    const full = body + (styleTextRef.current || "");
    lastHtml.current = full;
    onChange(full);
  }, [onChange]);

  // Toggle-style formatting (bold/italic/headings/lists/align…) — flips the
  // browser's typing state so pressing Bold then typing keeps typing bold.
  const execCmd = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    // Emit CSS spans (<span style="color:…">) instead of legacy <font> tags so
    // colour/font survive the content sanitiser and stack on the same text.
    try { document.execCommand("styleWithCSS", false, true); } catch { /* unsupported */ }
    try { document.execCommand(cmd, false, val); } catch { /* unsupported */ }
    emit();
  }, [emit]);

  // Clear formatting. With a selection: strip every inline style/element in
  // it. With just a cursor: hop OUT of every styled inline ancestor (colour
  // spans, gradients, bold runs) so typing continues plain — execCommand's
  // removeFormat is a no-op without a selection, which is why the old
  // eraser "did nothing" mid-typing. What's already written is untouched.
  const clearFormatting = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    const hasRange = sel && sel.rangeCount > 0;
    if (hasRange && !sel.getRangeAt(0).collapsed) {
      try { document.execCommand("removeFormat"); } catch { /* unsupported */ }
      try { document.execCommand("unlink"); } catch { /* unsupported */ }
      emit();
      return;
    }
    if (hasRange) {
      const INLINE = /^(SPAN|FONT|B|I|U|S|STRONG|EM|SUB|SUP|CODE|A|MARK|SMALL|BIG)$/;
      const range = sel.getRangeAt(0);
      let cur = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
      let top = null;
      while (cur && cur !== ed && INLINE.test(cur.nodeName)) { top = cur; cur = cur.parentNode; }
      if (top && top.parentNode) {
        // A zero-width anchor right after the styled run gives the caret an
        // unstyled home; typing from here is plain.
        const marker = document.createTextNode("\u200b");
        top.parentNode.insertBefore(marker, top.nextSibling);
        const r = document.createRange();
        r.setStart(marker, 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    // Toggle states (bold etc.) persist independently of the DOM position.
    for (const c of ["bold", "italic", "underline", "strikeThrough", "superscript", "subscript"]) {
      try { if (document.queryCommandState(c)) document.execCommand(c); } catch { /* unsupported */ }
    }
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
      // Preview + size choice first — never a blind insert.
      setPendingImage(url);
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

  // Floating mode: visible while the editable has focus; pointerdown on the
  // bar preventDefaults so tapping a style never blurs the editor.
  const [focused, setFocused] = useState(false);
  // True while one of the toolbar's own modals (link picker, colour modal,
  // help) is open. Those steal focus by design — the dock must stay mounted
  // through it or the modal unmounts with it the instant it opens.
  const [toolbarModal, setToolbarModal] = useState(false);
  const [kbBottom, setKbBottom] = useState(0);
  const dockRef = useRef(null);
  // Last touch on the dock — read by the blur handler's race guard above.
  const dockTouchAt = useRef(0);
  useDockHeightVar(dockRef, floatResolved && (focused || toolbarModal));
  useEffect(() => {
    if (!floatResolved) return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setKbBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    on();
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); };
  }, [floatResolved]);

  return (
    <div className="overflow-hidden"
      style={{
        borderRadius: "var(--v2-radius, 0.75rem)",
        borderWidth: "var(--v2-border-w, 1px)",
        borderStyle: "var(--v2-border-style, solid)",
        borderColor: "var(--v2-border-color, hsl(var(--input)))",
        background: "var(--v2-widget-bg, hsl(var(--background)))",
      }}>
      {/* Scoped copy of the bio's own <style> — applies only inside the editor,
          never to the rest of the app. */}
      {scopedCss && <style>{scopedCss}</style>}
      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delayed: a tap on the floating bar preventDefaults, so focus
          // never actually leaves — this only fires on a real blur.
          // RESIDUAL RACE (#304): some Android WebViews blur the editor
          // despite the dock's preventDefault. If the dock unmounts here
          // the tapped button dies BEFORE its click lands — the link
          // picker "immediately disappeared" and formatting buttons did
          // nothing. So when the blur follows a touch on the dock, keep
          // re-checking for up to ~1s: the click either opens a toolbar
          // modal (toolbarModal holds the dock) or the command re-focuses
          // the editor. Only then concede it was a real leave.
          const check = (attempt) => {
            if (document.activeElement === editorRef.current) return;
            if (attempt < 8 && Date.now() - dockTouchAt.current < 1000) {
              setTimeout(() => check(attempt + 1), 120);
              return;
            }
            setFocused(false);
          };
          setTimeout(() => check(0), 120);
        }}
        data-placeholder={placeholder}
        className="wysiwyg-content bio-scope-wysiwyg-live min-h-[200px] px-3 py-2.5 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none leading-relaxed"
      />

      {/* Image / GIF + asset row + the shared formatting toolbar. Inline by
          default; in floating mode they dock above the keyboard instead. */}
      {(() => {
        const rows = (
          <MiniToolbar onInsert={insertHTML} onCommand={(cmd, val) => execCmd(cmd, val)} templateField
            onImage={() => imageInputRef.current?.click()}
            onAssets={() => setShowAssetPicker(true)}
            mediaBusy={uploadingImage}
            onClearFormat={clearFormatting}
            onModalChange={setToolbarModal} />
        );
        if (!floatResolved) return rows;
        if (!focused && !toolbarModal) return null;
        return createPortal(
          <div
            ref={dockRef}
            className="fixed left-0 right-0 z-[130] bg-card border-t border-border/60 shadow-[0_-4px_16px_rgb(0_0_0/0.25)]"
            // With the keyboard up, dock right above it. With the keyboard
            // CLOSED but the editor still focused, sit above the bottom
            // chrome instead — bottom:0 painted the toolbar OVER the nav
            // bar and key row (owner screenshot, "UI got kinda weird").
            style={{ bottom: kbBottom > 40 ? kbBottom : "calc(var(--v2-bottom-chrome-h, var(--bottom-nav-height, 56px)) + var(--os-sab, 0px))" }}
            // Keep the editor focused (and the selection alive) while
            // tapping anything on the bar. The timestamp feeds the blur
            // handler's race guard — WebViews that blur ANYWAY get the
            // dock held up long enough for the tap's click to land.
            onPointerDown={(e) => { dockTouchAt.current = Date.now(); e.preventDefault(); }}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={() => { dockTouchAt.current = Date.now(); }}
          >
            {rows}
          </div>,
          document.body
        );
      })()}

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />

      {showAssetPicker && (
        <AssetPickerModal
          open
          onClose={() => setShowAssetPicker(false)}
          onSelect={(url) => {
            setShowAssetPicker(false);
            setPendingImage(url);
          }}
        />
      )}

      {pendingImage && (
        <ImageInsertPreview
          url={pendingImage}
          onInsert={(html) => insertHTML(html, "")}
          onClose={() => setPendingImage(null)}
        />
      )}
    </div>
  );
}
