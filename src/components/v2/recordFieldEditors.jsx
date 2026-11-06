// Fill fields in from a widget's Content tab (v0.365.0).
//
// The garden: a profile's record is the source of truth and widgets only
// show it — but the widget's options are also a door to the record, so the
// person can fill in what a widget shows without hunting for the edit form.
// Everything here writes through the record's own write path
// (alterInfoEntries / groupInfoEntries / contactFields / innerWorldModel)
// and saves as the person types, the same as Alter info does.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { StackedRow } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { BioEntry, inputCls, areaCls } from "@/components/alters/info/entryEditors";
import { useSubjectGroup } from "@/v2/gardenGroupWidgets";
import { useSubjectLocation } from "@/v2/gardenLocationWidgets";
import { useSubjectContact } from "@/v2/gardenContactWidgets";
import { writeGroupEntry } from "@/lib/groupInfoEntries";
import { updateLocationText } from "@/lib/innerWorldModel";
import { writeContactField, writeContactCustomField } from "@/lib/contactFields";
import { contactDisplayName } from "@/lib/contacts";


function EditsNote({ name }) {
  return (
    <p className="text-xs text-muted-foreground pt-1">
      This edits {name}'s info, the same as their edit form. It saves as you go.
    </p>
  );
}

// ── Groups, locations and contacts ───────────────────────────────────

const useWriter = (queryKey) => {
  const qc = useQueryClient();
  return (fn) => async (v) => {
    try { await fn(v); qc.invalidateQueries({ queryKey }); } catch (e) { toast.error(e?.message || "Couldn't save that"); }
  };
};

const NameRow = ({ k, label = "Name", value, onCommit }) => (
  <StackedRow label={label}>
    <DebouncedText key={k} value={value || ""} onCommit={onCommit} maxLength={200} ariaLabel={label} className={inputCls} />
  </StackedRow>
);

const DescriptionRow = ({ k, label = "Description", value, onCommit }) => (
  <StackedRow label={label}>
    <BioEntry k={k} value={value || ""} onChange={onCommit} />
  </StackedRow>
);

function GroupFieldsEditor({ fields }) {
  const group = useSubjectGroup();
  const write = useWriter(["groups"]);
  if (!group) return null;
  return (
    <div data-record-fields-editor="group">
      <EditsNote name={group.name || "this group"} />
      {fields.includes("name") && <NameRow k={`group:${group.id}:name`} value={group.name} onCommit={write((v) => writeGroupEntry(group.id, "basic:name", v))} />}
      {fields.includes("description") && <DescriptionRow k={`group:${group.id}:bio`} value={group.description} onCommit={write((v) => writeGroupEntry(group.id, "bio", v))} />}
    </div>
  );
}

function LocationFieldsEditor({ fields }) {
  const location = useSubjectLocation();
  const write = useWriter(["innerWorldLocations"]);
  if (!location) return null;
  return (
    <div data-record-fields-editor="location">
      <EditsNote name={location.name || "this location"} />
      {fields.includes("name") && <NameRow k={`loc:${location.id}:name`} value={location.name} onCommit={write((v) => updateLocationText(location.id, { name: v }))} />}
      {fields.includes("description") && <DescriptionRow k={`loc:${location.id}:desc`} value={location.description} onCommit={write((v) => updateLocationText(location.id, { description: v }))} />}
    </div>
  );
}

// The contact detail fields, matching ContactDetailsWidget's ids.
const CONTACT_DETAILS = [
  { id: "about", label: () => "About" },
  { id: "safe_to_share", label: () => "Safe to share" },
  { id: "boundaries", label: () => "Boundaries" },
  { id: "system_rules", label: (t) => `${t.System} rules` },
];
const CONTACT_DETAIL_DEFAULT = ["about", "safe_to_share", "*custom"];

function ContactFieldsEditor({ part, settings }) {
  const t = useTerms();
  const contact = useSubjectContact();
  const write = useWriter(["contacts"]);
  const { data: defs = [] } = useQuery({ queryKey: ["contactCustomFields"], queryFn: () => base44.entities.ContactCustomField.list(), enabled: part === "details" });
  if (!contact) return null;
  const area = (k, label, value, onCommit) => (
    <StackedRow key={k} label={label}>
      <DebouncedText key={k} value={value || ""} onCommit={onCommit} multiline rows={3} maxLength={5000} ariaLabel={label} className={areaCls} />
    </StackedRow>
  );
  let rows;
  if (part === "identity") {
    rows = (
      <>
        <NameRow k={`contact:${contact.id}:name`} value={contact.name} onCommit={write((v) => writeContactField(contact.id, "name", v))} />
        <NameRow k={`contact:${contact.id}:nick`} label="Nickname" value={contact.nickname} onCommit={write((v) => writeContactField(contact.id, "nickname", v))} />
        <NameRow k={`contact:${contact.id}:rel`} label="How you know them" value={contact.relationship_label} onCommit={write((v) => writeContactField(contact.id, "relationship_label", v))} />
      </>
    );
  } else {
    const ids = Array.isArray(settings?.entries) && settings.entries.length ? settings.entries : CONTACT_DETAIL_DEFAULT;
    const sortedDefs = [...defs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));
    const out = [];
    for (const id of ids) {
      const builtIn = CONTACT_DETAILS.find((d) => d.id === id);
      if (builtIn) {
        out.push(area(`contact:${contact.id}:${id}`, builtIn.label(t), contact[id], write((v) => writeContactField(contact.id, id, v))));
        continue;
      }
      const picked = id === "*custom" ? sortedDefs.filter((d) => !ids.includes(`field:${d.id}`))
        : id.startsWith("field:") ? sortedDefs.filter((d) => `field:${d.id}` === id) : [];
      for (const def of picked) {
        out.push(area(`contact:${contact.id}:f:${def.id}`, def.name || "Untitled", contact.custom_fields?.[def.id],
          write((v) => writeContactCustomField(contact.id, def.id, v))));
      }
    }
    rows = out.length ? out : <p className="text-xs text-muted-foreground py-2">Pick what this widget shows above, then fill it in here.</p>;
  }
  return (
    <div data-record-fields-editor="contact">
      <EditsNote name={contactDisplayName(contact)} />
      {rows}
    </div>
  );
}

// Config fields, one per widget: `{ key, type: "component", Component }`.
// (Function declarations with no module state, safe to call while the
// widget registries load.)
export function groupFieldsField(fields) {
  function GroupFields(props) { return <GroupFieldsEditor {...props} fields={fields} />; }
  return { key: `_group_${fields.join("_")}`, type: "component", label: "", Component: GroupFields };
}
export function locationFieldsField(fields) {
  function LocationFields(props) { return <LocationFieldsEditor {...props} fields={fields} />; }
  return { key: `_location_${fields.join("_")}`, type: "component", label: "", Component: LocationFields };
}
export function contactFieldsField(part) {
  function ContactFields(props) { return <ContactFieldsEditor {...props} part={part} />; }
  return { key: `_contact_${part}`, type: "component", label: "", Component: ContactFields };
}
