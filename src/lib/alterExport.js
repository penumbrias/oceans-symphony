// Pure builder for the "Export members" feature — turns a chosen set of alters
// into a self-contained, printable/shareable HTML document (plus a plain-text
// version). No React, no network: the caller picks the alters + options and
// hands the result to shareFile()/clipboard. This is the heavy, manual, point-
// in-time sibling of the (future) light live in-app share — it can include rich
// bios and avatars because it never touches the relay.
//
// options:
//   detail: "basic" | "full"   — full adds bio + custom fields + groups
//   anonymize: bool            — replace name/alias with "Member N", drop bio +
//                                custom fields (keeps pronouns/role/age/colour)
//   includeAvatars: bool       — inline avatars from resolvedAvatars (data URLs)
//   resolvedAvatars: { [id]: url }
//   systemName, title

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html) {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || "").replace(/\s+\n/g, "\n").trim();
  }
  return String(html).replace(/<[^>]+>/g, "").trim();
}

function alterFields(a, i, opts, groupsById) {
  const anon = opts.anonymize;
  const name = anon ? `Member ${i + 1}` : (a.name || "Unnamed");
  const alias = anon ? "" : (a.alias || "");
  const meta = [a.pronouns, a.role, a.age != null && a.age !== "" ? `age ${a.age}` : ""].filter(Boolean);
  const groups = (!anon && opts.detail === "full")
    ? (Array.isArray(a.groups) ? a.groups.map((id) => groupsById[id]).filter(Boolean) : [])
    : [];
  const customFields = (!anon && opts.detail === "full" && a.alter_custom_fields)
    ? Object.entries(a.alter_custom_fields).filter(([, v]) => v != null && String(v).trim() !== "")
    : [];
  const bio = (!anon && opts.detail === "full") ? (a.description || "") : "";
  const avatar = opts.includeAvatars ? (opts.resolvedAvatars?.[a.id] || "") : "";
  return { name, alias, color: a.color || "", meta, groups, customFields, bio, avatar };
}

export function buildAlterListExportText({ alters = [], groupsById = {}, options = {} }) {
  const lines = [];
  const header = options.systemName ? `${options.systemName} — Members` : "Members";
  lines.push(header);
  lines.push("=".repeat(header.length));
  lines.push("");
  alters.forEach((a, i) => {
    const f = alterFields(a, i, options, groupsById);
    lines.push(f.alias ? `${f.name} (${f.alias})` : f.name);
    if (f.meta.length) lines.push(`  ${f.meta.join(" · ")}`);
    if (f.groups.length) lines.push(`  Groups: ${f.groups.join(", ")}`);
    f.customFields.forEach(([k, v]) => lines.push(`  ${k}: ${stripHtml(String(v))}`));
    if (f.bio) {
      const text = stripHtml(f.bio);
      if (text) lines.push(`  ${text.replace(/\n/g, "\n  ")}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

export function buildAlterListExportHtml({ alters = [], groupsById = {}, options = {} }) {
  const docTitle = options.title || (options.systemName ? `${esc(options.systemName)} — Members` : "Members");
  const cards = alters.map((a, i) => {
    const f = alterFields(a, i, options, groupsById);
    const swatch = f.color ? `background:${esc(f.color)}` : "background:#94a3b8";
    const avatarHtml = f.avatar
      ? `<img class="av" src="${esc(f.avatar)}" alt="" />`
      : `<span class="av av-fallback" style="${swatch}">${esc((f.name[0] || "?").toUpperCase())}</span>`;
    const metaHtml = f.meta.length ? `<p class="meta">${f.meta.map(esc).join(" &middot; ")}</p>` : "";
    const groupsHtml = f.groups.length
      ? `<p class="groups">${f.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</p>`
      : "";
    const cfHtml = f.customFields.length
      ? `<dl class="cf">${f.customFields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(stripHtml(String(v)))}</dd>`).join("")}</dl>`
      : "";
    // Bio is the user's own rich content going into a file they control; keep
    // it as HTML so formatting survives.
    const bioHtml = f.bio ? `<div class="bio">${f.bio}</div>` : "";
    return `<section class="card">
      <div class="head"><span class="bar" style="${swatch}"></span>${avatarHtml}
        <div class="who"><h2>${esc(f.name)}${f.alias ? ` <span class="alias">${esc(f.alias)}</span>` : ""}</h2>${metaHtml}</div>
      </div>
      ${groupsHtml}${cfHtml}${bioHtml}
    </section>`;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${docTitle}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #1e293b; line-height: 1.5; }
  .doc { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 0.85rem; margin: 0 0 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; position: relative; overflow: hidden; }
  .head { display: flex; align-items: center; gap: 12px; }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }
  .av { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
  .av-fallback { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1.2rem; }
  .who h2 { font-size: 1.15rem; margin: 0; }
  .alias { font-weight: 400; color: #64748b; font-size: 0.9rem; }
  .meta { margin: 2px 0 0; color: #475569; font-size: 0.85rem; }
  .groups { margin: 10px 0 0; }
  .chip { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 999px; padding: 2px 9px; font-size: 0.75rem; margin: 0 4px 4px 0; }
  .cf { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 10px 0 0; font-size: 0.85rem; }
  .cf dt { color: #64748b; font-weight: 600; }
  .cf dd { margin: 0; }
  .bio { margin: 10px 0 0; font-size: 0.92rem; }
  .bio img { max-width: 100%; height: auto; border-radius: 8px; }
  @media print { body { background: #fff; padding: 0; } .card { break-inside: avoid; } }
</style></head>
<body><div class="doc">
  <h1>${docTitle}</h1>
  <p class="sub">${alters.length} member${alters.length === 1 ? "" : "s"} &middot; exported from Oceans Symphony${options.anonymize ? " &middot; anonymized" : ""}</p>
  ${cards}
</div></body></html>`;
}
