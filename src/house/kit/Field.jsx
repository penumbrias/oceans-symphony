// The kit's fields (new house step 1.2): text, authored text, number, date,
// time and duration, each with a label, a hint, an error and a save-state
// slot. Kit-drawn throughout: no browser date or time picker (building code
// §9), so they look the same on every platform and in both looks.
//
// Every field takes `value` and `onChange(value)` (a value, never an event):
//   TextField      string
//   AuthoredField  string, through the shared MentionTextarea: the full
//                  @mention / -signpost / ~command grammar. Saving it is
//                  the host's job: prepareAuthoredText → save → recordAuthoredText
//                  (src/lib/authoredText.js), never on each keystroke.
//   NumberField    number | null
//   DateField      "YYYY-MM-DD" | null   (typed: "tomorrow", "23 Nov", "fri")
//   TimeField      "HH:mm" | null        (typed: "9", "930", "9:30pm"; shown on the person's clock)
//   DurationField  minutes | null        (typed: "90", "1:30", "1h 30m")
//
// Typed text that can't be read is KEPT in the box with an error under it,
// never thrown away; the value only changes when the text reads cleanly.
// `save={{ state, error, onRetry }}` shows Saving… / Saved / Not saved.

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Minus, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { useTimeFormat } from "@/lib/timeFormat";
import { usePlannerPrefs } from "@/lib/planner/displayPrefs";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button, IconButton } from "@/house/kit/Button";
import { KitPopover } from "@/house/kit/KitLayer";
import {
  commitNumber, isDay, toDay, addDays, addMonths, dayToDate, parseDayInput, formatDayWords, formatDayLong,
  localeDateOrder, monthGrid, isTime, parseTimeInput, formatTimeValue, timeSlots, nearestSlot,
  parseDuration, formatDuration, formatDurationLong, saveStateWords,
} from "@/house/kit/values";
import "@/house/kit/kit.css";

