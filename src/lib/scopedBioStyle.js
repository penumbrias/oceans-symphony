// Per-profile CSS scoping for user bios / descriptions.
//
// Bios can contain <style> blocks with @keyframes so a profile can animate.
// Injected raw, that CSS leaks to the whole app and one profile's keyframes
// can collide with another's. scopeBioStyles() makes bio CSS safe AND makes it
// actually render on the profile page:
//   1. extract every <style> block out of the HTML,
//   2. prefix every selector with a per-profile wrapper class,
//   3. rename @keyframes (and their animation references) per profile,
//   4. hand back the scoped CSS to inject once + the body HTML with <style>
//      removed. The caller wraps the body in `.${scopeClass}`.
//
// Hardening (July 2026): selector scoping alone does NOT contain everything —
// `position: fixed/sticky` still positions against the viewport (a bio could
// overlay the app chrome), huge z-index stacks above real UI, and `url()`
// values fire network requests (remote images/fonts leak the viewer's IP and
// are the classic CSS-exfiltration channel). So every declaration is also
// filtered: fixed/sticky dropped, z-index clamped, url() allowlisted to
// local/bundled resources only, @import/@namespace dropped, oversized styles
// stripped entirely. sanitizeInlineStyleAttrs() applies the same declaration
// filter to inline style="" attributes (which bypass <style> scoping
// completely) — SimplePreview runs it on every rendered block.
//
// Never throws — on any parse anomaly it falls back to stripping <style>
// entirely (no leak, no animation) so a malformed bio can never brick a page.

// Cap on the combined size of a bio's <style> CSS. Beyond this we strip
// styles rather than risk performance bombs (the body still renders).
const MAX_BIO_STYLE_BYTES = 65536;

// Highest z-index a bio may use. App chrome (nav, modals, toasts) lives far
// above this, so a bio can layer its own elements but never cover real UI.
const MAX_BIO_Z_INDEX = 10;

// url() targets a bio is allowed to reference: locally stored images (both
// URL schemes), inline data images, and same-document SVG fragments. No
// remote hosts — bios are offline-first and must not phone home.
const ALLOWED_URL_RE = /^(\/local-image\/|local-image:\/\/|data:image\/|#)/i;

function sanitizeIdent(id) {
  let s = String(id || "x").replace(/[^A-Za-z0-9_-]/g, "-");
  if (!/^[A-Za-z]/.test(s)) s = "s" + s;
  return s;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }

function stripStyles(html) { return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ""); }

function extractStyles(html) {
  const styles = [];
  const bodyHtml = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { styles.push(css); return ""; });
  return { styles, bodyHtml };
}

// Split a CSS string into top-level rules by brace matching. Each rule is
// { prelude, body } or { prelude, statement: true } for block-less at-rules.
function splitRules(css) {
  const rules = [];
  let i = 0, start = 0, depth = 0, preludeEnd = -1;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) preludeEnd = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) depth--;
      if (depth === 0 && preludeEnd >= 0) {
        rules.push({ prelude: css.slice(start, preludeEnd).trim(), body: css.slice(preludeEnd + 1, i) });
        start = i + 1;
        preludeEnd = -1;
      }
    } else if (ch === ";" && depth === 0) {
      const stmt = css.slice(start, i + 1).trim();
      if (stmt) rules.push({ prelude: stmt, statement: true });
      start = i + 1;
    }
    i++;
  }
  return rules;
}

function scopeSelectorList(prelude, scopeClass) {
  return prelude
    .split(",")
    .map((part) => {
      const s = part.trim();
      if (!s) return null;
      if (/^(:root|html|body)$/i.test(s)) return "." + scopeClass;
      return "." + scopeClass + " " + s;
    })
    .filter(Boolean)
    .join(", ");
}

