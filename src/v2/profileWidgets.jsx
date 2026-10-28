// Profile widgets (v0.290.0 alters; v0.291.0 groups, contacts and
// locations) — a profile page as widgets on the home-screen canvas
// (ExperimentalDashboard), one per section or tab.
//
// Each widget reads WHOSE page it is on from the board subject
// (useBoardSubject, boardSubject.js) and fetches that record itself, so a
// widget can be placed anywhere on the profile board. The pieces inside
// are the same components the pages use (ProfileSections.jsx,
// GroupSections.jsx, ContactSections.jsx, LocationSections.jsx and the
// alter profile's tab components) — one copy of each, never forked here.
//
// PROFILE_WIDGETS is keyed by owner type. The same widget id (profile_header,
// profile_bio, profile_notes…) means "that section of THIS kind of profile",
// so a seeded board (profileBoard.js) names sections the same way for every
// type and profileRegistryFor(type) resolves them to the type's own widgets.
//
// The box: a profile widget's one visible box (widget contract) is a
// ProfileBox — borderless and flush until the person sets a border,
// background or padding in the widget's options, so a seeded profile
// board looks exactly like the page did before (v0.289.0 promise), and
// every look setting still reaches it.

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  User, IdCard, MessageSquare, Mail, TrendingUp, FileText, Heart, BookOpen,
  GitMerge, Link2, MapPin, Zap, SlidersHorizontal, Tag, Users, Folder,
  ListChecks, HeartHandshake, AlignLeft, Sparkles, UserCheck, Info, Shield, Map as MapIcon,
  Landmark,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { infoEditorField } from "@/components/v2/profileInfoEditors";
import { boxStyle, useWidgetChrome } from "@/v2/primitives";
import { useBoardSubject, widgetFitsSubject } from "@/lib/boardSubject";
import {
  GroupHeaderSection, GroupBioSection, GroupNestedSection, GroupMembersSection,
  GroupBoardSection, GroupNotesSection, GroupJournalSection,
} from "@/components/groups/GroupSections";
import {
  ContactHeaderSection, ContactEncounterSection, ContactAboutSection, ContactRelationshipsSection,
  ContactBoundariesSection, ContactNotesSection, ContactOptionsSection,
} from "@/components/contacts/ContactSections";
import {
  LocationHeaderSection, LocationBioSection, LocationSubLocationsSection, LocationMembersSection, LocationOnMapSection,
} from "@/components/systemmap/LocationSections";
import { PROFILE_OWNER_TYPES } from "@/lib/profileBoard";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import {
  ProfileHeaderSection, ProfilePreferencesSection, ProfileBioSection, ProfileGroupsSection,
  ProfileSubsystemsSection, ProfileAnswersSection, ProfileTagsSection, ProfileFieldsSection,
} from "@/components/alters/profile/ProfileSections";
import InfoTab from "@/components/alters/profile/InfoTab";
import HistoryTab from "@/components/alters/profile/HistoryTab";
import NotesTab from "@/components/alters/profile/NotesTab";
import WishlistTab from "@/components/alters/profile/WishlistTab";
import MessagesTab from "@/components/alters/profile/MessagesTab";
import PrivateMessagesTab from "@/components/alters/profile/PrivateMessagesTab";
import OptionsTab from "@/components/alters/profile/OptionsTab";
import LineageTab from "@/components/alters/profile/LineageTab";
import RelationshipsTab from "@/components/alters/profile/RelationshipsTab";
import LocationsTab from "@/components/alters/profile/LocationsTab";
import ActivitiesTab from "@/components/alters/profile/ActivitiesTab";
import ProfileJournalTab from "@/components/journal/ProfileJournalTab";

// The record whose page this is, by owner type. Same query keys the pages
// themselves use, so a widget and the page chrome never disagree.
const RECORD_QUERY = {
  alter: {
    key: (id) => ["alter", id],
    fn: async (id) => (await base44.entities.Alter.list()).find((a) => String(a.id) === String(id)) || null,
  },
  // Resolve a group by entity id OR sp_id — alter.groups stores `sp_id || id`.
  group: {
    key: () => ["groups"],
    fn: () => base44.entities.Group.list(),
    pick: (rows, id) => (rows || []).find((g) => String(g.id) === String(id) || (g.sp_id && String(g.sp_id) === String(id))) || null,
  },
  contact: {
    key: () => ["contacts"],
    fn: () => base44.entities.Contact.list(),
    pick: (rows, id) => (rows || []).find((c) => String(c.id) === String(id)) || null,
  },
  location: {
    key: () => ["innerWorldLocations"],
    fn: () => base44.entities.InnerWorldLocation.list(),
    pick: (rows, id) => (rows || []).find((l) => String(l.id) === String(id)) || null,
  },
};

