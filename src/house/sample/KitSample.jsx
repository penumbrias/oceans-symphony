// The sample page for new-house step 1.1: the tokens in the person's own
// paint. Unlinked on purpose (no menu, bar or search entry): it is reached
// only by typing /house/kit, while the kit is being built. It reads the
// person's look and writes nothing.
//
// It holds no buttons, ticks or tabs: those are the kit's job (step 1.2), and
// the house guard fails on any made here.

import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Heart, LifeBuoy, NotebookPen, Users } from "lucide-react";
import HouseRoot, { useHouse } from "@/house/tokens/HouseRoot";
import HouseIcon from "@/house/tokens/HouseIcon";
import { TYPE_SCALE, SPACE_SCALE, HEIGHT_SCALE, MOTION } from "@/house/tokens/scales";
import { ROLE_PAIRS } from "@/house/tokens/contrast";
import { contrastRatio } from "@/lib/contrast";
import "@/house/sample/kitSample.css";

const ROLE_NAMES = [
  ["page", "Page"], ["panel", "Panel"], ["raised", "Raised"], ["sunken", "Sunken"],
  ["text", "Text"], ["muted", "Muted text"], ["accent", "Accent"], ["accentText", "Accent text"],
  ["onAccent", "On accent"], ["danger", "Danger"], ["dangerText", "Danger text"], ["onDanger", "On danger"],
  ["focus", "Focus ring"], ["border", "Border"], ["divider", "Divider"], ["outline", "Outline"],
];

function Section({ title, children, note }) {
  return (
    <section className="kit-section">
      <h2 className="house-label house-text-lg kit-section-title">{title}</h2>
      {note ? <p className="house-text-sm house-muted kit-note">{note}</p> : null}
      {children}
    </section>
  );
}

function Swatches() {
  const { roles } = useHouse();
  return (
    <ul className="kit-swatches">
      {ROLE_NAMES.map(([key, name]) => (
        <li key={key} className="kit-swatch">
          <span className="kit-chipcolour" style={{ background: roles[key] }} aria-hidden="true" />
          <span className="house-text-sm">{name}</span>
          <span className="house-value house-text-xs house-muted">{roles[key]}</span>
        </li>
      ))}
    </ul>
  );
}

