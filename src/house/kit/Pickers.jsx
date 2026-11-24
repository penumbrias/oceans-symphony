// The kit's pickers (new house step 1.2). Each one is a house-styled field
// around TODAY's shared picker, never a new implementation (CLAUDE.md:
// reuse existing components), so search, grouping, nesting, the person's
// alter label mode and the colour picker's hex field all keep working:
//
//   AlterPicker   → AlterSearchSelect  (searchable, fronters first, groups)
//   NestedPicker  → SearchableSelect   (depth-tagged options, indented; build
//                                       them with the feature's own cycle-
//                                       guarded flattener, e.g. flattenGroupTree)
//   ColourField   → ColorPicker        (react-colorful + hex; never the browser's)
//   IconField     → IconPicker         (any Lucide icon, or an image)
//   AssetField    → AssetPickerModal   (the person's asset library)
//
// The field (label, hint, error, save state, 44 px trigger, focus ring) is
// the house's; the pop-up is still the shared component's own until step
// 1.3 gives the kit its sheets.

import React, { useState } from "react";
import { ImageIcon, Images, Shapes, X } from "lucide-react";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import ColorPicker from "@/components/shared/ColorPicker";
import IconPicker from "@/components/shared/IconPicker";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { IconSlot } from "@/components/shared/LucideByName";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { Button, IconButton } from "@/house/kit/Button";
import { FieldShell } from "@/house/kit/Field";
import "@/house/kit/kit.css";

// ── Alter ─────────────────────────────────────────────────────────────
export function AlterPicker({ label, hint, error, save, value, onChange, alters: altersProp, showNone = true, noneLabel = "No one", disabledIds, placeholder }) {
  const terms = useTerms();
  const { data: fetched = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !altersProp });
  const alters = (altersProp || fetched).filter((a) => !a.is_archived);
  return (
    <FieldShell label={label ?? terms.Alter} hint={hint} error={error} save={save} labelAs="span" className="hk-picker">
      {({ inputId, labelId }) => (
        <AlterSearchSelect
          alters={alters}
          value={value ?? null}
          onChange={onChange}
          terms={terms}
          placeholder={placeholder ?? `Choose ${an(terms.alter)}`}
          showNone={showNone}
          noneLabel={noneLabel}
          disabledIds={disabledIds}
          buttonClassName="hk-picker-trigger"
          triggerId={inputId}
          triggerLabelledBy={`${labelId} ${inputId}`}
          zIndex={260}
        />
      )}
    </FieldShell>
  );
}

// ── Nested list ───────────────────────────────────────────────────────
// `options`: [{ id, label, color?, _depth }], already flattened in order.
const indentOption = (o) => (
  <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0 }}>
    {o._depth > 0 ? <span aria-hidden="true" style={{ width: `${Math.min(o._depth, 6) * 0.875}rem`, flexShrink: 0 }} /> : null}
    {o._depth > 0 ? <span aria-hidden="true">↳</span> : null}
    {o.color ? <span aria-hidden="true" style={{ width: "0.625rem", height: "0.625rem", borderRadius: "50%", background: o.color, flexShrink: 0 }} /> : null}
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
  </span>
);

export function NestedPicker({ label, hint, error, save, value, onChange, options = [], placeholder = "Choose…", searchPlaceholder = "Search…", allowClear = false, emptyMessage = "Nothing matches" }) {
  return (
    <FieldShell label={label} hint={hint} error={error} save={save} labelAs="span" className="hk-picker">
      {({ inputId, labelId }) => (
        <SearchableSelect
          value={value ?? null}
          onChange={onChange}
          options={options}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          allowClear={allowClear}
          renderOption={indentOption}
          triggerId={inputId}
          triggerLabelledBy={`${labelId} ${inputId}`}
        />
      )}
    </FieldShell>
  );
}

// ── Colour ────────────────────────────────────────────────────────────
export function ColourField({ label, hint, error, save, value, onChange, onClear }) {
  return (
    <FieldShell label={label} hint={hint} error={error} save={save} labelAs="span">
      {() => (
        <div className="hk-colour">
          <ColorPicker compact caption={false} label={label} value={value || "#888888"} onChange={onChange} onClear={onClear} />
          <span className="hk-colour-value">{value ? String(value).toUpperCase() : "No colour yet"}</span>
        </div>
      )}
    </FieldShell>
  );
}

// ── Icon ──────────────────────────────────────────────────────────────
// `value`: { iconName } or { iconUrl } (what IconPicker hands back).
export function IconField({ label, hint, error, save, value, onChange, allowImage = true }) {
  const [open, setOpen] = useState(false);
  const has = !!(value?.iconName || value?.iconUrl);
  return (
    <FieldShell label={label} hint={hint} error={error} save={save} labelAs="span">
      {({ labelId }) => (
        <div className="hk-pickrow" role="group" aria-labelledby={labelId}>
          <span className="hk-iconpick-preview" aria-hidden="true">
            <IconSlot override={has ? value : null} Default={Shapes} style={{ width: "var(--house-icon-bar)", height: "var(--house-icon-bar)" }} />
          </span>
          <span className="hk-hint">{value?.iconName || (value?.iconUrl ? "A picture" : "The usual icon")}</span>
          <Button rank="secondary" onClick={() => setOpen(true)}>Choose icon</Button>
          {has ? <IconButton icon={X} label={`${label}: back to the usual icon`} onClick={() => onChange?.({ iconName: "", iconUrl: "" })} /> : null}
          <IconPicker open={open} onClose={() => setOpen(false)} current={value?.iconName || ""} allowImage={allowImage} title={label}
            onPick={(v) => onChange?.(v)} />
        </div>
      )}
    </FieldShell>
  );
}

// ── Asset (a picture from the person's library) ───────────────────────
export function AssetField({ label, hint, error, save, value, onChange, kind = "image" }) {
  const [open, setOpen] = useState(false);
  const src = useResolvedAvatarUrl(value || null);
  return (
    <FieldShell label={label} hint={hint} error={error} save={save} labelAs="span">
      {({ labelId }) => (
        <div className="hk-pickrow" role="group" aria-labelledby={labelId}>
          <span className="hk-iconpick-preview">
            {src ? <img src={src} alt="" /> : <ImageIcon aria-hidden="true" style={{ width: "var(--house-icon-control)", height: "var(--house-icon-control)" }} />}
          </span>
          <span className="hk-hint">{value ? "Picture chosen" : "No picture yet"}</span>
          <Button rank="secondary" icon={Images} onClick={() => setOpen(true)}>Choose from assets</Button>
          {value ? <IconButton icon={X} label={`${label}: remove the picture`} onClick={() => onChange?.(null)} /> : null}
          <AssetPickerModal open={open} kind={kind} onClose={() => setOpen(false)}
            onSelect={(url) => { onChange?.(url); setOpen(false); }} />
        </div>
      )}
    </FieldShell>
  );
}
