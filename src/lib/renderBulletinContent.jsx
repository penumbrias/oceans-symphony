import React from "react";
import { Link } from "react-router-dom";

// Tags allowed in bulletin/comment content. Anything else has its tags stripped
// while keeping the inner text. Inline styles are NOT preserved — bulletin
// formatting is intentionally minimal compared to alter-profile bios.
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "br", "p", "ul", "ol", "li", "a",
]);

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

function nodeToReact(node, alters, key) {
  if (node.nodeType === 3) {
    return renderTextWithMentions(node.textContent, alters, key);
  }
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((c, i) => nodeToReact(c, alters, `${key}-${i}`));
  if (!ALLOWED_TAGS.has(tag)) {
    // Strip the tag, keep its children inline.
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }
  if (tag === "br") return <br key={key} />;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const safe = /^(https?:|mailto:)/i.test(href) ? href : null;
    if (!safe) return <React.Fragment key={key}>{children}</React.Fragment>;
    return (
      <a key={key} href={safe} target="_blank" rel="noopener noreferrer" className="underline text-primary">
        {children}
      </a>
    );
  }
  return React.createElement(tag, { key }, children);
}

export function renderBulletinContent(content, alters = [], terms = null) {
  const processed = applyTerms(content, terms);
  if (typeof window === "undefined" || !window.DOMParser) {
    // SSR / no-DOM fallback: render as plain text with mentions.
    return renderTextWithMentions(processed, alters, "bn");
  }
  const doc = new DOMParser().parseFromString(`<div>${processed}</div>`, "text/html");
  const root = doc.body.firstChild;
  if (!root) return null;
  return Array.from(root.childNodes).map((n, i) => nodeToReact(n, alters, `bn-${i}`));
}
