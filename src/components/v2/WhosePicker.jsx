// "Whose" — the picker that says which record a profile widget shows
// (v0.315.0, shared since v0.328.1). One row for every place it appears:
//
//   - a profile widget placed on the home screen or on another kind of
//     profile: just the picker (it has no page of its own to show);
//   - a profile widget on its own kind of profile: "This alter" (the page
//     it sits on, the default) or "Another alter" and the picker;
//   - the Image widget's alter pictures: the same, by whichever board it's on.
//
// Saved on the widget's settings: the record id under LINK_KEYS[type]
// (alterId, groupId, contactId, locationId) and, on its own kind of
// profile, whose: "other" while it shows someone else. Nothing else reads
// `whose`, so a widget placed before keeps showing what it showed.

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { StackedRow, ChoiceRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import GroupSelect from "@/components/groups/GroupSelect";
import { contactDisplayName } from "@/lib/contacts";

export const LINK_KEYS = { alter: "alterId", group: "groupId", contact: "contactId", location: "locationId" };
const WHICH = { alter: "Whose", group: "Which group", contact: "Which contact", location: "Which location" };
const CHOOSE = { alter: "Choose an {{alter}}…", group: "Choose a group…", contact: "Choose a contact…", location: "Choose a location…" };
const THIS = { alter: "This {{alter}}", group: "This group", contact: "This contact", location: "This location" };
const ANOTHER = { alter: "Another {{alter}}", group: "Another group", contact: "Another contact", location: "Another location" };

// On its own kind of profile: does this widget show someone else?
export const showsOther = (settings) => settings?.whose === "other";

function AlterLink({ value, onChange }) {
  const t = useTerms();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  return (
    <AlterSearchSelect alters={alters.filter((a) => !a.is_archived)} value={value || null}
      onChange={(id) => onChange(id || "")} terms={t} showNone={false} zIndex={120}
      placeholder={applyTerms(CHOOSE.alter, t)} />
  );
}

function GroupLink({ value, onChange }) {
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  return <GroupSelect groups={groups} value={value || ""} onChange={(id) => onChange(id || "")} placeholder={CHOOSE.group} zIndex={120} />;
}

function ContactLink({ value, onChange }) {
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const options = useMemo(() => contacts
    .filter((c) => !c.is_archived || c.id === value)
    .map((c) => ({ id: c.id, label: contactDisplayName(c) || "Contact", color: c.color }))
    .sort((a, b) => a.label.localeCompare(b.label)), [contacts, value]);
  return <SearchableSelect value={value || null} onChange={(id) => onChange(id || "")} options={options}
    placeholder={CHOOSE.contact} searchPlaceholder="Search contacts…" />;
}

// Locations sit on maps and layers; each one says where, and they're listed
// map by map so two "Bedroom"s on different maps are told apart.
function LocationLink({ value, onChange }) {
  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list() });
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => base44.entities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => base44.entities.InnerWorldLayer.list() });
  const options = useMemo(() => {
    const mapName = (id) => maps.find((m) => m.id === id)?.name || "";
    const layerName = (id) => layers.find((l) => l.id === id)?.name || "";
    return locations
      .map((l) => ({ id: l.id, label: l.name || "Location", color: l.color, sublabel: [mapName(l.map_id), layerName(l.layer_id)].filter(Boolean).join(" · ") }))
      .sort((a, b) => a.sublabel.localeCompare(b.sublabel) || a.label.localeCompare(b.label));
  }, [locations, maps, layers]);
  return <SearchableSelect value={value || null} onChange={(id) => onChange(id || "")} options={options}
    placeholder={CHOOSE.location} searchPlaceholder="Search locations…" />;
}

const PICKERS = { alter: AlterLink, group: GroupLink, contact: ContactLink, location: LocationLink };

export function WhoseRow({ type, settings, set, ownProfile = false }) {
  const t = useTerms();
  const key = LINK_KEYS[type];
  const Picker = PICKERS[type];
  const label = applyTerms(WHICH[type], t);
  const picker = <Picker value={settings?.[key] || ""} onChange={(id) => set({ [key]: id })} />;
  if (!ownProfile) return <StackedRow label={label}>{picker}</StackedRow>;
  const other = showsOther(settings);
  return (
    <>
      <ChoiceRow label={label} value={other ? "other" : "this"}
        options={[{ value: "this", label: applyTerms(THIS[type], t) }, { value: "other", label: applyTerms(ANOTHER[type], t) }]}
        onChange={(v) => set({ whose: v === "other" ? "other" : "" })} />
      {other && <StackedRow label={applyTerms(type === "alter" ? "{{Alter}}" : type[0].toUpperCase() + type.slice(1), t)}>{picker}</StackedRow>}
    </>
  );
}
