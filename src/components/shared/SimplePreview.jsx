import React, { useState } from "react";
import { blocksToHTML } from "@/components/shared/BlockEditor";

export default function SimplePreview({ blocks, onBlockChange, readOnly = false }) {
  const [editModal, setEditModal] = useState(null);
  const [editValue, setEditValue] = useState("");

  const handleClick = (e, block, field) => {
    if (readOnly) return;
    // Check if a data-edit span was clicked
    const editSpan = e.target.closest("[data-edit]");
    if (editSpan) {
      setEditModal({ block, field, span: editSpan, mode: "span" });
      setEditValue(editSpan.textContent);
      return;
    }
    // Otherwise edit all visible text
    const html = field === "content" ? block.content : block.text;
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
    const texts = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.tagName !== "STYLE" && node.parentElement?.tagName !== "SCRIPT") {
        const t = node.textContent.trim();
        if (t) texts.push(t);
      }
    }
    setEditModal({ block, field, mode: "full" });
    setEditValue(texts.join(" "));
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
    } else {
      // Replace all visible text nodes
      const tmp = document.createElement("div");
      tmp.innerHTML = html || "";
      const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.tagName !== "STYLE" && node.parentElement?.tagName !== "SCRIPT") {
          if (node.textContent.trim()) textNodes.push(node);
        }
      }
      if (textNodes.length > 0) {
        textNodes[0].textContent = editValue;
        for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = "";
      }
      onBlockChange(block.id, { [field]: tmp.innerHTML });
    }
    setEditModal(null);
  };

  return (
    <>
      <div className={readOnly ? "space-y-2" : "space-y-2 rounded-xl border border-input bg-background p-3 min-h-[200px]"}>
        {blocks.map(block => {
          if (block.type === "text") {
            return (
              <div key={block.id}
                onClick={(e) => handleClick(e, block, "content")}
                className={`px-2 py-1 rounded-lg transition-colors min-h-[24px] ${!readOnly ? "hover:bg-muted/30 cursor-text" : ""}`}
                dangerouslySetInnerHTML={{ __html: block.content || (!readOnly ? '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit...</span>' : '') }}
              />
            );
          }

          if (block.type === "img-left" || block.type === "img-right") {
            const isLeft = block.type === "img-left";
            return (
              <div key={block.id} className="flex gap-3 items-start"
                style={{ flexDirection: isLeft ? "row" : "row-reverse" }}>
                {block.src && (
                  <img src={block.src} alt={block.alt || ""}
                    style={block.cropped
                      ? { width: block.size || 120, height: block.size || 120, objectFit: "cover", borderRadius: 8, flexShrink: 0 }
                      : { width: block.size || 120, height: "auto", borderRadius: 8, flexShrink: 0 }} />
                )}
                <div onClick={(e) => handleClick(e, block, "text")}
                  className={`flex-1 px-2 py-1 rounded-lg transition-colors min-h-[40px] ${!readOnly ? "hover:bg-muted/30 cursor-text" : ""}`}
                  dangerouslySetInnerHTML={{ __html: block.text || (!readOnly ? '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit...</span>' : '') }} />
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
                <img src={block.src} alt={block.alt || ""}
                  style={{ display: "block", width: block.size || 240, height: block.cropped ? block.size || 240 : "auto", objectFit: block.cropped ? "cover" : undefined, borderRadius: 8, maxWidth: "100%", ...marginStyle }} />
              </div>
            );
          }

          const html = blocksToHTML([block]).replace(/^<div data-blocks="[^"]*" style="[^"]*">/, "").replace(/^<div data-blocks="[^"]*">/, "").replace(/<\/div>$/, "");
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