function ContrastTable() {
  const { roles } = useHouse();
  const rows = [];
  for (const [fg, bgs, min] of ROLE_PAIRS) for (const bg of bgs) rows.push({ fg, bg, min, ratio: contrastRatio(roles[fg], roles[bg]) ?? 0 });
  const name = (k) => (ROLE_NAMES.find(([key]) => key === k) || [k, k])[1];
  return (
    <>
      <p className="house-text-sm house-muted kit-note">Each pair the house promises, measured in your colours.</p>
      <ul className="kit-list kit-pairs">
        {rows.map((r) => {
          const ok = r.ratio >= r.min;
          return (
            <li key={`${r.fg}-${r.bg}`} className="kit-pair-row house-text-sm">
              <span className="kit-pair" style={{ background: roles[r.bg], color: roles[r.fg], borderColor: roles[r.fg] }}>{name(r.fg)}</span>
              <span>on {name(r.bg)}</span>
              <span className="house-value">
                needs {r.min}:1, reads at {r.ratio.toFixed(2)}:1 {ok ? <span aria-label="meets it">✓</span> : <strong className="kit-danger">below</strong>}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TypeScale() {
  return (
    <ul className="kit-list">
      {TYPE_SCALE.map((t) => (
        <li key={t.token} className="kit-type-row">
          <span className={`house-text-${t.token.slice(5)} ${t.role === "label" ? "house-label" : ""}`}>
            {t.role === "label" ? "Plan the week" : "Ash wrote at 9:12"}
          </span>
          <span className="house-value house-text-xs house-muted">
            {t.token} · {t.rem} rem ({t.px} px at 100%) · {t.role} · {t.use}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Fonts() {
  const { fonts } = useHouse();
  return (
    <dl className="kit-dl house-text-sm">
      <div><dt className="house-label">Label font</dt><dd className="house-label house-text-md">Today's check-in · Planner</dd></div>
      <div><dt className="house-label">Body font</dt><dd className="house-text-md">Felt calmer after the walk.</dd></div>
      <div><dt className="house-label">Values</dt><dd className="house-value house-text-md">09:12 · 3 5 8 · 2026-11-24</dd></div>
      <div><dt className="house-muted">Fonts in use</dt><dd className="house-value house-text-xs house-muted">{fonts.label} / {fonts.body}</dd></div>
    </dl>
  );
}

function Spacing() {
  return (
    <ul className="kit-list">
      {SPACE_SCALE.map((s) => (
        <li key={s.token} className="kit-space-row">
          <span className="kit-space-bar" style={{ width: `var(--house-${s.token})` }} aria-hidden="true" />
          <span className="house-value house-text-xs">{s.token} · {s.rem} rem ({s.px} px)</span>
          <span className="house-text-xs house-muted">{s.use}</span>
        </li>
      ))}
    </ul>
  );
}

function Heights() {
  return (
    <ul className="kit-heights">
      {HEIGHT_SCALE.map((h) => (
        <li key={h.token} className="kit-height" style={{ minHeight: `var(--house-${h.token})` }}>
          <span className="house-value house-text-xs">{h.token}</span>
          <span className="house-text-xs house-muted">{h.use}</span>
        </li>
      ))}
    </ul>
  );
}

function Shapes() {
  return (
    <div className="kit-shapes">
      <div className="kit-panel kit-raised"><span className="house-label house-text-sm">Raised</span><span className="house-text-xs house-muted">Panels and buttons</span></div>
      <div className="kit-panel kit-sunken"><span className="house-label house-text-sm">Sunken</span><span className="house-text-xs house-muted">Fields</span></div>
      <div className="kit-panel kit-focused" tabIndex={0}><span className="house-label house-text-sm">Focus ring</span><span className="house-text-xs house-muted">2 px, 3:1 on page and panel</span></div>
    </div>
  );
}

function Icons() {
  const set = [[CalendarDays, "planner"], [NotebookPen, "journals"], [Heart, null], [Users, null], [LifeBuoy, "grounding"]];
  return (
    <div className="kit-icons">
      {["inline", "control", "bar"].map((size) => (
        <div key={size} className="kit-icon-row">
          <span className="house-value house-text-xs house-muted kit-icon-size">{size}</span>
          {set.map(([Icon, page], i) => <HouseIcon key={i} icon={Icon} page={page} size={size} />)}
        </div>
      ))}
    </div>
  );
}

function Motion() {
  return (
    <div className="kit-motion">
      <div className="kit-track" aria-hidden="true"><span className="kit-dot" /></div>
      <p className="house-text-sm">
        Fast {MOTION.fast} ms · base {MOTION.base} ms · slow {MOTION.slow} ms. With Reduce motion on (yours or your device's), every one is 0 and the dot stays still.
      </p>
    </div>
  );
}

function FrameCap() {
  return (
    <div className="kit-frame-demo">
      <div className="kit-frame-bar">
        <span className="kit-frame-label">Header label (stops at 1.3×)</span>
      </div>
      <p className="house-text-sm">Content label (grows to 200%)</p>
    </div>
  );
}

function Summary() {
  const h = useHouse();
  const source = h.paint.tokens.source;
  const theme = source?.kind === "custom" ? "your own colours" : source?.name ? `the "${source.name}" theme` : "the default theme";
  return (
    <p className="house-text-md">
      Drawn in {theme}, {h.variant}, the {h.look} look{h.highContrast ? ", high contrast" : ""}.
      {h.adjusted.length
        ? ` A few of your colours were hard to read here, so this page shows a readable shade of them (${h.adjusted.join(", ")}). Your settings are unchanged.`
        : " Every colour is exactly yours."}
    </p>
  );
}

function Body() {
  return (
    <main className="kit-main">
      <header className="kit-header">
        <h1 className="house-label house-text-xl">Tokens and scales</h1>
        <p className="house-text-sm house-muted">The new house's building blocks in your colours. A preview: nothing here changes your settings.</p>
        <Summary />
        <Link to="/" className="house-text-sm kit-link">Back to the app</Link>
        <Link to="/house/kit/controls" className="house-text-sm kit-link">Controls and pickers (step 1.2)</Link>
      </header>
      <Section title="Colours"><Swatches /></Section>
      <Section title="Can it be read?"><ContrastTable /></Section>
      <Section title="Type" note="Six sizes. Every one follows your text size."><TypeScale /></Section>
      <Section title="Fonts" note="Two roles only: labels and body. Numbers and times always use the body font."><Fonts /></Section>
      <Section title="Spacing"><Spacing /></Section>
      <Section title="Heights" note="Nothing pressable is ever smaller than 44 px."><Heights /></Section>
      <Section title="Shape"><Shapes /></Section>
      <Section title="Icons"><Icons /></Section>
      <Section title="Motion"><Motion /></Section>
      <Section title="Frame labels"><FrameCap /></Section>
    </main>
  );
}

export default function KitSample() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Tokens and scales";
    return () => { document.title = prev; };
  }, []);
  return (
    <HouseRoot className="kit-root">
      <Body />
    </HouseRoot>
  );
}