// ── The save-state slot ──────────────────────────────────────────────
export function SaveState({ state = "idle", error, onRetry }) {
  const words = saveStateWords(state, { error });
  return (
    <div className="hk-save" data-state={state} role="status" aria-live="polite">
      {state === "saving" ? <Loader2 aria-hidden="true" className="hk-spin" style={{ width: "1em", height: "1em" }} /> : null}
      {state === "saved" ? <HouseIcon icon={Check} size="inline" /> : null}
      {state === "failed" ? <HouseIcon icon={AlertTriangle} size="inline" /> : null}
      {words ? <span>{words}</span> : null}
      {state === "failed" && onRetry ? <Button rank="quiet" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

// ── The shell every field shares: label, hint, the control, error, save ──
export function FieldShell({ label, hint, error, save, labelAs = "label", aside, children, className = "" }) {
  const id = useId();
  const inputId = `${id}-input`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const LabelTag = labelAs;
  return (
    <div className={`hk-field ${className}`}>
      <div className="hk-field-head">
        <LabelTag id={`${id}-label`} className="hk-label" {...(labelAs === "label" ? { htmlFor: inputId } : {})}>{label}</LabelTag>
        {aside}
      </div>
      {hint ? <p id={hintId} className="hk-hint">{hint}</p> : null}
      {children({ inputId, labelId: `${id}-label`, describedBy, invalid: !!error })}
      {error ? (
        <p id={errId} className="hk-error"><HouseIcon icon={AlertTriangle} size="inline" /><span>{error}</span></p>
      ) : null}
      {save ? <SaveState {...save} /> : null}
    </div>
  );
}

// ── Text ─────────────────────────────────────────────────────────────
export function TextField({ label, hint, error, save, value = "", onChange, placeholder, disabled, inputMode, autoComplete = "off", maxLength, ...rest }) {
  return (
    <FieldShell label={label} hint={hint} error={error} save={save}>
      {({ inputId, describedBy, invalid }) => (
        <input
          id={inputId}
          type="text"
          className="hk-input"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

// ── Authored text: the shared grammar box, in the house's look ─────────
export function AuthoredField({ label, hint, error, save, value = "", onChange, alters: altersProp, signposts = true, commands = true, placeholder, rows = 4, toolbar = true, ...rest }) {
  const { data: fetched = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: !altersProp,
  });
  const alters = altersProp || fetched;
  return (
    <FieldShell label={label} hint={hint} error={error} save={save} className="hk-authored">
      {({ inputId, describedBy, invalid }) => (
        <MentionTextarea
          id={inputId}
          value={value ?? ""}
          onChange={(v) => onChange?.(v)}
          alters={alters}
          signposts={signposts}
          commands={commands}
          placeholder={placeholder}
          rows={rows}
          toolbar={toolbar}
          className="hk-textarea"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

// How many characters the value box must show whole (kit gate item 1):
// the words in it, or the placeholder's when empty, so the box is never
// narrower than what it holds.
export function valueChars(text, placeholder) {
  const n = String(text || "").length || Math.min(String(placeholder || "").length, 12);
  return Math.max(2, n);
}

// Typed text kept while it's being edited; re-shown from the value after.
function useDraft(display) {
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(display); }, [display, editing]);
  return { text, setText, editing, setEditing };
}

// ── Number, with − and + ───────────────────────────────────────────
export function NumberField({ label, hint, error, save, value, onChange, min = -Infinity, max = Infinity, step = 1, unit, clearable = false, disabled, placeholder }) {
  const display = value == null || !Number.isFinite(Number(value)) ? "" : String(value);
  const { text, setText, setEditing } = useDraft(display);
  const [bad, setBad] = useState(null);
  const commit = () => {
    setEditing(false);
    if (text.trim() === "") {
      if (clearable) { setBad(null); onChange?.(null); } else setText(display);
      return;
    }
    const v = commitNumber(text, { min, max });
    if (v == null) { setBad("Type a number, like 3."); setEditing(true); return; }
    setBad(null);
    setText(String(v));
    if (v !== value) onChange?.(v);
  };
  const n = Number.isFinite(Number(value)) && value != null ? Number(value) : null;
  const nudge = (d) => {
    const base = n == null ? (Number.isFinite(min) ? min : 0) : n;
    const v = commitNumber(String(base + d), { min, max });
    setBad(null);
    onChange?.(v);
  };
  return (
    <FieldShell label={label} hint={hint} error={bad || error} save={save} className="hk-field--sized">
      {({ inputId, describedBy, invalid }) => (
        <div className="hk-inputwrap hk-inputwrap--stepper" data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
          <IconButton icon={Minus} label={`${label}: less`} onClick={() => nudge(-step)} disabledReason={disabled ? "Not available here" : n != null && n <= min ? `Already the smallest (${min})` : undefined} />
          <span className="hk-stepval">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            className="hk-bare hk-value"
            style={{ textAlign: "center", "--hk-chars": valueChars(text, placeholder) }}
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={() => setEditing(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "ArrowUp") { e.preventDefault(); nudge(step); }
              if (e.key === "ArrowDown") { e.preventDefault(); nudge(-step); }
            }}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
          {unit ? <span className="hk-unit" aria-hidden="true">{unit}</span> : null}
          </span>
          <IconButton icon={Plus} label={`${label}: more`} onClick={() => nudge(step)} disabledReason={disabled ? "Not available here" : n != null && n >= max ? `Already the largest (${max})` : undefined} />
        </div>
      )}
    </FieldShell>
  );
}

// ── Date ─────────────────────────────────────────────────────────────
const todayDay = () => toDay(new Date());

function Calendar({ value, onPick, onClose, weekStart = 1, clearable, onClear, autoFocus = true }) {
  const today = todayDay();
  const [focusDay, setFocusDay] = useState(isDay(value) ? value : today);
  const d = dayToDate(focusDay);
  const year = d.getFullYear(), month = d.getMonth();
  const cells = useMemo(() => monthGrid(year, month, weekStart), [year, month, weekStart]);
  const gridRef = useRef(null);
  // Focus follows the moving day, and lands on open unless drawn inline.
  const startDay = useRef(focusDay);
  useEffect(() => {
    if (!autoFocus && focusDay === startDay.current) return undefined;
    // A frame later: the pop-up is placed (and visible) only after mount.
    const raf = requestAnimationFrame(() => gridRef.current?.querySelector(`[data-day="${focusDay}"]`)?.focus());
    return () => cancelAnimationFrame(raf);
  }, [focusDay, autoFocus]);
  const title = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dows = cells.slice(0, 7).map((c) => dayToDate(c.day));
  const move = (day) => setFocusDay(day);
  const onKey = (e) => {
    const k = e.key;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (map[k] != null) { e.preventDefault(); move(addDays(focusDay, map[k])); }
    else if (k === "PageUp") { e.preventDefault(); move(addMonths(focusDay, e.shiftKey ? -12 : -1)); }
    else if (k === "PageDown") { e.preventDefault(); move(addMonths(focusDay, e.shiftKey ? 12 : 1)); }
    else if (k === "Home") { e.preventDefault(); move(addDays(focusDay, -((dayToDate(focusDay).getDay() - weekStart + 7) % 7))); }
    else if (k === "End") { e.preventDefault(); move(addDays(focusDay, 6 - ((dayToDate(focusDay).getDay() - weekStart + 7) % 7))); }
  };
  return (
    <div className="hk-cal">
      <div className="hk-cal-head">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => move(addMonths(focusDay, -1))} />
        <span className="hk-cal-title" aria-live="polite">{title}</span>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => move(addMonths(focusDay, 1))} />
      </div>
      <div ref={gridRef} role="grid" aria-label={title} className="hk-cal-grid" onKeyDown={onKey}>
        <div role="row" style={{ display: "contents" }}>
          {dows.map((w, i) => (
            <span key={i} role="columnheader" className="hk-cal-dow" aria-label={w.toLocaleDateString(undefined, { weekday: "long" })}>
              {w.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <div key={r} role="row" style={{ display: "contents" }}>
            {cells.slice(r * 7, r * 7 + 7).map((c) => (
              <button
                key={c.day}
                type="button"
                role="gridcell"
                data-day={c.day}
                data-out={!c.inMonth || undefined}
                data-today={c.day === today || undefined}
                aria-selected={c.day === value}
                aria-label={`${formatDayLong(c.day)}${c.day === today ? ", today" : ""}`}
                tabIndex={c.day === focusDay ? 0 : -1}
                className="hk-cal-day"
                onClick={() => onPick(c.day)}
                onFocus={() => { if (c.day !== focusDay) setFocusDay(c.day); }}
              >
                {dayToDate(c.day).getDate()}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="hk-cal-foot">
        <Button rank="quiet" onClick={() => onPick(today)}>Today</Button>
        {clearable ? <Button rank="quiet" onClick={onClear}>No date</Button> : null}
        <Button rank="quiet" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

export function DateField({ label, hint, error, save, value, onChange, clearable = false, disabled, weekStart: weekStartProp, placeholder = "Today, tomorrow, 23 Nov…", openInline = false }) {
  const today = todayDay();
  // The calendar's first column is the person's own week start (the
  // planner's "Week starts on", symphony_act_week_start: 0 Sunday, 1 Monday),
  // read live, never written. A caller can still pass one.
  const [plannerPrefs] = usePlannerPrefs();
  const weekStart = weekStartProp ?? plannerPrefs?.weekStartsOn ?? 1;
  const display = isDay(value) ? formatDayWords(value, { today }) : "";
  const { text, setText, setEditing } = useDraft(display);
  const [bad, setBad] = useState(null);
  const [open, setOpen] = useState(openInline);
  const btnRef = useRef(null);
  const order = useMemo(() => localeDateOrder(undefined), []);
  const accept = (day) => { setBad(null); setEditing(false); if (day !== value) onChange?.(day); };
  const commit = () => {
    const t = text.trim();
    if (t === display) { setEditing(false); return; }
    if (!t) {
      if (clearable) { accept(null); return; }
      setText(display); setEditing(false); return;
    }
    const day = parseDayInput(t, { today, order });
    if (!day) { setBad("Couldn't read that as a date. Try “23 Nov”, “tomorrow” or “fri”."); return; }
    accept(day);
    setText(formatDayWords(day, { today }));
  };
  return (
    <FieldShell label={label} hint={hint} error={bad || error} save={save} className="hk-field--sized">
      {({ inputId, describedBy, invalid }) => (
        <>
          <div className="hk-inputwrap hk-inputwrap--picker" data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
            <input
              id={inputId}
              type="text"
              className="hk-bare"
              style={{ "--hk-chars": valueChars(text, placeholder) }}
              value={text}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setEditing(true)}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); setOpen(true); } }}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
            <IconButton ref={btnRef} icon={CalendarDays} label={`Choose ${label} on a calendar`} aria-haspopup="dialog" aria-expanded={open}
              disabledReason={disabled ? "Not available here" : undefined} onClick={() => setOpen((o) => !o)} />
          </div>
          {isDay(value) ? <p className="hk-readback">{formatDayLong(value)}</p> : null}
          <KitPopover open={open} inline={openInline} anchorRef={btnRef} onClose={() => setOpen(false)} label={`${label}: calendar`}>
            <Calendar value={value} weekStart={weekStart} clearable={clearable} autoFocus={!openInline}
              onPick={(day) => { accept(day); setOpen(false); btnRef.current?.focus(); }}
              onClear={() => { accept(null); setOpen(false); btnRef.current?.focus(); }}
              onClose={() => { setOpen(false); btnRef.current?.focus(); }} />
          </KitPopover>
        </>
      )}
    </FieldShell>
  );
}

// ── Time ─────────────────────────────────────────────────────────────
function TimeList({ value, step, format, onPick, label, onClose, autoFocus = true }) {
  const slots = useMemo(() => timeSlots(step), [step]);
  const start = Math.max(0, slots.indexOf(nearestSlot(value, step) || "09:00"));
  const [active, setActive] = useState(start);
  const listRef = useRef(null);
  const baseId = useId();
  useEffect(() => {
    if (!autoFocus) return undefined;
    const raf = requestAnimationFrame(() => listRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    const box = listRef.current?.closest(".hk-pop");
    if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2;
  }, [active]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(slots.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(slots.length - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); setActive((i) => Math.min(slots.length - 1, i + 4)); }
    else if (e.key === "PageUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 4)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(slots[active]); }
    else if (e.key === "Tab") onClose();
  };
  return (
    <div ref={listRef} role="listbox" aria-label={label} tabIndex={0} aria-activedescendant={`${baseId}-${active}`} onKeyDown={onKey} style={{ outline: "none" }}>
      {slots.map((s, i) => (
        <div key={s} id={`${baseId}-${i}`} data-idx={i} role="option" aria-selected={s === value} data-active={i === active || undefined}
          className="hk-option hk-value" onClick={() => onPick(s)} onMouseEnter={() => setActive(i)}>
          {s === value ? <HouseIcon icon={Check} size="inline" /> : <span style={{ width: "1em" }} aria-hidden="true" />}
          {formatTimeValue(s, format)}
        </div>
      ))}
    </div>
  );
}

export function TimeField({ label, hint, error, save, value, onChange, clearable = false, disabled, step = 15, placeholder, openInline = false }) {
  const format = useTimeFormat();
  const display = isTime(value) ? formatTimeValue(value, format) : "";
  const { text, setText, setEditing } = useDraft(display);
  const [bad, setBad] = useState(null);
  const [open, setOpen] = useState(openInline);
  const btnRef = useRef(null);
  const accept = (t) => { setBad(null); setEditing(false); if (t !== value) onChange?.(t); };
  const commit = () => {
    const t = text.trim();
    if (t === display) { setEditing(false); return; }
    if (!t) { if (clearable) accept(null); else { setText(display); setEditing(false); } return; }
    const v = parseTimeInput(t);
    if (!v) { setBad(format === "24" ? "Couldn't read that as a time. Try “09:30” or “21:00”." : "Couldn't read that as a time. Try “9:30 am” or “9 pm”."); return; }
    accept(v);
    setText(formatTimeValue(v, format));
  };
  return (
    <FieldShell label={label} hint={hint} error={bad || error} save={save} className="hk-field--sized">
      {({ inputId, describedBy, invalid }) => (
        <>
          <div className="hk-inputwrap hk-inputwrap--picker" data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
            <input
              id={inputId}
              type="text"
              className="hk-bare hk-value"
              style={{ "--hk-chars": valueChars(text, placeholder ?? "9:30 pm") }}
              value={text}
              placeholder={placeholder ?? (format === "24" ? "21:30" : "9:30 pm")}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setEditing(true)}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); setOpen(true); } }}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
            <IconButton ref={btnRef} icon={Clock} label={`Choose ${label} from a list`} aria-haspopup="listbox" aria-expanded={open}
              disabledReason={disabled ? "Not available here" : undefined} onClick={() => setOpen((o) => !o)} />
          </div>
          <KitPopover open={open} inline={openInline} anchorRef={btnRef} onClose={() => setOpen(false)} role="presentation">
            <TimeList value={value} step={step} format={format} label={`${label}: times`} autoFocus={!openInline}
              onPick={(t) => { accept(t); setOpen(false); btnRef.current?.focus(); }}
              onClose={() => setOpen(false)} />
          </KitPopover>
        </>
      )}
    </FieldShell>
  );
}

// ── Duration (minutes) ────────────────────────────────────────────────
export function DurationField({ label, hint, error, save, value, onChange, step = 5, min = 0, max = 7 * 1440, clearable = false, disabled, placeholder = "45 min, 1h 30m…" }) {
  const display = Number.isFinite(value) ? formatDuration(value) : "";
  const { text, setText, setEditing } = useDraft(display);
  const [bad, setBad] = useState(null);
  const accept = (m) => { setBad(null); setEditing(false); if (m !== value) onChange?.(m); };
  const commit = () => {
    const t = text.trim();
    if (t === display) { setEditing(false); return; }
    if (!t) { if (clearable) accept(null); else { setText(display); setEditing(false); } return; }
    const m = parseDuration(t);
    if (m == null) { setBad("Couldn't read that as a length of time. Try “45”, “1:30” or “1h 30m”."); return; }
    const c = Math.min(max, Math.max(min, m));
    accept(c);
    setText(formatDuration(c));
  };
  const n = Number.isFinite(value) ? value : null;
  const nudge = (d) => accept(Math.min(max, Math.max(min, (n ?? 0) + d)));
  return (
    <FieldShell label={label} hint={hint} error={bad || error} save={save} className="hk-field--sized">
      {({ inputId, describedBy, invalid }) => (
        <>
          <div className="hk-inputwrap hk-inputwrap--stepper" data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
            <IconButton icon={Minus} label={`${label}: ${step} minutes less`} onClick={() => nudge(-step)}
              disabledReason={disabled ? "Not available here" : n != null && n <= min ? "Already as short as it goes" : undefined} />
            <span className="hk-stepval">
            <input
              id={inputId}
              type="text"
              className="hk-bare hk-value"
              style={{ textAlign: "center", "--hk-chars": valueChars(text, placeholder) }}
              value={text}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setEditing(true)}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
            </span>
            <IconButton icon={Plus} label={`${label}: ${step} minutes more`} onClick={() => nudge(step)}
              disabledReason={disabled ? "Not available here" : n != null && n >= max ? "Already as long as it goes" : undefined} />
          </div>
          {n != null && n > 0 ? <p className="hk-readback">{formatDurationLong(n)}</p> : null}
        </>
      )}
    </FieldShell>
  );
}