export function useSubjectRecord(type) {
  const subject = useBoardSubject();
  const id = subject?.type === type ? subject.id : null;
  const q = RECORD_QUERY[type] || RECORD_QUERY.alter;
  const { data = null } = useQuery({
    queryKey: q.key(id),
    queryFn: () => q.fn(id),
    enabled: !!id,
    ...(q.pick ? {} : { staleTime: 0 }),
  });
  if (!id) return null;
  return q.pick ? q.pick(data, id) : data;
}

export const useSubjectAlter = () => useSubjectRecord("alter");

const useAlters = () => useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() }).data || [];
const useSystemFields = () => useQuery({ queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list("order") }).data || [];

// The one visible box. `label` is only drawn when the person named the
// widget (the sections carry their own headings, as the page always did).
export function ProfileBox({ children, name = "" }) {
  const chrome = useWidgetChrome();
  const ownName = typeof chrome.label === "string" ? chrome.label.trim() : "";
  const showLabel = !!ownName && !chrome.hideLabel;
  // A section with nothing to show (no groups, no tags…) renders nothing,
  // as the page always did. While the layout is being edited it shows its
  // name instead, so the person can tell the empty box apart from a gap
  // (index.css shows .pf-widget-empty only under html[data-home-edit]).
  const bodyRef = React.useRef(null);
  const [empty, setEmpty] = React.useState(false);
  React.useEffect(() => {
    const isEmpty = !!bodyRef.current && bodyRef.current.childElementCount === 0 && !bodyRef.current.textContent;
    if (isEmpty !== empty) setEmpty(isEmpty);
  });
  return (
    <section className="h-full flex flex-col min-h-0" data-widget-box="1" style={boxStyle({ borderFallback: false, padFallback: false })}>
      {showLabel && (
        <h2 data-widget-label="" className="text-[0.6875em] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex-shrink-0">{ownName}</h2>
      )}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {empty && (
        <div className="pf-widget-empty flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 text-[0.75em] text-muted-foreground px-3 text-center" aria-hidden="true">
          {ownName || name} — nothing to show yet
        </div>
      )}
    </section>
  );
}

// A widget for one section of a `type` profile. The section gets the
// record under the type's own prop name (`alter`, `group`, `contact`,
// `location`).
const sectionOf = (type) => (SectionView, { needsFields = false, name = "" } = {}) => function ProfileSectionWidget() {
  const record = useSubjectRecord(type);
  const systemFields = useSystemFields();
  const t = useTerms();
  if (!record) return null;
  return <ProfileBox name={applyTerms(name, t)}><SectionView {...{ [type]: record }} {...(needsFields ? { systemFields } : {})} /></ProfileBox>;
};
const section = sectionOf("alter");

// A widget for a whole tab's component.
const tab = (render) => function ProfileTabWidget() {
  const alter = useSubjectAlter();
  const alters = useAlters();
  const systemFields = useSystemFields();
  const [searchParams] = useSearchParams();
  if (!alter) return null;
  return <ProfileBox>{render({ alter, alters, systemFields, searchParams })}</ProfileBox>;
};

const widgetOf = (type) => (label, description, icon, Component, spans = {}) => ({
  label, description, icon, category: "profile", subjects: [type],
  render: () => <Component />,
  supportsModes: ["normal"], supportsMultiInstance: false,
  defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 40 },
  ...spans,
});
const W = widgetOf("alter");
// A widget's Content tab edits the info it shows (v0.296.0).
const info = (section) => ({ configFields: [infoEditorField(section)] });

