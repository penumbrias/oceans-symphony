import React from "react";
import { Link } from "react-router-dom";

// Tags allowed in bulletin/comment content. The base set keeps simple
// posts minimal; the rich set (used when a post was written in the
// bulletin composer's "fancy" mode, but applied to ANY post that
// contains these tags) adds headings, styled spans/divs, quotes, code,
// and images so the styling toolbar + image/GIF upload show up.
//
// SECURITY: this renderer also displays bulletins received from FRIENDS,
// so every tag/attribute is sanitised — inline `style` values are scrubbed
// of url()/javascript:/expression(), and <img src> is restricted to local
// images and http(s)/data:image. Tags outside the allowlist are stripped
// (their inner text is kept).
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "br", "p", "ul", "ol", "li", "a",
  // rich additions
  "h1", "h2", "h3", "blockquote", "code", "sup", "sub", "hr", "span", "div", "img",
]);

// Convert a CSS declaration string into a React style object, dropping any
// declaration whose value could exfiltrate or execute (url(), javascript:,
// expression(), @import). Vendor prefixes are camel-cased the way React
// expects (-webkit-background-clip → WebkitBackgroundClip) so gradient text
// keeps working.
function cssStringToStyleObject(styleStr) {
  if (!styleStr || typeof styleStr !== "string") return undefined;
  const obj = {};
  for (const decl of styleStr.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    const lower = val.toLowerCase();
    if (lower.includes("url(") || lower.includes("javascript:") || lower.includes("expression(") || lower.includes("@import")) continue;
    const parts = prop.split("-").filter(Boolean);
    const camel = parts
      .map((p, i) => (i === 0 && !["webkit", "moz", "ms", "o"].includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
    obj[camel] = val;
  }
  return Object.keys(obj).length ? obj : undefined;
}

// Term placeholders authors can drop into bulletin content so a system that
// renames "alter" to e.g. "headmate" still reads correctly.
function applyTerms(content, terms) {
  if (!terms || !content) return content || "";
  const map = {
    "{alter}": terms.alter, "{Alter}": terms.Alter,
    "{alters}": terms.alters, "{Alters}": terms.Alters,
    "{system}": terms.system, "{System}": terms.System,
    "{front}": terms.front, "{Front}": terms.Front,
    "{fronting}": terms.fronting, "{Fronting}": terms.Fronting,
    "{fronter}": terms.fronter, "{Fronter}": terms.Fronter,
    "{fronters}": terms.fronters, "{Fronters}": terms.Fronters,
    "{switch}": terms.switch, "{Switch}": terms.Switch,
    "{switches}": terms.switches, "{Switches}": terms.Switches,
  };
  return content.replace(/\{[A-Za-z]+\}/g, (m) => map[m] ?? m);
}

function renderTextWithMentions(text, alters, baseKey) {
  if (!text) return null;
  const altersByName = Object.fromEntries(alters.map((a) => [a.name, a]));
  const altersByAlias = Object.fromEntries(alters.filter((a) => a.alias).map((a) => [a.alias, a]));
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const mention = part.slice(1).trim();
      const alter = altersByName[mention] || altersByAlias[mention];
      if (alter) {
        return (
          <Link key={`${baseKey}-${i}`} to={`/alter/${alter.id}`}>
            <span className="font-semibold rounded px-0.5" style={{ color: alter.color || "hsl(var(--primary))" }}>{part}</span>
          </Link>
        );
      }
    }
    return <React.Fragment key={`${baseKey}-${i}`}>{part}</React.Fragment>;
  });
}

function nodeToReact(node, key, renderText) {
  if (node.nodeType === 3) {
    return renderText(node.textContent, key);
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((c, i) => nodeToReact(c, `${key}-${i}`, renderText));
  if (!ALLOWED_TAGS.has(tag)) {
    // Strip the tag, keep its children inline.
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }
  if (tag === "br") return <br key={key} />;
  if (tag === "hr") return <hr key={key} className="my-2 border-border/60" />;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const safe = /^(https?:|mailto:|\/)/i.test(href) ? href : null;
    if (!safe) return <React.Fragment key={key}>{children}</React.Fragment>;
    // Internal app links (start with "/") stay in-app; external open in a tab.
    if (safe.startsWith("/")) {
      return <Link key={key} to={safe} className="underline text-primary">{children}</Link>;
    }
    return (
      <a key={key} href={safe} target="_blank" rel="noopener noreferrer" className="underline text-primary">
        {children}
      </a>
    );
  }
  if (tag === "img") {
    const src = node.getAttribute("src") || "";
    const safe = /^(\/local-image\/|https?:|data:image\/)/i.test(src);
    if (!safe) return null;
    const styleObj = cssStringToStyleObject(node.getAttribute("style")) || {};
    return (
      <img
        key={key}
        src={src}
        alt={node.getAttribute("alt") || ""}
        loading="lazy"
        style={{ maxWidth: "100%", height: "auto", borderRadius: 8, display: "block", margin: "6px 0", ...styleObj }}
      />
    );
  }
  const styleObj = cssStringToStyleObject(node.getAttribute("style"));
  const props = { key };
  if (styleObj) props.style = styleObj;
  return React.createElement(tag, props, children);
}

// Generic rich renderer: walks the (sanitised) HTML and renders each text
// node through the supplied `renderText(textString, key)` callback — so
// each surface (bulletins, chat) can plug in its own @mention highlighter
// while sharing the tag allowlist, style sanitisation, and <img> safety.
export function renderRichContent(content, { renderText, terms = null } = {}) {
  const processed = applyTerms(content, terms);
  const rt = renderText || ((text, key) => <React.Fragment key={key}>{text}</React.Fragment>);
  if (typeof window === "undefined" || !window.DOMParser) {
    return rt(processed, "rc");
  }
  const doc = new DOMParser().parseFromString(`<div>${processed}</div>`, "text/html");
  const root = doc.body.firstChild;
  if (!root) return null;
  return Array.from(root.childNodes).map((n, i) => nodeToReact(n, `rc-${i}`, rt));
}

export function renderBulletinContent(content, alters = [], terms = null) {
  return renderRichContent(content, {
    terms,
    renderText: (text, key) => renderTextWithMentions(text, alters, key),
  });
}
