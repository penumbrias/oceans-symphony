// Turning text from other apps into a bio (v0.294.0).
//
// PluralKit, Simply Plural, Octocon, Plural Star and PluralSpace /
// OpenPlural all write member descriptions as markdown (with ![](url)
// pictures); people also paste HTML templates. These helpers turn either
// into the bio's own format. The converters moved here from BioEditor so
// the bio editor and the Alter info list share one copy.

import { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";

let _id = 0;
export const bioBlockId = () => `b_${Date.now()}_${_id++}`;
const uid = bioBlockId;

export function spInlineToHTML(text) {
  let h = text;
  h = h.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 4px;border-radius:3px;">$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(var(--primary));text-decoration:underline;">$1</a>');
  return h;
}

export function spBlockToHTML(text) {
  let h = text;
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^---+$/gm, '<hr />');
  h = h.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid hsl(var(--primary));margin:4px 0;padding:4px 12px;color:hsl(var(--muted-foreground));">$1</blockquote>');
  h = h.replace(/^    (.+)$/gm, '<pre style="overflow-x:auto;white-space:nowrap;background:hsl(var(--muted));padding:8px 12px;border-radius:6px;font-size:0.85em;">$1</pre>');
  h = spInlineToHTML(h);
  h = h.replace(/(^[-*] .+$(\n[-*] .+$)*)/gm, match => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul style="padding-left:1.5em;margin:4px 0;">${items}</ul>`;
  });
  h = h.replace(/(^\d+\. .+$(\n\d+\. .+$)*)/gm, match => {
    const items = match.split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol style="padding-left:1.5em;margin:4px 0;">${items}</ol>`;
  });
  h = h.replace(/\n/g, '<br />');
  return h;
}

export function convertSPToBlocks(rawText) {
  const blocks = [];
  const lines = rawText.split('\n');
  const IMG_RE = /!\[([^\]]*)\]\(([^)#)]+)(?:#(\d+)x(\d+))?\)/g;
  const extractImages = (line) => {
    const imgs = []; let m; IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(line)) !== null)
      imgs.push({ index: m.index, end: m.index + m[0].length, alt: m[1], src: m[2], w: m[3] ? parseInt(m[3]) : null, h: m[4] ? parseInt(m[4]) : null });
    return imgs;
  };
  const stripImages = (line) => line.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  const isBlankish = (line) => /^[\s\u3000\u00a0\u200b-\u200f\u202f\u2060\ufeff\u115f\u1160\u3164]*$/.test(line);
  const flushText = (textLines) => {
    const joined = textLines.join('\n').trim();
    if (joined && !isBlankish(joined))
      blocks.push({ id: uid(), type: "text", content: spBlockToHTML(joined) });
  };
  let pendingText = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const images = extractImages(line);
    if (images.length === 0) { pendingText.push(line); continue; }
    const textPart = stripImages(line);
    const hasText = textPart.length > 0 && !isBlankish(textPart);
    if (images.length === 1 && hasText) {
      flushText(pendingText); pendingText = [];
      const img = images[0];
      const beforeText = stripImages(line.slice(0, img.index));
      const afterText = stripImages(line.slice(img.end));
      const isRight = beforeText.length > 0 && !isBlankish(beforeText);
      blocks.push({ id: uid(), type: isRight ? "img-right" : "img-left", src: img.src, alt: img.alt, size: img.w || 120, cropped: false, text: spInlineToHTML(isRight ? beforeText : afterText) });
      continue;
    }
    flushText(pendingText); pendingText = [];

    // Collect the non-image prose from this multi-image line so it
    // doesn't get silently dropped. The previous behaviour was to
    // build a gallery from the images and discard everything else on
    // the same line — which is why a bio with `![A](url) **Rinn**
    // Frequent fronter...` came back as a 3-image gallery and no
    // text at all. Preserve the surrounding text as a separate
    // block emitted after the gallery (perfect inline layout fidelity
    // isn't possible once we collapse into a gallery, but the
    // CONTENT survives, which is what matters).
    const galleryTextSegments = [];
    const ownText = stripImages(line);
    if (ownText.length > 0 && !isBlankish(ownText)) galleryTextSegments.push(ownText);

    const galleryImages = images.map(img => ({ src: img.src, alt: img.alt, cropped: false }));
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextImgs = extractImages(next);
      if (nextImgs.length > 0 && isBlankish(stripImages(next))) {
        i++;
        galleryImages.push(...nextImgs.map(img => ({ src: img.src, alt: img.alt, cropped: false })));
      } else break;
    }
    if (galleryImages.length === 1) {
      const img = images[0];
      const w = img.w ? `${img.w}px` : '100%';
      const hStyle = img.h ? `height:${img.h}px;object-fit:cover;` : 'height:auto;';
      blocks.push({ id: uid(), type: "raw", content: `<img src="${img.src}" alt="${img.alt}" style="display:block;width:${w};${hStyle}border-radius:8px;margin:4px 0;" />` });
    } else {
      blocks.push({ id: uid(), type: "gallery", maxHeight: 160, images: galleryImages });
    }
    if (galleryTextSegments.length > 0) {
      blocks.push({ id: uid(), type: "text", content: spBlockToHTML(galleryTextSegments.join("\n")) });
    }
  }
  flushText(pendingText);
  return blocks.length ? blocks : [{ id: uid(), type: "text", content: "" }];
}

export const looksLikeHtml = (text) => /^\s*</.test(text || "");

// Add pasted text to the end of a bio — never replacing what is there.
// Plain markdown onto a plain bio stays plain rich text; an HTML template,
// pictures, or a bio that already uses blocks go through blocks, so the
// template's fill-in fields keep working (the same rule as the bio
// editor's Import and the template picker).
export function appendImportedText(current, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return current || "";
  const html = looksLikeHtml(trimmed);
  const incoming = html ? [{ id: uid(), type: "text", content: trimmed }] : convertSPToBlocks(trimmed);
  const existing = current || "";
  const plainAppend = !html && !existing.includes("data-blocks=") && incoming.every((b) => b.type === "text");
  if (plainAppend) {
    const added = incoming.map((b) => b.content).filter(Boolean).join("");
    return existing.trim() ? `${existing}<p></p>${added}` : added;
  }
  const blocks = existing.trim() ? htmlToBlocks(existing) : [];
  return blocksToHTML([...blocks, ...incoming]);
}