// Neutralise every url() whose target isn't on the local allowlist by
// replacing it with an empty url() (invalid → the browser drops that value).
// Runs on the whole declaration body BEFORE any ";"-splitting, because URLs
// legally contain semicolons (data:image/png;base64,…) and http URLs may too
// — a per-fragment check could be smuggled past by a ";" inside the URL.
function filterUrls(cssText) {
  return cssText.replace(/url\(\s*(['"]?)([^)]*)\1\s*\)/gi, (full, _q, target) =>
    ALLOWED_URL_RE.test(String(target).trim()) ? full : "url()"
  );
}

// Per-declaration filter. `decl` is one ";"-separated fragment (URLs have
// already been vetted at the body level by filterUrls).
function declAllowed(decl) {
  const v = decl.toLowerCase();
  if (v.includes("javascript:") || v.includes("expression(")) return false;
  const idx = decl.indexOf(":");
  if (idx === -1) return true;
  const prop = decl.slice(0, idx).trim().toLowerCase();
  // Scoping a selector does not contain fixed/sticky positioning — it still
  // anchors to the viewport, letting a bio overlay app chrome. Drop it.
  if (prop === "position" && /\b(fixed|sticky)\b/i.test(decl.slice(idx + 1))) return false;
  return true;
}

// Clamp z-index so bio content can self-layer but never stack above app UI.
function clampZIndex(decl) {
  const idx = decl.indexOf(":");
  if (idx === -1) return decl;
  if (decl.slice(0, idx).trim().toLowerCase() !== "z-index") return decl;
  const n = parseInt(decl.slice(idx + 1), 10);
  if (Number.isFinite(n) && n > MAX_BIO_Z_INDEX) return `${decl.slice(0, idx)}: ${MAX_BIO_Z_INDEX}`;
  return decl;
}

function sanitizeDecls(body) {
  return filterUrls(body)
    .split(";")
    .filter(declAllowed)
    .map(clampZIndex)
    .join(";");
}

function rewriteAnimations(body, renamed) {
  const names = Object.keys(renamed);
  if (!names.length) return body;
  return body
    .split(";")
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) return decl;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      if (prop === "animation" || prop === "animation-name" || prop === "-webkit-animation" || prop === "-webkit-animation-name") {
        let val = decl.slice(idx + 1);
        for (const [oldN, newN] of Object.entries(renamed)) {
          val = val.replace(new RegExp(`\\b${escapeRe(oldN)}\\b`, "g"), newN);
        }
        return decl.slice(0, idx) + ":" + val;
      }
      return decl;
    })
    .join(";");
}

// At-rules whose body contains nested RULES (not declarations) — recurse so
// the inner rules get scoped + sanitized instead of passing through raw.
const CONTAINER_AT_RULE_RE = /^@(media|supports|document|container|layer|scope)\b/i;

function transformRule(rule, scopeClass, renamed) {
  if (rule.statement) {
    // @import loads remote CSS; @namespace can warp selector matching.
    if (/^@(import|namespace)/i.test(rule.prelude)) return "";
    return rule.prelude; // @charset etc.
  }
  const p = rule.prelude;
  if (/^@(-webkit-)?keyframes/i.test(p)) {
    const nm = p.replace(/^@(-webkit-)?keyframes\s+/i, "").trim();
    const newName = renamed[nm] || nm;
    const prefix = /-webkit-/i.test(p) ? "@-webkit-keyframes" : "@keyframes";
    // Keyframe steps are declaration blocks — run them through the same
    // declaration filter (url() allowlist etc.) via a nested pass.
    const inner = splitRules(rule.body)
      .map((r) => (r.statement ? r.prelude : `${r.prelude} {${sanitizeDecls(r.body)}}`))
      .join("\n");
    return `${prefix} ${newName} {${inner}}`;
  }
  if (CONTAINER_AT_RULE_RE.test(p)) {
    const inner = splitRules(rule.body).map((r) => transformRule(r, scopeClass, renamed)).filter(Boolean).join("\n");
    return `${p} {\n${inner}\n}`;
  }
  if (/^@font-face/i.test(p)) {
    // Keep local (data:) font faces; the url() allowlist strips remote
    // sources, leaving any remote-only @font-face inert.
    return `${p} {${sanitizeDecls(rule.body)}}`;
  }
  // Unknown bodied at-rules (@property, @counter-style, @page, …) would
  // bypass scoping entirely — drop them rather than leak.
  if (p.startsWith("@")) return "";
  return `${scopeSelectorList(p, scopeClass)} {${rewriteAnimations(sanitizeDecls(rule.body), renamed)}}`;
}

