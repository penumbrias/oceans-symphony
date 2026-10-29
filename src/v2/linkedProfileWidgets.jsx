// Profile widgets anywhere (v0.315.0). Every purpose-built profile widget
// (the garden widgets: an alter's Identity, a group's members, a contact's
// details, a location's alters…) can also sit on the home screen, or on a
// different kind of profile. Placed there, it has no page to belong to, so
// its options start with a picker for WHOSE it is ("Which group"), saved on
// the widget's settings:
//
//   alter    → settings.alterId     (the alter widgets already read it
//                                    through useInfoAlter)
//   group    → settings.groupId     ┐ handed to the widget as its board
//   contact  → settings.contactId   │ subject (boardSubjectFor), so it reads
//   location → settings.locationId  ┘ the record the same way it does on
//                                     its own profile
//
// The ids are the garden widgets' own ids (they're already named by type,
// alter_identity, group_members…), so a profile board of that type still
// resolves them to its own widget and nothing stored changes.

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { boxStyle } from "@/v2/primitives";
import { StackedRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import GroupSelect from "@/components/groups/GroupSelect";
import { contactDisplayName } from "@/lib/contacts";
import { GARDEN_ALTER_WIDGETS } from "@/v2/gardenProfileWidgets";
import { GARDEN_CONNECTION_WIDGETS } from "@/v2/gardenConnectionWidgets";
import { GARDEN_GROUP_WIDGETS } from "@/v2/gardenGroupWidgets";
import { GARDEN_CONTACT_WIDGETS } from "@/v2/gardenContactWidgets";
import { GARDEN_LOCATION_WIDGETS } from "@/v2/gardenLocationWidgets";

export const LINK_KEYS = { alter: "alterId", group: "groupId", contact: "contactId", location: "locationId" };
const TYPE_LABEL = { alter: "{{Alter}}", group: "Group", contact: "Contact", location: "Location" };
const WHICH = { alter: "Whose", group: "Which group", contact: "Which contact", location: "Which location" };
const CHOOSE = { alter: "Choose an {{alter}}…", group: "Choose a group…", contact: "Choose a contact…", location: "Choose a location…" };

// The menu group each type's widgets are listed under (widgetMenuGroups.js).
export const linkedCategory = (type) => `linked_${type}`;

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

// The widget's first option row: whose it is.
function linkField(type) {
  const key = LINK_KEYS[type];
  const Picker = PICKERS[type];
  function LinkRow({ settings, set }) {
    const t = useTerms();
    return (
      <StackedRow label={applyTerms(WHICH[type], t)}>
        <Picker value={settings?.[key] || ""} onChange={(id) => set({ [key]: id })} />
      </StackedRow>
    );
  }
  return { key: `_link_${type}`, type: "component", label: "", Component: LinkRow };
}

function LinkedBody({ type, def, props }) {
  const t = useTerms();
  if (!props.settings?.[LINK_KEYS[type]]) {
    const what = { alter: "{{alter}}", group: "group", contact: "contact", location: "location" }[type];
    return (
      <div className="h-full flex items-center justify-center text-center text-[0.8125em] opacity-70 p-2"
        style={boxStyle({ borderFallback: false, padFallback: false })}>
        {applyTerms(`Choose which ${what} this shows in its options.`, t)}
      </div>
    );
  }
  return def.render(props);
}

const labelFor = (type, label = "") => {
  const prefix = TYPE_LABEL[type];
  const bare = prefix.replace(/[{}]/g, "").toLowerCase();
  return label.toLowerCase().startsWith(bare) ? label : `${prefix}: ${label}`;
};

export function linkedWidget(type, def) {
  const key = LINK_KEYS[type];
  return {
    ...def,
    label: labelFor(type, def.label),
    // Its own name, for the menu's per-kind headings (v0.316.0).
    menuLabel: def.label,
    category: linkedCategory(type),
    subjects: ["home", "alter", "group", "contact", "location"],
    supportsMultiInstance: true,
    configFields: [linkField(type), ...(def.configFields || [])],
    // Added without a record picked: the board opens the options first.
    needsSetup: (settings) => !settings?.[key],
    // The alter widgets read settings.alterId themselves; the others read
    // the board subject, so they're handed the picked record as theirs.
    ...(type === "alter" ? {} : {
      boardSubjectFor: (settings) => ({ type, id: settings?.[key] || null, linked: true }),
    }),
    render: (props) => <LinkedBody type={type} def={def} props={props} />,
  };
}

const GARDEN_BY_TYPE = {
  alter: { ...GARDEN_ALTER_WIDGETS, ...GARDEN_CONNECTION_WIDGETS },
  group: GARDEN_GROUP_WIDGETS,
  contact: GARDEN_CONTACT_WIDGETS,
  location: GARDEN_LOCATION_WIDGETS,
};

// Every profile widget, set up to be placed anywhere with a picked record.
export const LINKED_PROFILE_WIDGETS = Object.fromEntries(
  Object.entries(GARDEN_BY_TYPE).flatMap(([type, defs]) =>
    Object.entries(defs).map(([id, def]) => [id, linkedWidget(type, def)])),
);

// The add-widget menu previews a placed-anywhere profile widget with the
// first record of its kind, so the preview shows the widget rather than
// "choose which…" (v0.316.0). Same queries as the pickers above.
const PREVIEW_SOURCES = {
  alter: { queryKey: ["alters"], list: () => base44.entities.Alter.list(), usable: (r) => !r.is_archived },
  group: { queryKey: ["groups"], list: () => base44.entities.Group.list(), usable: () => true },
  contact: { queryKey: ["contacts"], list: () => base44.entities.Contact.list(), usable: (r) => !r.is_archived },
  location: { queryKey: ["innerWorldLocations"], list: () => base44.entities.InnerWorldLocation.list(), usable: () => true },
};

export function useLinkedPreviewSettings(def) {
  const type = Object.keys(LINK_KEYS).find((k) => def?.category === linkedCategory(k)) || null;
  const source = PREVIEW_SOURCES[type || "alter"];
  const { data = [] } = useQuery({ queryKey: source.queryKey, queryFn: source.list, enabled: !!type });
  return useMemo(() => {
    if (!type) return {};
    const first = (Array.isArray(data) ? data : []).find(source.usable);
    return first ? { [LINK_KEYS[type]]: first.id } : {};
  }, [type, data, source]);
}
