import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { blocksToHTML } from "@/components/shared/BlockEditor";
import { resolveImageUrl } from "@/lib/imageUrlResolver";

export default function SimplePreview({ blocks, onBlockChange, readOnly = false }) {
  const navigate = useNavigate();
  const [editModal, setEditModal] = useState(null);
  const [editValue, setEditValue] = useState("");
  // Map of local-image:// URL -> resolved data URL for rendering
  const [resolvedImages, setResolvedImages] = useState({});

  useEffect(() => {
    // Collect all image srcs from blocks that need resolution
    const srcs = new Set();
    for (const block of blocks) {
      if (block.src?.startsWith("local-image://")) srcs.add(block.src);
      if (block.images) block.images.forEach(i => { if (i.src?.startsWith("local-image://")) srcs.add(i.src); });
    }
    if (!srcs.size) return;
    let cancelled = false;
    Promise.all([...srcs].map(async url => {
      const resolved = await resolveImageUrl(url);
      return [url, resolved];
    })).then(pairs => {
      if (cancelled) return;
      setResolvedImages(prev => {
        const next = { ...prev };
        pairs.forEach(([url, resolved]) => { if (resolved) next[url] = resolved; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [blocks]);

  // Resolve a src for rendering (falls back to original if not yet resolved)
  const resolveSrc = (src) => (src?.startsWith("local-image://") ? resolvedImages[src] || "" : src);

  const handleClick = (e, block, field) => {
    // Check for internal link clicks (works in both read-only and edit mode)
    const linkEl = e.target.closest("[data-internal-link]");
    if (linkEl) {
      e.preventDefault();
      const route = linkEl.getAttribute("data-internal-link");
      if (route) navigate(route);
      return;
    }
    if (readOnly) return;
    // Only open editor when a [data-edit] span (template variable) is clicked
    const editSpan = e.target.closest("[data-edit]");
    if (editSpan) {
      setEditModal({ block, field, span: editSpan, mode: "span" });
      setEditValue(editSpan.textContent);
    }
    // Static template text outside spans is not editable here — clicking it does nothing
  };

  const commitEdit = () => {
    if (!editModal) return;
    const { block, field, span, mode } = editModal;
    const html = field === "content" ? block.content : block.text;

    if (mode === "span" && span) {
      // Replace just the text inside the specific data-edit span
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      // Find matching span by its original text content
      const spans = tmp.querySelectorAll("[data-edit]");
      for (const s of spans) {
        if (s.textContent === span.textContent) {
          s.textContent = editValue;
          break;
        }
      }
      onBlockChange(block.id, { [field]: tmp.innerHTML });
    }
    setEditModal(null);
  };

  return (
    <>
      {!readOnly && (
        <style>{`
          .sp-editable [data-edit] { cursor: pointer; text-decoration: underline; text-decoration-style: dotted; border-radius: 3px; padding: 0 2px; }
          .sp-editable [data-edit]:hover { background: rgba(99,102,241,0.12); }
        `}</style>
      )}
      <div className={readOnly ? "space-y-2" : "sp-editable space-y-2 rounded-xl border border-input bg-background p-3 min-h-[200px]"}>
        {blocks.map(block => {
          if (block.type === "text") {
            return (
              <div key={block.id}
                onClick={(e) => handleClick(e, block, "content")}
                className="px-2 py-1 rounded-lg min-h-[24px]"
                dangerouslySetInnerHTML={{ __html: block.content || (!readOnly ? '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Tap a field to edit…</span>' : '') }}
              />
            );
          }

          if (block.type === "img-left" || block.type === "img-right") {
            const isLeft = block.type === "img-left";
            return (
              <div key={block.id} className="flex gap-3 items-start"
                style={{ flexDirection: isLeft ? "row" : "row-reverse" }}>
                {block.src && (
                  <img src={resolveSrc(block.src)} alt={block.alt || ""}
                    style={block.cropped
                      ? { width: block.size || 120, height: block.size || 120, objectFit: "cover", borderRadius: 8, flexShrink: 0 }
                      : { width: block.size || 120, height: "auto", borderRadius: 8, flexShrink: 0 }} />
                )}
                <div onClick={(e) => handleClick(e, block, "text")}
                  className="flex-1 px-2 py-1 rounded-lg min-h-[40px]"
                  dangerouslySetInnerHTML={{ __html: block.text || (!readOnly ? '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Tap a field to edit…</span>' : '') }} />
              </div>
            );
          }

          if (block.type === "img-solo") {
            const align = block.align || "left";
            const marginStyle = align === "center"
              ? { marginLeft: "auto", marginRight: "auto" }
              : align === "right"
              ? { marginLeft: "auto", marginRight: 0 }
              : { marginLeft: 0, marginRight: "auto" };
            return (
              <div key={block.id} style={{ margin: "8px 0", width: "100%" }}>
                <img src={resolveSrc(block.src)} alt={block.alt || ""}
                  style={{ display: "block", width: block.size || 240, height: block.cropped ? block.size || 240 : "auto", objectFit: block.cropped ? "cover" : undefined, borderRadius: 8, maxWidth: "100%", ...marginStyle }} />
              </div>
            );
          }

          // gallery block — render with resolved srcs
          if (block.type === "gallery") {
            const images = (block.images || []).filter(i => i.src);
            const maxH = block.maxHeight || 160;
            return (
              <div key={block.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "8px 0", flexWrap: "wrap" }}>
                {images.map((img, idx) => (
                  <img key={idx} src={resolveSrc(img.src)} alt={img.alt || ""}
                    style={img.cropped
                      ? { height: maxH, width: maxH, objectFit: "cover", borderRadius: 8, flexShrink: 0 }
                      : { maxHeight: maxH, width: "auto", height: "auto", borderRadius: 8, flexShrink: 0 }} />
                ))}
              </div>
            );
          }

          // fallback for divider / raw / unknown — strip script tag before rendering
          const rawHtml = blocksToHTML([block]);
          const html = rawHtml.replace(/<script[^>]+data-blocks-json[^>]*>[\s\S]*?<\/script>/g, "")
            .replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
          return (
            <div key={block.id}
              onClick={(e) => !readOnly && handleClick(e, block, "content")}
              style={{ width: "100%" }}
              dangerouslySetInnerHTML={{ __html: html }} />
          );
        })}
        {blocks.length === 0 && !readOnly && (
          <p className="text-muted-foreground text-sm italic px-1">No content yet. Switch to Blocks to add content.</p>
        )}
      </div>

      {!readOnly && editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80]">
          <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 w-full max-w-md mx-4 shadow-2xl">
            <p className="text-sm font-medium">
              {editModal.mode === "span" ? "Edit field" : "Edit text"}
            </p>
            <textarea
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2.5 rounded-xl border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed"
              spellCheck={true}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80">
                Cancel
              </button>
              <button type="button" onClick={commitEdit}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}