// Map every @keyframes name in the CSS to a per-scope name.
function buildRenameMap(css, scopeClass) {
  const kfNames = new Set();
  const kfRe = /@(?:-webkit-)?keyframes\s+([A-Za-z_][\w-]*)/g;
  let m;
  while ((m = kfRe.exec(css))) kfNames.add(m[1]);
  const renamed = {};
  for (const n of kfNames) renamed[n] = `${scopeClass}-${n}`;
  return renamed;
}

function scopeCss(css, scopeClass, renamed) {
  return splitRules(css).map((r) => transformRule(r, scopeClass, renamed)).filter(Boolean).join("\n");
}

// Rewrite `animation` / `animation-name` references inside inline style="…"
// attributes so bios that animate via an inline style (very common in
// hand-written HTML) point at the renamed @keyframes, not the old global name.
export function rewriteInlineAnimations(html, renamed) {
  if (!Object.keys(renamed).length) return html;
  return html.replace(/style\s*=\s*("([^"]*)"|'([^']*)')/gi, (full, _q, dq, sq) => {
    const isDq = dq != null;
    const val = isDq ? dq : sq;
    const quote = isDq ? '"' : "'";
    return `style=${quote}${rewriteAnimations(val, renamed)}${quote}`;
  });
}

// Apply the declaration filter (position:fixed/sticky, z-index clamp, url()
// allowlist, javascript:/expression()) to every inline style="" attribute.
// Inline styles never pass through <style> scoping, so without this a bio
// could overlay app chrome or beacon out with a single style attribute.
// Fail-closed: entity-encoded url targets won't match the allowlist and are
// neutralised. Never throws.
export function sanitizeInlineStyleAttrs(html) {
  if (!html || typeof html !== "string" || !/style\s*=/i.test(html)) return html || "";
  try {
    return html.replace(/style\s*=\s*("([^"]*)"|'([^']*)')/gi, (full, _q, dq, sq) => {
      const isDq = dq != null;
      const val = isDq ? dq : sq;
      const quote = isDq ? '"' : "'";
      return `style=${quote}${sanitizeDecls(val)}${quote}`;
    });
  } catch {
    return html;
  }
}

// html + scopeId → { scopeClass, styleCss, bodyHtml, renamed }.
// `renamed` is the @keyframes rename map so callers that render blocks
// individually (e.g. SimplePreview) can rewrite each block's inline animation
// references too.
export function scopeBioStyles(html, scopeId) {
  const scopeClass = "bio-scope-" + sanitizeIdent(scopeId);
  if (!html || typeof html !== "string" || !/<style/i.test(html)) {
    return { scopeClass, styleCss: "", bodyHtml: html || "", renamed: {} };
  }
  try {
    const { styles, bodyHtml } = extractStyles(html);
    const css = stripComments(styles.join("\n"));
    if (css.length > MAX_BIO_STYLE_BYTES) {
      // Style bomb — render the body, drop the styles.
      return { scopeClass, styleCss: "", bodyHtml, renamed: {} };
    }
    const renamed = buildRenameMap(css, scopeClass);
    const styleCss = scopeCss(css, scopeClass, renamed);
    return { scopeClass, styleCss, bodyHtml: rewriteInlineAnimations(bodyHtml, renamed), renamed };
  } catch {
    return { scopeClass, styleCss: "", bodyHtml: stripStyles(html), renamed: {} };
  }
}

// True if the HTML carries any <style> block (cheap gate for callers).
export function bioHasStyle(html) {
  return typeof html === "string" && /<style/i.test(html);
}
