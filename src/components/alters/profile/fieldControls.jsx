// Custom-field controls, one copy for every place that shows or edits a
// field value: the Info widget (InfoTab) and the Alter info list
// (AlterInfo, v0.294.0). Moved out of InfoTab unchanged.
import React, { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MarkdownText from "@/components/shared/MarkdownText";
import WysiwygEditor from "@/components/shared/WysiwygEditor";
import useFieldToolbar from "@/components/shared/useFieldToolbar";
import { parseDateFieldValue, formatDateField } from "@/lib/importantDates";

const DATE_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Input for a "date" custom field. Month + Day are SEPARATE selects so a date
// can be saved WITHOUT a year at all (the native <input type=date> always
// demands a year). The year is a genuinely optional field, shown only when
// "include the year" is ticked. Stores "MM-DD" (annual, e.g. a birthday) or
// "YYYY-MM-DD" (specific).
export function DateFieldInput({ value, onChange, autoFocus = false }) {
  const parsed = parseDateFieldValue(value);
  const [month, setMonth] = useState(parsed ? String(parsed.month) : "");
  const [day, setDay] = useState(parsed ? String(parsed.day) : "");
  const [includeYear, setIncludeYear] = useState(!!(parsed && parsed.year != null));
  const [year, setYear] = useState(parsed && parsed.year != null ? String(parsed.year) : "");

  const pad = (n) => String(n).padStart(2, "0");
  // Leap-year reference so Feb 29 birthdays are selectable for annual dates.
  const daysInMonth = month ? new Date(2000, Number(month), 0).getDate() : 31;

  const emit = (mo, d, withYear, yr) => {
    if (!mo || !d) { onChange(""); return; }
    if (withYear && yr) onChange(`${String(yr).padStart(4, "0")}-${pad(mo)}-${pad(d)}`);
    else onChange(`${pad(mo)}-${pad(d)}`);
  };

  const selectCls = "rounded-md border border-input bg-transparent px-2 py-1.5 text-sm";

  return (
    <div className="flex-1 flex flex-col gap-1.5">
      <div className="flex gap-2 flex-wrap">
        <select
          value={month}
          autoFocus={autoFocus}
          onChange={(e) => {
            const mo = e.target.value;
            // Clamp the day if the new month has fewer days.
            const maxD = mo ? new Date(2000, Number(mo), 0).getDate() : 31;
            const d = day && Number(day) > maxD ? "" : day;
            setMonth(mo); setDay(d); emit(mo, d, includeYear, year);
          }}
          className={`${selectCls} flex-1 min-w-[7rem]`}
          aria-label="Month"
        >
          <option value="">Month</option>
          {DATE_MONTH_NAMES.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
        </select>
        <select
          value={day}
          onChange={(e) => { const d = e.target.value; setDay(d); emit(month, d, includeYear, year); }}
          className={`${selectCls} w-20`}
          aria-label="Day"
        >
          <option value="">Day</option>
          {Array.from({ length: daysInMonth }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select>
        {includeYear && (
          <input
            type="number"
            value={year}
            placeholder="Year"
            onChange={(e) => { const y = e.target.value; setYear(y); emit(month, day, true, y); }}
            className={`${selectCls} w-24`}
            aria-label="Year"
          />
        )}
      </div>
      <label className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeYear}
          onChange={(e) => { setIncludeYear(e.target.checked); emit(month, day, e.target.checked, year); }}
          className="w-3.5 h-3.5 accent-primary"
        />
        Include the year (leave off for annual dates like a birthday)
      </label>
    </div>
  );
}

// Field types offered for alter-specific fields — the SAME set the system-wide
// Custom Fields manager offers (CustomFieldsManager: text / number / boolean /
// list). So per-alter fields format and behave exactly like system fields,
// just scoped to one alter.
export const ALTER_FIELD_TYPES = [
  { id: "text", label: "Text" },
  { id: "richtext", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "boolean", label: "Yes / No" },
  { id: "list", label: "List" },
  { id: "date", label: "Date" },
];

// Shared, type-aware VALUE DISPLAY — used for both system fields and
// alter-specific fields so they render identically (boolean → Yes/No, list →
// chips, text/richtext → Markdown/HTML, number → plain). Treats an unset value
// as "Not filled".
export function FieldValue({ type, value }) {
  if (!value && value !== false) {
    return <span className="text-muted-foreground/50 italic">Not filled</span>;
  }
  if (type === "boolean") {
    return <>{(value === "true" || value === true) ? "Yes" : "No"}</>;
  }
  if (type === "list" && typeof value === "string") {
    const items = value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return <span className="text-muted-foreground/50 italic">Not filled</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {item}
          </span>
        ))}
      </div>
    );
  }
  if (type === "date") {
    const label = formatDateField(value);
    if (!label) return <span className="text-muted-foreground/50 italic">Not filled</span>;
    return <span className="inline-flex items-center gap-1">📅 {label}</span>;
  }
  if (type === "text" || type === "richtext") {
    return <MarkdownText>{String(value)}</MarkdownText>;
  }
  return <span className="whitespace-pre-wrap break-words">{value}</span>;
}

// Shared, type-aware VALUE EDITOR — mirrors the per-type inputs the system
// fields use (richtext → Wysiwyg, text → textarea, list → comma textarea +
// hint, boolean → Yes/No select, number → number input).
export function FieldEditor({ type, value, onChange, autoFocus = false }) {
  if (type === "richtext") {
    return <WysiwygEditor value={value} onChange={onChange} placeholder="Write…" />;
  }
  if (type === "list") {
    return (
      <div className="flex-1 flex flex-col gap-1">
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="item, item, item"
          className="text-sm min-h-[44px]" autoFocus={autoFocus} />
        <p className="text-[0.625rem] text-muted-foreground leading-snug">
          Separate items with commas — each one's stored and matched individually.
        </p>
      </div>
    );
  }
  if (type === "boolean") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm" autoFocus={autoFocus}>
        <option value="">Select...</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (type === "number") {
    return <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 text-sm" autoFocus={autoFocus} />;
  }
  if (type === "date") {
    return <DateFieldInput value={value} onChange={onChange} autoFocus={autoFocus} />;
  }
  // text (default) — with the shared formatting toolbar (v0.311.0); the
  // value renders through MarkdownText, which shows the formatting.
  return <TextFieldEditor value={value} onChange={onChange} autoFocus={autoFocus} />;
}

function TextFieldEditor({ value, onChange, autoFocus }) {
  const ref = useRef(null);
  const tb = useFieldToolbar({ fieldRef: ref, value, onChange });
  return (
    <div className="flex-1 min-w-0">
      <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onFocus={tb.onFocus} onBlur={tb.onBlur}
        className="text-sm min-h-[60px]" autoFocus={autoFocus} />
      {tb.toolbar}
    </div>
  );
}

