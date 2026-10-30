// Editors for one entry of an alter's info (v0.295.0) — shared by the Alter
// info list and the Info widget's Content tab, so an entry edits the same
// way wherever it is. Each commits through `onCommit` / `onChange`; the
// caller decides where it is written.

import React from "react";
import { Segmented } from "@/components/shared/SettingRows";
import { DebouncedText, RichTextField } from "@/components/shared/DebouncedFields";
import BioEditor from "@/components/alters/BioEditor";
import { DateFieldInput } from "@/components/alters/profile/fieldControls";

export const inputBase = "h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring";
export const inputCls = `${inputBase} w-full`;
export const areaCls = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring";
export const smallBtn = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-40";

// The kinds an entry can be — the custom-field types, named for people.
export const ENTRY_KINDS = [
  { value: "text", label: "Short text" },
  { value: "richtext", label: "Long text" },
  { value: "list", label: "List" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
];
export const KIND_LABEL = Object.fromEntries(ENTRY_KINDS.map((k) => [k.value, k.label]));

// One entry's value, edited in place. `k` re-seeds the draft after undo.
export function EntryInput({ k, type, value, onCommit, label }) {
  const v = value ?? "";
  if (type === "richtext") {
    return <RichTextField key={k} value={String(v)} onCommit={onCommit} placeholder="Write…" />;
  }
  if (type === "boolean") {
    const on = v === true || v === "true" ? "true" : v === false || v === "false" ? "false" : "";
    return (
      <Segmented label={label} equal={false} value={on} onChange={onCommit}
        options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }, { value: "", label: "Not set" }]} />
    );
  }
  if (type === "date") return <DateFieldInput key={k} value={String(v)} onChange={onCommit} />;
  if (type === "number") {
    return <DebouncedText key={k} value={String(v)} onCommit={onCommit} type="number" inputMode="decimal" ariaLabel={label} className={`${inputBase} w-28`} />;
  }
  return (
    <div className="space-y-1">
      {/* Short text is one line, unless it already holds line breaks (a
          one-line box would drop them). */}
      {/* Text entries carry the shared formatting toolbar while focused
          (owner, v0.311.0); a list stays plain — its commas are the data. */}
      {type === "list" || String(v).includes("\n")
        ? <DebouncedText key={k} value={String(v)} onCommit={onCommit} multiline rows={2} toolbar={type !== "list"}
            maxLength={5000} ariaLabel={label} placeholder={type === "list" ? "item, item, item" : "Not filled yet"} className={areaCls} />
        : <DebouncedText key={k} value={String(v)} onCommit={onCommit} toolbar
            maxLength={5000} ariaLabel={label} placeholder="Not filled yet" className={inputCls} />}
      {type === "list" && <p className="text-[0.6875rem] text-muted-foreground">Separate items with commas.</p>}
    </div>
  );
}

// ── The bio: one long-text entry ─────────────────────────────────────
// The bio IS the full editor (v0.320.0): Plain / Simple / Blocks / Raw
// modes, templates, "paste from another app" and the preview, right here —
// no small box with a "Full editor" button in front of it. The same editor
// serves Alter info and the Bio widget's Content tab. `data-vaul-no-drag`
// keeps the options sheet (a drawer) from treating a touch in the editor
// as a drag of the sheet.
export function BioEntry({ k, value, onChange }) {
  return (
    <div className="space-y-2" data-info-bio="" data-vaul-no-drag="">
      <BioEditor key={k} value={value || ""} onChange={onChange} label={null} placeholder="Write a bio…" />
    </div>
  );
}

