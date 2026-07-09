import React from "react";
import { Link } from "react-router-dom";
import { effectiveAlias } from "@/lib/alterLabel";

// Tags allowed in bulletin/comment content. The base set keeps simple
// posts minimal; the rich set (used when a post was written in the
// bulletin composer's "fancy" mode, but applied to ANY post that
// contains these tags) adds headings, styled spans/divs, quotes, code,
// and images so the styling toolbar + image/GIF upload show up.
//
// SECURITY: this renderer sanitises every tag/attribute — inline `style`
// values are scrubbed of url()/javascript:/expression(), and <img src> is
// restricted to local images and http(s)/data:image. Tags outside the
// allowlist are stripped (their inner text is kept). It renders the user's
// OWN rich / imported HTML (bulletins, chat, comments) — content is not
// shared between systems today, so this is stored-content hygiene rather
// than untrusted-remote-content defence.
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "br", "p", "ul", "ol", "li", "a",
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
// Convert Discord-style ||spoiler|| markers into a censor span. The bar is
// styled by the global `.spoiler` CSS and revealed on tap by the delegated
// handler in AppLayout. Applied by every rich renderer so the syntax works
// everywhere it's typed (bios, bulletins, chat).
export function spoilersToHtml(content) {
  if (!content || typeof content !== "string") return content || "";
  return content.replace(/\|\|([^|]+?)\|\|/g, '<span class="spoiler">$1</span>');
}

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

// Tokenises a plain-text run into @mentions, markdown links [text](url), bare
// http(s) URLs, and plain text — rendering each appropriately. Runs on TEXT
// NODES only (the HTML parser has already decoded entities + separated real
// tags), so the regexes are safe. This is why typing `[label](https://…)` or a
// bare URL into a post just works, in addition to the toolbar's link button.
// The mention alternative is built per-call from the alters list so non-word
// @-tokens (emoji aliases like "@😀", symbol/multi-word aliases) highlight too
// — \w+ alone can't match them.
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function renderTextWithMentions(text, alters, baseKey) {
  if (!text) return null;
  const altersByName = Object.fromEntries(alters.map((a) => [a.name, a]));
  const altersByAlias = Object.fromEntries(alters.filter((a) => a.alias).map((a) => [a.alias, a]));
  // Non-word @-tokens (emoji aliases, symbol/multi-word aliases) — \w+ can't
  // match these, so collect the in-use ones and add them as explicit, escaped
  // regex alternatives. Mirrors the @-tokens mentionUtils.extractMentionedIds
  // counts, so the highlight matches what actually registers as a mention.
  const altersByExtra = {};
  for (const a of alters) {
    for (const tok of [a.name, a.alias, effectiveAlias(a)]) {
      const v = (tok || "").trim();
      if (v && /[^\p{L}\p{N}_]/u.test(v) && !(v in altersByExtra)) altersByExtra[v] = a;
    }
  }
  const extraAlt = Object.keys(altersByExtra).sort((x, y) => y.length - x.length).map(escapeRegExp).join("|");
  const mentionPart = extraAlt ? `@(?:${extraAlt}|\\w+)` : "@\\w+";
  const TOKEN_RE = new RegExp(`(\\[[^\\]\\n]+\\]\\(https?:\\/\\/[^\\s)]+\\))|(\\bhttps?:\\/\\/[^\\s<]+)|(${mentionPart})`, "g");

  const out = [];
  let last = 0;
  let m;
  let i = 0;
  TOKEN_RE.lastIndex = 0;
  const linkCls = "underline text-primary break-words";
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push(<React.Fragment key={`${baseKey}-t${i}`}>{text.slice(last, m.index)}</React.Fragment>);
    const [full, mdLink, bareUrl, mention] = m;
    if (mdLink) {
      const lm = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(mdLink);
      out.push(<a key={`${baseKey}-l${i}`} href={lm[2]} target="_blank" rel="noopener noreferrer" className={linkCls}>{lm[1]}</a>);
    } else if (bareUrl) {
      // Don't swallow trailing sentence punctuation into the URL.
      const trail = bareUrl.match(/[.,!?;:)\]]+$/);
      const url = trail ? bareUrl.slice(0, -trail[0].length) : bareUrl;
      out.push(<a key={`${baseKey}-u${i}`} href={url} target="_blank" rel="noopener noreferrer" className={linkCls}>{url}</a>);
      if (trail) out.push(<React.Fragment key={`${baseKey}-tp${i}`}>{trail[0]}</React.Fragment>);
    } else if (mention) {
      const name = mention.slice(1).trim();
      const alter = altersByName[name] || altersByAlias[name] || altersByExtra[name];
      if (alter) {
        out.push(
          <Link key={`${baseKey}-m${i}`} to={`/alter/${alter.id}`}>
            <span className="font-semibold rounded px-0.5" style={{ color: alter.color || "hsl(var(--primary))" }}>{mention}</span>
          </Link>
        );
      } else {
        out.push(<React.Fragment key={`${baseKey}-m${i}`}>{mention}</React.Fragment>);
      }
    }
    last = m.index + full.length;
    i++;
  }
  if (last < text.length) out.push(<React.Fragment key={`${baseKey}-t${i}`}>{text.slice(last)}</React.Fragment>);
  return out;
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
    // Internal app links from the link picker carry their route in
    // `data-internal-link` (no href); a plain relative href ("/…") is also
    // treated as in-app. Either renders as a router <Link> so it actually
    // navigates instead of collapsing to plain text. `//` (protocol-relative)
    // is NOT in-app.
    const internal = node.getAttribute("data-internal-link") || "";
    const href = node.getAttribute("href") || "";
    const route = /^\/(?!\/)/.test(internal) ? internal : (/^\/(?!\/)/.test(href) ? href : null);
    if (route) {
      return <Link key={key} to={route} className="underline text-primary">{children}</Link>;
    }
    const safe = /^(https?:|mailto:)/i.test(href) ? href : null;
    if (!safe) return <React.Fragment key={key}>{children}</React.Fragment>;
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
  // Preserve the whitelisted "spoiler" / "whisper" classes so censor bars
  // and whispers survive (class is otherwise dropped). Safe — a class name
  // can't execute anything. The whisper carries its recipient names in a
  // data-* attribute that the CSS label reads.
  const cls = node.getAttribute("class") || "";
  if (/\bwhisper\b/.test(cls)) {
    props.className = "whisper";
    const forNames = node.getAttribute("data-whisper-for");
    if (forNames != null) props["data-whisper-for"] = forNames;
  } else if (/\bspoiler\b/.test(cls)) {
    props.className = "spoiler";
  } else if (/\blog-chip\b/.test(cls)) {
    // Inline "~command" quick-log chip baked into stored content. Preserve the
    // class + data-* so the .log-chip CSS pill renders. Inert — just a label.
    props.className = "log-chip";
    const lt = node.getAttribute("data-log-type");
    if (lt != null) props["data-log-type"] = lt;
    const eid = node.getAttribute("data-entity-id");
    if (eid != null) props["data-entity-id"] = eid;
  }
  return React.createElement(tag, props, children);
}

