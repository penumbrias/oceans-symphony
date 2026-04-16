import React, { useState } from "react";
import { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";

export default function SimplePreview({ blocks, onBlockChange }) {
  const [editModal, setEditModal] = useState(null);
  const [editValue, setEditValue] = useState("");

  const getDisplayText = (html) => {
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
    return texts.join(" ");
  };

  const replaceDisplayText = (html, newText) => {
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
      textNodes[0].textContent = newText;
      for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = "";
    }
    return tmp.innerHTML;
  };

  const openEdit = (id, field, html) => {
    setEditModal({ id, field, html });
    setEditValue(getDisplayText(html));
  };

  const commitEdit = () => {
    if (editModal) {
      const updated = replaceDisplayText(editModal.html, editValue);
      onBlockChange(editModal.id, { [editModal.field]: updated });
      setEditModal(null);
    }
  };

  return (
    <>
      <div className="space-y-2 rounded-xl border border-input bg-background p-3 min-h-[200px]">
        {blocks.map(block => {
          if (block.type === "text") {
            return (
              <div key={block.id}
                onClick={() => openEdit(block.id, "content", block.content)}
                className="px-2 py-1 rounded-lg hover:bg-muted/30 cursor-text transition-colors min-h-[24px]"
                dangerouslySetInnerHTML={{ __html: block.content || '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit...</span>' }}
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
                <div onClick={() => openEdit(block.id, "text", block.text)}
                  className="flex-1 px-2 py-1 rounded-lg hover:bg-muted/30 cursor-text transition-colors min-h-[40px]"
                  dangerouslySetInnerHTML={{ __html: block.text || '<span style="opacity:0.4;font-size:0.875rem;font-style:italic;">Click to edit...</span>' }} />
              </div>
            );
          }

          const html = blocksToHTML([block]).replace(/^<div data-blocks="[^"]*">/, "").replace(/<\/div>$/, "");
          return <div key={block.id} dangerouslySetInnerHTML={{ __html: html }} />;
        })}
        {blocks.length === 0 && (
          <p className="text-muted-foreground text-sm italic px-1">No content yet. Switch to Blocks to add content.</p>
        )}
      </div>

      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80]">
          <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 w-full max-w-md mx-4 shadow-2xl">
            <p className="text-sm font-medium">Edit text</p>
            <textarea
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full min-h-[120px] px-3 py-2.5 rounded-xl border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed"
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