// Pure builders for the "Export members" feature — HTML, plain text, and PDF
// for a chosen set of alters with granular field selection, an anonymize
// option, and optional grouping by group/subsystem. No network: the caller
// picks the alters + options and hands the result to shareFile()/clipboard.
//
// options:
//   detail: "basic" | "full"   — full adds bio + custom fields + groups
//   anonymize: bool            — name/alias → "Member N", drops bio + custom
//                                fields (keeps pronouns/role/age/colour)
//   includeAvatars: bool       — inline avatars from resolvedAvatars (HTML only)
//   resolvedAvatars: { [id]: url }
//   groupBy: "none" | "group"  — section the export by each alter's first group
//   systemName, title
// jsPDF is dynamically imported inside buildAlterListPdf so it stays out of the
// main bundle (only loaded when someone actually exports a PDF).

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [148, 163, 184];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Per-alter field bundle. `index` is the alter's GLOBAL position (for stable
// anonymized "Member N" labels across grouped sections).
function alterFields(a, index, opts, groupsById) {
  const anon = opts.anonymize;
  const name = anon ? `Member ${index + 1}` : (a.name || "Unnamed");
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
  return { id: a.id, alter: a, name, alias, color: a.color || "", meta, groups, customFields, bio, avatar };
}

// Prepare + (optionally) section the rows. Returns [{ title|null, rows }].
function buildSections(alters, options, groupsById) {
  const rows = alters.map((a, i) => alterFields(a, i, options, groupsById));
  if (options.groupBy !== "group") return [{ title: null, rows }];
  const byTitle = new Map();
  const order = [];
  for (const row of rows) {
    const gid = (Array.isArray(row.alter.groups) && row.alter.groups[0]) || null;
    const title = gid ? (groupsById[gid] || "Group") : "Ungrouped";
    if (!byTitle.has(title)) { byTitle.set(title, []); order.push(title); }
    byTitle.get(title).push(row);
  }
  order.sort((a, b) => (a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b)));
  return order.map((t) => ({ title: t, rows: byTitle.get(t) }));
}

export function buildAlterListExportText({ alters = [], groupsById = {}, options = {} }) {
  const lines = [];
  const header = options.systemName ? `${options.systemName} — Members` : "Members";
  lines.push(header, "=".repeat(header.length), "");
  for (const section of buildSections(alters, options, groupsById)) {
    if (section.title) { lines.push(`— ${section.title} —`, ""); }
    for (const f of section.rows) {
      lines.push(f.alias ? `${f.name} (${f.alias})` : f.name);
      if (f.meta.length) lines.push(`  ${f.meta.join(" · ")}`);
      if (f.groups.length) lines.push(`  Groups: ${f.groups.join(", ")}`);
      f.customFields.forEach(([k, v]) => lines.push(`  ${k}: ${stripHtml(String(v))}`));
      if (f.bio) { const t = stripHtml(f.bio); if (t) lines.push(`  ${t.replace(/\n/g, "\n  ")}`); }
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

export function buildAlterListExportHtml({ alters = [], groupsById = {}, options = {} }) {
  const docTitle = options.title || (options.systemName ? `${esc(options.systemName)} — Members` : "Members");
  const cardFor = (f) => {
    const swatch = f.color ? `background:${esc(f.color)}` : "background:#94a3b8";
    const avatarHtml = f.avatar
      ? `<img class="av" src="${esc(f.avatar)}" alt="" />`
      : `<span class="av av-fallback" style="${swatch}">${esc((f.name[0] || "?").toUpperCase())}</span>`;
    const metaHtml = f.meta.length ? `<p class="meta">${f.meta.map(esc).join(" &middot; ")}</p>` : "";
    const groupsHtml = f.groups.length ? `<p class="groups">${f.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</p>` : "";
    const cfHtml = f.customFields.length ? `<dl class="cf">${f.customFields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(stripHtml(String(v)))}</dd>`).join("")}</dl>` : "";
    const bioHtml = f.bio ? `<div class="bio">${f.bio}</div>` : "";
    return `<section class="card">
      <div class="head"><span class="bar" style="${swatch}"></span>${avatarHtml}
        <div class="who"><h2>${esc(f.name)}${f.alias ? ` <span class="alias">${esc(f.alias)}</span>` : ""}</h2>${metaHtml}</div>
      </div>${groupsHtml}${cfHtml}${bioHtml}
    </section>`;
  };
  const body = buildSections(alters, options, groupsById).map((section) => {
    const cards = section.rows.map(cardFor).join("\n");
    return section.title ? `<h2 class="group-h">${esc(section.title)}</h2>${cards}` : cards;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${docTitle}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #1e293b; line-height: 1.5; }
  .doc { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .group-h { font-size: 1.05rem; margin: 22px 0 8px; color: #4338ca; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
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
  ${body}
</div></body></html>`;
}

// Real PDF via jsPDF — text-laid-out + paginated. Returns a Blob. Async: jsPDF
// is dynamically imported so it only loads when a PDF is actually requested.
export async function buildAlterListPdf({ alters = [], groupsById = {}, options = {} }) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 16, PAGE_W = 210, PAGE_H = 297, CW = PAGE_W - M * 2;
  let y = M;
  const ensure = (h) => { if (y + h > PAGE_H - M) { doc.addPage(); y = M; } };

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(30, 41, 59);
  doc.text(options.systemName ? `${options.systemName} — Members` : "Members", M, y + 2); y += 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 130, 145);
  doc.text(`${alters.length} member${alters.length === 1 ? "" : "s"} · exported from Oceans Symphony${options.anonymize ? " · anonymized" : ""}`, M, y); y += 8;

  for (const section of buildSections(alters, options, groupsById)) {
    if (section.title) {
      ensure(10);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(67, 56, 202);
      doc.text(section.title, M, y); y += 6;
    }
    for (const f of section.rows) {
      ensure(12);
      const [r, g, b] = hexToRgb(f.color);
      doc.setFillColor(r, g, b); doc.circle(M + 1.6, y - 1.4, 1.6, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(30, 41, 59);
      doc.text(`${f.name}${f.alias ? ` (${f.alias})` : ""}`, M + 5, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90, 100, 115);
      const metaLine = [...f.meta, ...(f.groups.length ? [`Groups: ${f.groups.join(", ")}`] : [])].join("   ·   ");
      if (metaLine) { for (const ln of doc.splitTextToSize(metaLine, CW - 5)) { ensure(4.5); doc.text(ln, M + 5, y); y += 4.5; } }
      for (const [k, v] of f.customFields) {
        for (const ln of doc.splitTextToSize(`${k}: ${stripHtml(String(v))}`, CW - 5)) { ensure(4.5); doc.text(ln, M + 5, y); y += 4.5; }
      }
      if (f.bio) {
        const bio = stripHtml(f.bio);
        if (bio) { doc.setTextColor(60, 70, 85); for (const ln of doc.splitTextToSize(bio, CW - 5)) { ensure(4.5); doc.text(ln, M + 5, y); y += 4.5; } }
      }
      y += 4;
    }
  }
  return doc.output("blob");
}
