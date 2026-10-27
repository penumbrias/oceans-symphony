// Profile widgets (v0.290.0) — an alter's profile page as widgets on the
// home-screen canvas (ExperimentalDashboard), one per section or tab.
//
// Each widget reads WHOSE page it is on from the board subject
// (useBoardSubject, boardSubject.js) and fetches that record itself, so a
// widget can be placed anywhere on the profile board. The pieces inside
// are the same components the classic page uses (ProfileSections.jsx and
// the profile tab components) — one copy of each, never forked here.
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
  ListChecks, HeartHandshake, AlignLeft, Sparkles,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { boxStyle, useWidgetChrome } from "@/v2/primitives";
import { useBoardSubject, widgetFitsSubject } from "@/lib/boardSubject";
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

// The record whose page this is. Same query key the page itself uses
// (["alter", id]), so the widget and the page chrome never disagree.
export function useSubjectAlter() {
  const subject = useBoardSubject();
  const id = subject?.type === "alter" ? subject.id : null;
  const { data: alter = null } = useQuery({
    queryKey: ["alter", id],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(id)) || null;
    },
    enabled: !!id,
    staleTime: 0,
  });
  return alter;
}

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

// A widget for one Profile-page section.
const section = (SectionView, { needsFields = false, name = "" } = {}) => function ProfileSectionWidget() {
  const alter = useSubjectAlter();
  const systemFields = useSystemFields();
  const t = useTerms();
  if (!alter) return null;
  return <ProfileBox name={applyTerms(name, t)}><SectionView alter={alter} {...(needsFields ? { systemFields } : {})} /></ProfileBox>;
};

// A widget for a whole tab's component.
const tab = (render) => function ProfileTabWidget() {
  const alter = useSubjectAlter();
  const alters = useAlters();
  const systemFields = useSystemFields();
  const [searchParams] = useSearchParams();
  if (!alter) return null;
  return <ProfileBox>{render({ alter, alters, systemFields, searchParams })}</ProfileBox>;
};

const W = (label, description, icon, Component, spans = {}) => ({
  label, description, icon, category: "profile", subjects: ["alter"],
  render: () => <Component />,
  supportsModes: ["normal"], supportsMultiInstance: false,
  defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 40 },
  ...spans,
});

export const ALTER_PROFILE_WIDGETS = {
  profile_header: W("Header", "Avatar, name, pronouns, birthday and role — the top of the {{alter}}'s page.", User,
    section(ProfileHeaderSection, { needsFields: true, name: "Header" })),
  profile_preferences: W("Preferences & boundaries", "The {{alter}}'s comfort levels, as chips.", HeartHandshake,
    section(ProfilePreferencesSection, { name: "Preferences & boundaries" })),
  profile_bio: W("Bio", "The {{alter}}'s bio.", AlignLeft, section(ProfileBioSection, { name: "Bio" })),
  profile_groups: W("Groups", "The groups this {{alter}} is in.", Users, section(ProfileGroupsSection, { name: "Groups" })),
  profile_subsystems: W("Sub{{system}}s", "The sub{{system}}s this {{alter}} owns.", Folder, section(ProfileSubsystemsSection, { name: "Sub{{system}}s" })),
  profile_answers: W("Get to know me answers", "What this {{alter}} answered in Get to know me.", Sparkles, section(ProfileAnswersSection, { name: "Get to know me answers" })),
  profile_tags: W("Tags", "This {{alter}}'s tags.", Tag, section(ProfileTagsSection, { name: "Tags" })),
  profile_fields: W("Info fields", "The filled custom fields, in this profile's own layout.", ListChecks,
    section(ProfileFieldsSection, { needsFields: true, name: "Info fields" })),
  profile_info: W("Info", "Every custom field, editable in place — the Info tab.", IdCard,
    tab(({ alter, systemFields }) => <InfoTab alter={alter} systemFields={systemFields} />), { defaultSpan: { cols: 4, rows: 4 } }),
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

export const PROFILE_WIDGETS = { ...ALTER_PROFILE_WIDGETS };

// The registry a profile board of `ownerType` gets: the widgets made for
// that type, plus every shared widget that says it fits (`subjects`).
export function profileRegistryFor(ownerType, sharedRegistry = {}) {
  if (!PROFILE_OWNER_TYPES.includes(ownerType)) return { ...PROFILE_WIDGETS };
  const out = {};
  for (const [id, def] of Object.entries(sharedRegistry)) {
    if (def && widgetFitsSubject(def, ownerType)) out[id] = def;
  }
  for (const [id, def] of Object.entries(PROFILE_WIDGETS)) {
    if (widgetFitsSubject(def, ownerType)) out[id] = def;
  }
  return out;
}
