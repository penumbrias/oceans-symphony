// The kit's content blocks (new house step 1.3): row, card, stat and the
// alter chip.
//
//   <Row title="Walk by the river" subtitle="Today, 9:30 pm" lead={<HouseIcon icon={Footprints} />}
//     meta="45 min" onClick={open} selected={id === openId} />
//   <Card title="This week" tools={<Menu … />} footer={…}>…</Card>
//   <Stat label="Check-ins this week" value={12} change="+3 on last week" />
//   <AlterChip alter={alter} />                 one person (name in the label mode)
//   <AlterChips alters={fronters} max={3} />    a co-front; the rest fold into "+4"
//
// Row: one line of meaning, wrapping (never cut). With `onClick` it is a
// button (or a link with `href`); without, plain content. Selected shows a
// bar AND bold words, not colour only. Rows hold no buttons of their own
// when they are buttons; put row actions in `trailing` only on a static row.
//
// AlterChip: the avatar through useResolvedAvatarUrl (so legacy
// local-image:// pictures show), the name through useAlterLabel (the
// person's name / alias / both setting), and the alter's own colour as a
// ring drawn in a readable shade of it (3:1 on the panel). Long names wrap
// inside the chip; the chip never pushes the page sideways.

import React from "react";
import { Link } from "react-router-dom";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useHouse } from "@/house/tokens/HouseRoot";
import { onFill, readableOnAll } from "@/house/tokens/contrast";
import { overflowSplit, namesWords } from "@/house/kit/lists";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

const HEX = /^#[0-9a-f]{6}$/i;

// ── Row ───────────────────────────────────────────────────────────────
export function Row({ title, subtitle, meta, lead, trailing, onClick, href, selected = false, disabledReason, highlightId, className = "" }) {
  const body = (
    <>
      {lead ? <span className="hk-row-lead">{lead}</span> : null}
      <span className="hk-row-text">
        <span className="hk-row-title">{title}</span>
        {subtitle ? <span className="hk-row-sub">{subtitle}</span> : null}
        {disabledReason ? <span className="hk-row-sub">{disabledReason}</span> : null}
      </span>
      {meta ? <span className="hk-row-meta">{meta}</span> : null}
    </>
  );
  const common = {
    className: `hk-row ${className}`,
    "data-selected": selected || undefined,
    "data-highlight-id": highlightId,
  };
  if (href && !disabledReason) {
    return <Link to={href} {...common} aria-current={selected ? "page" : undefined}>{body}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" {...common} aria-current={selected ? "true" : undefined} aria-disabled={disabledReason ? true : undefined}
        onClick={(e) => { if (disabledReason) return; onClick(e); }}>
        {body}
      </button>
    );
  }
  return (
    <div {...common}>
      {body}
      {trailing ? <span className="hk-row-trailing">{trailing}</span> : null}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────
export function Card({ title, tools, footer, children, as: Tag = "section", className = "", headingLevel = 3 }) {
  const id = React.useId();
  const H = `h${Math.min(6, Math.max(2, headingLevel))}`;
  return (
    <Tag className={`hk-card ${className}`} aria-labelledby={title ? `${id}-t` : undefined}>
      {title || tools ? (
        <div className="hk-card-head">
          {title ? <H id={`${id}-t`} className="hk-card-title house-label">{title}</H> : null}
          {tools ? <div className="hk-card-tools">{tools}</div> : null}
        </div>
      ) : null}
      <div className="hk-card-body">{children}</div>
      {footer ? <div className="hk-card-foot">{footer}</div> : null}
    </Tag>
  );
}

// ── Stat ──────────────────────────────────────────────────────────────
// `value` is shown in the value font (tabular). `change` is words, never a
// bare arrow or colour: "+3 on last week", "Same as last week".
export function Stat({ label, value, unit, change, hint }) {
  return (
    <div className="hk-stat" role="group" aria-label={label}>
      <span className="hk-stat-label">{label}</span>
      <span className="hk-stat-value">
        <span className="hk-stat-number">{value ?? "–"}</span>
        {unit ? <span className="hk-stat-unit">{unit}</span> : null}
      </span>
      {change ? <span className="hk-stat-change">{change}</span> : null}
      {hint ? <span className="hk-hint">{hint}</span> : null}
    </div>
  );
}

// ── Alter chip ────────────────────────────────────────────────────────
function useAlterColours(color) {
  const house = useHouse();
  const r = house?.roles || {};
  const base = HEX.test(color || "") ? color : null;
  if (!base) return { ring: r.border || "currentColor", fill: r.raised || "transparent", text: r.text || "inherit" };
  return {
    ring: readableOnAll(base, [r.panel, r.page].filter(Boolean), 3),
    fill: base,
    text: onFill(base),
  };
}

export function AlterAvatar({ alter, size = "md" }) {
  const formatAlter = useAlterLabel();
  const url = useResolvedAvatarUrl(alter?.avatar_url || alter?.image_url || null);
  const [failed, setFailed] = React.useState(null);
  const c = useAlterColours(alter?.color);
  const name = formatAlter(alter) || "";
  return (
    <span className={`hk-avatar hk-avatar--${size}`} style={{ "--hk-alter-ring": c.ring, "--hk-alter-fill": c.fill, "--hk-alter-on": c.text }} aria-hidden="true">
      {url && failed !== url
        ? <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} />
        : <span className="hk-avatar-initial">{(name.trim()[0] || "?").toUpperCase()}</span>}
    </span>
  );
}

// `as`: "span" (default, content) or a button with `onClick`.
export function AlterChip({ alter, size = "md", onClick, selected = false, suffix }) {
  const formatAlter = useAlterLabel();
  const name = formatAlter(alter) || "Unnamed";
  const c = useAlterColours(alter?.color);
  const inner = (
    <>
      <AlterAvatar alter={alter} size={size} />
      <span className="hk-chipname">{name}</span>
      {suffix ? <span className="hk-chipsuffix">{suffix}</span> : null}
    </>
  );
  const style = { "--hk-alter-ring": c.ring };
  if (onClick) {
    return (
      <button type="button" className="hk-alterchip" data-size={size} style={style} aria-pressed={selected} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <span className="hk-alterchip" data-size={size} style={style}>{inner}</span>;
}

// A co-front: up to `max` chips, then "+N" that names the rest (and opens
// them when `onMore` is given, e.g. into a sheet).
export function AlterChips({ alters = [], max = 3, label, size = "md", onMore }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { shown, hidden } = overflowSplit(alters, max);
  const all = alters.map((a) => formatAlter(a) || "Unnamed");
  const groupLabel = label || `${t.Fronting}: ${namesWords(all, { max: all.length })}`;
  return (
    <div className="hk-alterchips" role="group" aria-label={groupLabel}>
      {shown.map((a) => <AlterChip key={a.id} alter={a} size={size} />)}
      {hidden.length ? (
        onMore ? (
          <button type="button" className="hk-alterchip hk-alterchip--more" data-size={size} onClick={onMore}
            aria-label={`${hidden.length} more: ${namesWords(hidden.map((a) => formatAlter(a) || "Unnamed"), { max: hidden.length })}`}>
            <span className="hk-chipname">+{hidden.length}</span>
          </button>
        ) : (
          <span className="hk-alterchip hk-alterchip--more" data-size={size}
            title={namesWords(hidden.map((a) => formatAlter(a) || "Unnamed"), { max: hidden.length })}>
            <span className="hk-chipname" aria-hidden="true">+{hidden.length}</span>
            <span className="hk-sr">and {hidden.length} more</span>
          </span>
        )
      ) : null}
    </div>
  );
}

export default Row;
