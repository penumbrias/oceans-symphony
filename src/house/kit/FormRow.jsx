// The form row (new house step 1.2): label · value · Edit. Editing a record
// looks like its Info, one row at a time: the row shows the value in words,
// Edit opens the field in place, and Save / Cancel close it again.
//
//   <Form>
//     <FormRow label="Name" value={alter.name} empty="No name yet"
//       editing={editing === "name"} onEdit={() => setEditing("name")}
//       onSave={save} onCancel={() => setEditing(null)} saving={busy}>
//       <TextField label="Name" value={draft} onChange={setDraft} />
//     </FormRow>
//   </Form>
//
// The row never writes anything itself: `onSave` is the record's one write
// path. Save is the only primary button in an open row (building code §1);
// Cancel sits just left of it. A row without `onEdit` is read-only and says
// so to a screen reader ("can't be changed here") when `lockedReason` is set.

import React, { useEffect, useRef } from "react";
import { Lock, Pencil } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button } from "@/house/kit/Button";
import "@/house/kit/kit.css";

export function Form({ children, label, className = "" }) {
  return <div className={`hk-form ${className}`} role="group" aria-label={label}>{children}</div>;
}

export function FormRow({ label, value, empty = "Not set", editing = false, onEdit, onSave, onCancel, saving = false, saveDisabledReason, lockedReason, children }) {
  const editRef = useRef(null);
  const rowRef = useRef(null);
  const wasEditing = useRef(editing);
  useEffect(() => {
    // Focus moves into the field on Edit, and back to Edit on close.
    if (editing && !wasEditing.current) rowRef.current?.querySelector("input, textarea, button[aria-haspopup]")?.focus();
    if (!editing && wasEditing.current) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  const name = typeof label === "string" ? label : "this";
  if (editing) {
    return (
      <div ref={rowRef} className="hk-formrow" data-editing="true">
        {children}
        <div className="hk-formrow-actions">
          <Button rank="secondary" onClick={onCancel}>Cancel</Button>
          <Button rank="primary" onClick={onSave} busy={saving} busyLabel="Saving…" disabledReason={saveDisabledReason}>Save</Button>
        </div>
      </div>
    );
  }
  return (
    <div ref={rowRef} className="hk-formrow">
      <span className="hk-formrow-label">{label}</span>
      <span className="hk-formrow-value" data-empty={isEmpty || undefined}>{isEmpty ? empty : value}</span>
      {onEdit ? (
        <Button ref={editRef} rank="quiet" icon={Pencil} onClick={onEdit} aria-label={`Edit ${name}`}>Edit</Button>
      ) : lockedReason ? (
        <span className="hk-hint" title={lockedReason}>
          <HouseIcon icon={Lock} size="inline" label={`${name} can't be changed here: ${lockedReason}`} />
        </span>
      ) : <span />}
    </div>
  );
}

export default FormRow;