export const ALTER_PROFILE_WIDGETS = {
  profile_header: W("Header", "Avatar, name, pronouns, birthday and role — the top of the {{alter}}'s page.", User,
    section(ProfileHeaderSection, { needsFields: true, name: "Header" }), info("basics")),
  profile_preferences: W("Preferences & boundaries", "The {{alter}}'s comfort levels, as chips.", HeartHandshake,
    section(ProfilePreferencesSection, { name: "Preferences & boundaries" }), info("preferences")),
  profile_bio: W("Bio", "The {{alter}}'s bio.", AlignLeft, section(ProfileBioSection, { name: "Bio" }), info("bio")),
  profile_groups: W("Groups", "The groups this {{alter}} is in.", Users, section(ProfileGroupsSection, { name: "Groups" }), info("groups")),
  profile_subsystems: W("Sub{{system}}s", "The sub{{system}}s this {{alter}} owns.", Folder, section(ProfileSubsystemsSection, { name: "Sub{{system}}s" }), info("subsystems")),
  profile_answers: W("Get to know me answers", "What this {{alter}} answered in Get to know me.", Sparkles, section(ProfileAnswersSection, { name: "Get to know me answers" }), info("answers")),
  profile_tags: W("Tags", "This {{alter}}'s tags.", Tag, section(ProfileTagsSection, { name: "Tags" }), info("tags")),
  profile_fields: W("Info fields", "The filled custom fields, in this profile's own layout.", ListChecks,
    section(ProfileFieldsSection, { needsFields: true, name: "Info fields" }), info("entries")),
  profile_info: W("Info", "Every custom field, editable in place — the Info tab.", IdCard,
    tab(({ alter, systemFields }) => <InfoTab alter={alter} systemFields={systemFields} />), { defaultSpan: { cols: 4, rows: 4 }, ...info("entries") }),
  profile_board: W("Board", "{{System}}-wide messages to this {{alter}} — the Board tab.", MessageSquare,
    tab(({ alter, alters }) => <MessagesTab alterId={alter.id} alters={alters} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_inbox: W("Messages", "Private messages for this {{alter}} — the Messages tab.", Mail,
    tab(({ alter, alters, searchParams }) => (
      <PrivateMessagesTab alterId={alter.id} alters={alters}
        highlightMessageId={searchParams.get("messageId") || null}
        autoOpenCompose={searchParams.get("compose") === "1"} />
    )), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_front_history: W("{{Fronting}} history", "Every {{fronting}} session for this {{alter}} — the History tab.", TrendingUp,
    tab(({ alter }) => <HistoryTab alterId={alter.id} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_notes: W("Notes", "This {{alter}}'s notes — the Notes tab.", FileText,
    tab(({ alter }) => <NotesTab alterId={alter.id} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_wishlist: W("Wishlist", "What this {{alter}} wishes for — the Wishlist tab.", Heart,
    tab(({ alter, alters }) => <WishlistTab alter={alter} alters={alters} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_journal: W("Journal", "This {{alter}}'s own journal entries — the Journal tab.", BookOpen,
    tab(({ alter }) => <ProfileJournalTab alterIds={[alter.id]} defaultAuthorId={alter.id} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_lineage: W("Lineage", "Fusions, splits, dormancy and returns — the Lineage tab.", GitMerge,
    tab(({ alter }) => <LineageTab alterId={alter.id} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_relationships: W("Relationships", "How this {{alter}} connects to the others — the Relationships tab.", Link2,
    tab(({ alter, alters }) => <RelationshipsTab alter={alter} alters={alters} />), { defaultSpan: { cols: 4, rows: 4 } }),
  profile_places: W("Locations", "The inner-world locations this {{alter}} is in — the Locations tab.", MapPin,
    tab(({ alter }) => <LocationsTab alter={alter} />), { defaultSpan: { cols: 4, rows: 3 } }),
  profile_activity_links: W("Activities", "Activities linked to this {{alter}} — the Activities tab.", Zap,
    tab(({ alter }) => <ActivitiesTab alter={alter} />), { defaultSpan: { cols: 4, rows: 3 } }),
  profile_options: W("Options", "Archive, merge and delete — the Options tab.", SlidersHorizontal,
    tab(({ alter }) => <OptionsTab alter={alter} />), { defaultSpan: { cols: 4, rows: 4 } }),
};

const TAB = { defaultSpan: { cols: 4, rows: 4 } };

const GW = widgetOf("group");
const gsection = sectionOf("group");
export const GROUP_PROFILE_WIDGETS = {
  profile_header: GW("Header", "Avatar, name, root and parent — the top of the group's page.", Folder, gsection(GroupHeaderSection, { name: "Header" })),
  profile_bio: GW("Description", "The group's description.", AlignLeft, gsection(GroupBioSection, { name: "Description" })),
  profile_nested_groups: GW("Nested groups", "The groups inside this one.", Folder, gsection(GroupNestedSection, { name: "Nested groups" })),
  profile_members: GW("{{Alters}}", "Who is in this group, with Manage.", Users, gsection(GroupMembersSection, { name: "{{Alters}}" })),
  profile_board: GW("Board", "This group's bulletin board — the Board tab.", MessageSquare, gsection(GroupBoardSection, { name: "Board" }), TAB),
  profile_notes: GW("Notes", "A private notebook for this group — the Notes tab.", FileText, gsection(GroupNotesSection, { name: "Notes" }), TAB),
  profile_journal: GW("Journal", "Journal entries by any of its {{alters}} — the Journal tab.", BookOpen, gsection(GroupJournalSection, { name: "Journal" }), TAB),
};

const CW = widgetOf("contact");
const csection = sectionOf("contact");
export const CONTACT_PROFILE_WIDGETS = {
  profile_header: CW("Header", "Avatar, name, safety, categories and ways to reach them.", User, csection(ContactHeaderSection, { name: "Header" })),
  profile_encounter: CW("I'm with them", "Start or end time together with this person.", UserCheck, csection(ContactEncounterSection, { name: "I'm with them" }), { supportsMultiInstance: true }),
  profile_about: CW("About", "About, what's safe to share and the custom fields — the About tab.", Info, csection(ContactAboutSection, { name: "About" })),
  profile_relationships: CW("Relationships", "How this person relates to each {{alter}} — the Relationships tab.", Link2, csection(ContactRelationshipsSection, { name: "Relationships" }), TAB),
  profile_boundaries: CW("Boundaries & rules", "Boundaries and {{system}} rules — the Boundaries tab.", Shield, csection(ContactBoundariesSection, { name: "Boundaries & rules" })),
  profile_notes: CW("Notes", "Notes about this person — the Notes tab.", FileText, csection(ContactNotesSection, { name: "Notes" }), TAB),
  profile_options: CW("Options", "Pin, archive and delete — the Options tab.", SlidersHorizontal, csection(ContactOptionsSection, { name: "Options" })),
};

const LW = widgetOf("location");
const lsection = sectionOf("location");
export const LOCATION_PROFILE_WIDGETS = {
  profile_header: LW("Header", "Name, map and layer, parent and counts — the top of the location's page.", Landmark, lsection(LocationHeaderSection, { name: "Header" })),
  profile_bio: LW("Description", "The location's description.", AlignLeft, lsection(LocationBioSection, { name: "Description" })),
  profile_sub_locations: LW("Sub-locations", "The locations inside this one on the map.", MapPin, lsection(LocationSubLocationsSection, { name: "Sub-locations" })),
  profile_members: LW("{{Alters}} here", "Who is placed in this location.", Users, lsection(LocationMembersSection, { name: "{{Alters}} here" })),
  profile_on_map: LW("On the map", "Where tapping it leads, and the way to the map.", MapIcon, lsection(LocationOnMapSection, { name: "On the map" })),
};

export const PROFILE_WIDGETS = {
  alter: ALTER_PROFILE_WIDGETS,
  group: GROUP_PROFILE_WIDGETS,
  contact: CONTACT_PROFILE_WIDGETS,
  location: LOCATION_PROFILE_WIDGETS,
};

// The registry a profile board of `ownerType` gets: the widgets made for
// that type, plus every shared widget that says it fits (`subjects`).
export function profileRegistryFor(ownerType, sharedRegistry = {}) {
  const own = PROFILE_WIDGETS[ownerType] || ALTER_PROFILE_WIDGETS;
  if (!PROFILE_OWNER_TYPES.includes(ownerType)) return { ...own };
  const out = {};
  for (const [id, def] of Object.entries(sharedRegistry)) {
    if (def && widgetFitsSubject(def, ownerType)) out[id] = def;
  }
  for (const [id, def] of Object.entries(own)) {
    if (widgetFitsSubject(def, ownerType)) out[id] = def;
  }
  return out;
}
