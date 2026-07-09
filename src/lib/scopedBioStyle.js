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
// Never throws — on any parse anomaly it falls back to stripping <style>
// entirely (no leak, no animation) so a malformed bio can never brick a page.

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

function sanitizeDecls(body) {
  return body
    .split(";")
    .filter((d) => {
      const v = d.toLowerCase();
      return !(v.includes("javascript:") || v.includes("expression("));
    })
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

function transformRule(rule, scopeClass, renamed) {
  if (rule.statement) {
    if (/^@import/i.test(rule.prelude)) return ""; // drop remote imports
    return rule.prelude; // @charset etc.
  }
  const p = rule.prelude;
  if (/^@(-webkit-)?keyframes/i.test(p)) {
    const nm = p.replace(/^@(-webkit-)?keyframes\s+/i, "").trim();
    const newName = renamed[nm] || nm;
    const prefix = /-webkit-/i.test(p) ? "@-webkit-keyframes" : "@keyframes";
    return `${prefix} ${newName} {${rule.body}}`;
  }
  if (/^@(media|supports|document)/i.test(p)) {
    const inner = splitRules(rule.body).map((r) => transformRule(r, scopeClass, renamed)).filter(Boolean).join("\n");
    return `${p} {\n${inner}\n}`;
  }
  if (/^@font-face/i.test(p)) return `${p} {${rule.body}}`;
  if (p.startsWith("@")) return `${p} {${rule.body}}`; // unknown at-rule — keep verbatim
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