// Generic rich renderer: walks the (sanitised) HTML and renders each text
// node through the supplied `renderText(textString, key)` callback — so
// each surface (bulletins, chat) can plug in its own @mention highlighter
// while sharing the tag allowlist, style sanitisation, and <img> safety.
export function renderRichContent(content, { renderText, terms = null } = {}) {
  const processed = spoilersToHtml(applyTerms(content, terms));
  const rt = renderText || ((text, key) => <React.Fragment key={key}>{text}</React.Fragment>);
  if (typeof window === "undefined" || !window.DOMParser) {
    return rt(processed, "rc");
  }
  const doc = new DOMParser().parseFromString(`<div>${processed}</div>`, "text/html");
  const root = doc.body.firstChild;
  if (!root) return null;
  return Array.from(root.childNodes).map((n, i) => nodeToReact(n, `rc-${i}`, rt));
}

// `isRich` (default true for back-compat): when false, the content is plain
// text — escape it and convert newlines to <br> so paragraph/line breaks
// survive (otherwise the HTML parser collapses them into one run). Rich content
// already carries its own block/break markup.
function escapeHtmlForBreaks(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br>");
}

// Detects whether a string actually contains one of our recognised HTML tags
// (opening, closing, or self-closing). Content from imports (Ampersand),
// preview data, or older posts often carries real markup like <b>…</b> WITHOUT
// the is_rich flag being set — escaping it would show the raw tags. If a
// recognised tag is present we render it as rich regardless of the flag, which
// matches the documented intent ("the rich set … applied to ANY post that
// contains these tags"). Plain text with a stray "<" ("a < b", "<3", "x > y")
// has no tag name after the "<", so it stays plain and gets escaped.
const HTML_TAG_RE = /<\/?(?:b|strong|i|em|u|s|strike|br|p|ul|ol|li|a|h1|h2|h3|blockquote|code|sup|sub|hr|span|div|img)\b[^>]*>/i;

export function contentLooksRich(content) {
  return typeof content === "string" && HTML_TAG_RE.test(content);
}

export function renderBulletinContent(content, alters = [], terms = null, { isRich = true } = {}) {
  const treatAsRich = isRich || contentLooksRich(content);
  const prepared = treatAsRich ? content : escapeHtmlForBreaks(content);
  return renderRichContent(prepared, {
    terms,
    renderText: (text, key) => renderTextWithMentions(text, alters, key),
  });
}
