// The kit's choices (new house step 1.2, building code §2 and §3).
//
//   Checkbox     several may be on; a real ✓ (a dash when mixed), never an x.
//                The whole row is the target. `done` strikes the words AND
//                says "done" to a screen reader.
//   RadioGroup   one of five or more, or options with descriptions. A
//                visible group label (a legend).
//   Switch       a setting that takes effect at once. Track, thumb and the
//                word On / Off beside it; the whole row is the button.
//   Segmented    one of two to four short options that change a view.
//                Joined buttons, the chosen one filled and bold. Arrow keys.
//   FilterChips  narrow the list beneath. One row that scrolls sideways
//                (never wraps), on = filled with a ✓, and a count of how
//                many are on, so one scrolled out of sight still shows.
//   SliderRow    a number with a range: the name, the number beside it
//                (tap to type), the slider under it. Same behaviour as the
//                old house's SettingRows SliderRow (inherited values dashed,
//                a × to go back to inherited, a vertical swipe on the track
//                scrolls instead of moving the thumb), in the house's look.

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { IconButton } from "@/house/kit/Button";
import { commitNumber } from "@/house/kit/values";
import "@/house/kit/kit.css";

const tickStyle = { width: "0.875rem", height: "0.875rem", strokeWidth: 3 };

// ── Checkbox ──────────────────────────────────────────────────────────
export function Checkbox({ label, description, checked = false, mixed = false, onChange, disabledReason, done = false, name, value }) {
  const ref = useRef(null);
  const descId = useId();
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed && !checked; }, [mixed, checked]);
  const off = !!disabledReason;
  return (
    <label className="hk-check" data-disabled={off || undefined} data-done={(done && checked) || undefined}>
      <input
        ref={ref}
        type="checkbox"
        className="hk-check-input"
        checked={!!checked}
        name={name}
        value={value}
        aria-disabled={off || undefined}
        aria-describedby={description || disabledReason ? descId : undefined}
        onChange={(e) => { if (off) return; onChange?.(e.target.checked); }}
      />
      <span className="hk-check-box" aria-hidden="true">
        {checked ? <Check style={tickStyle} /> : mixed ? <Minus style={tickStyle} /> : null}
      </span>
      <span className="hk-check-text">
        <span className="hk-check-label">{label}{done && checked ? <span className="hk-sr"> (done)</span> : null}</span>
        {description || disabledReason ? (
          <span id={descId} className="hk-hint">{disabledReason || description}</span>
        ) : null}
      </span>
    </label>
  );
}

// ── Radio group ───────────────────────────────────────────────────────
export function RadioGroup({ label, hint, options = [], value, onChange, name }) {
  const auto = useId();
  const groupName = name || auto;
  return (
    <fieldset className="hk-group" role="radiogroup" aria-labelledby={`${groupName}-legend`}>
      <legend id={`${groupName}-legend`} className="hk-label">{label}</legend>
      {hint ? <p className="hk-hint">{hint}</p> : null}
      {options.map((o) => {
        const off = !!o.disabledReason;
        const id = `${groupName}-${String(o.value)}`;
        return (
          <label key={String(o.value)} className="hk-radio" data-disabled={off || undefined}>
            <input
              type="radio"
              className="hk-radio-input"
              name={groupName}
              value={String(o.value)}
              checked={String(value) === String(o.value)}
              aria-disabled={off || undefined}
              aria-describedby={o.description || off ? `${id}-d` : undefined}
              onChange={() => { if (!off) onChange?.(o.value); }}
            />
            <span className="hk-radio-dot" aria-hidden="true" />
            <span className="hk-check-text">
              <span>{o.label}</span>
              {o.description || off ? <span id={`${id}-d`} className="hk-hint">{o.disabledReason || o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ── Switch ────────────────────────────────────────────────────────────
export function Switch({ label, description, checked = false, onChange, disabledReason, onWord = "On", offWord = "Off", ...rest }) {
  const id = useId();
  const off = !!disabledReason;
  return (
    <button
      type="button"
      role="switch"
      className="hk-switch"
      aria-checked={!!checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={description || off ? `${id}-d` : undefined}
      aria-disabled={off || undefined}
      onClick={() => { if (!off) onChange?.(!checked); }}
      {...rest}
    >
      <span className="hk-switch-text">
        <span id={`${id}-l`}>{label}</span>
        {description || off ? <span id={`${id}-d`} className="hk-hint">{disabledReason || description}</span> : null}
      </span>
      <span className="hk-switch-track" aria-hidden="true"><span className="hk-switch-thumb" /></span>
      <span className="hk-switch-word" aria-hidden="true">{checked ? onWord : offWord}</span>
    </button>
  );
}

// ── Segmented control ─────────────────────────────────────────────────
export function Segmented({ label, options = [], value, onChange, showLabel = false }) {
  const id = useId();
  const refs = useRef([]);
  const idx = Math.max(0, options.findIndex((o) => String(o.value) === String(value)));
  const pick = (i) => {
    const n = (i + options.length) % options.length;
    onChange?.(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className="hk-field">
      {showLabel ? <span id={`${id}-l`} className="hk-label">{label}</span> : null}
      <div
        role="radiogroup"
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? `${id}-l` : undefined}
        className="hk-seg"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); pick(idx + 1); }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); pick(idx - 1); }
        }}
      >
        {options.map((o, i) => {
          const on = i === idx && value != null;
          return (
            <button
              key={String(o.value)}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === idx ? 0 : -1}
              className="hk-seg-opt"
              onClick={() => onChange?.(o.value)}
            >
              {o.icon ? <HouseIcon icon={o.icon} size="inline" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────
// `value` is the array of chosen values; [] means "All". `allLabel` adds an
// All chip that clears the rest.
export function FilterChips({ label, options = [], value = [], onChange, allLabel = "All" }) {
  const id = useId();
  const rowRef = useRef(null);
  const [more, setMore] = useState(false);
  const on = new Set((value || []).map(String));
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const check = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    let ro;
    try { ro = new ResizeObserver(check); ro.observe(el); } catch { /* old engine */ }
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [options.length]);
  const toggle = (v) => {
    const s = String(v);
    const next = on.has(s) ? (value || []).filter((x) => String(x) !== s) : [...(value || []), v];
    onChange?.(next);
  };
  const count = on.size;
  return (
    <div className="hk-chips-wrap">
      <div className="hk-field-head">
        <span id={`${id}-l`} className="hk-label">{label}</span>
        <span className="hk-chips-count" aria-live="polite">{count ? `${count} on` : "Showing all"}</span>
      </div>
      <div ref={rowRef} role="group" aria-labelledby={`${id}-l`} className="hk-chips" data-more={more || undefined}>
        {allLabel ? (
          <button type="button" className="hk-chip" aria-pressed={count === 0} onClick={() => onChange?.([])}>
            <span className="hk-chip-face">{count === 0 ? <Check aria-hidden="true" style={tickStyle} /> : null}{allLabel}</span>
          </button>
        ) : null}
        {options.map((o) => {
          const pressed = on.has(String(o.value));
          return (
            <button key={String(o.value)} type="button" className="hk-chip" aria-pressed={pressed} onClick={() => toggle(o.value)}>
              <span className="hk-chip-face">{pressed ? <Check aria-hidden="true" style={tickStyle} /> : null}{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────
// `value` unset means inherited: the slider sits at `fallback`, dashed.
export function SliderRow({ label, hint, value, fallback = 0, min = 0, max = 100, step = 1, unit = "", onChange, onClear }) {
  const id = useId();
  const inherited = value === undefined || value === null || value === "";
  const current = inherited ? Number(fallback) : Number(value);
  const shown = Number.isFinite(current) ? current : min;
  const [text, setText] = useState(String(shown));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(String(shown)); }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const v = commitNumber(text, { min, max });
    if (v == null) { setText(String(shown)); return; }
    setText(String(v));
    if (v !== shown || inherited) onChange?.(v);
  };
  return (
    <div className="hk-slider" data-inherited={inherited || undefined}>
      <div className="hk-slider-top">
        <span className="hk-field-name">
          <label id={`${id}-l`} htmlFor={`${id}-n`} className="hk-label">{label}</label>
          {hint ? <span className="hk-hint">{hint}{inherited ? " (inherited)" : ""}</span> : inherited ? <span className="hk-hint">Inherited</span> : null}
        </span>
        <span className="hk-inputwrap hk-numbox" data-inherited={inherited || undefined}>
          <input
            id={`${id}-n`}
            type="text"
            inputMode="decimal"
            className="hk-bare hk-value"
            value={text}
            onFocus={() => setEditing(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setText(String(shown)); setEditing(false); e.currentTarget.blur(); }
            }}
          />
          {unit ? <span className="hk-unit" aria-hidden="true">{unit}</span> : null}
        </span>
        {onClear ? (
          <IconButton icon={X} label={`${label}: back to inherited`} onClick={onClear}
            disabledReason={inherited ? "Already inherited" : undefined} />
        ) : null}
      </div>
      <div className="hk-slider-track">
        {/* ui-ok: this IS the house's SliderRow (number beside it, edge-safe). */}
        <input type="range"
          className="hk-range"
          min={min}
          max={max}
          step={step}
          value={shown}
          aria-labelledby={`${id}-l`}
          aria-valuetext={`${shown}${unit ? ` ${unit}` : ""}${inherited ? ", inherited" : ""}`}
          data-edge-safe=""
          data-inherited={inherited || undefined}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
