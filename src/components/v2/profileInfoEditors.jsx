// Content tabs of the alter profile widgets (v0.296.0): each widget edits
// the info it shows. The Bio widget edits the bio, Groups the groups, Tags
// the tags… through the same sections as the Alter info list
// (infoSections.jsx), so a change made here is the same change made there,
// saved to the alter as you go.

import React from "react";
import { useTerms } from "@/lib/useTerms";
import { useInfoAlter } from "@/v2/infoWidgets";
import { useAlterInfoForm } from "@/components/alters/info/useAlterInfoForm";
import {
  InfoBar, BasicsSection, BioSection, EntriesSection, GroupsSection, SubsystemsSection,
  PreferencesSection, TagsSection, AnswersSection,
} from "@/components/alters/info/infoSections";
import PageLookRow from "@/components/profile/PageLookRow";

const SECTIONS = {
  basics: ({ alter, info }) => <BasicsSection alter={alter} info={info} />,
  // What else the header shows is part of the page's look (Display
  // options → this profile → Content, v0.310.0).
  header: ({ alter, info }) => <><BasicsSection alter={alter} info={info} /><PageLookRow hint="What the header shows, its colours and banner" /></>,
  bio: ({ info }) => <BioSection info={info} withRow={false} />,
  entries: ({ alter, info }) => <EntriesSection alter={alter} info={info} bio={false} />,
  groups: ({ alter }) => <GroupsSection alter={alter} />,
  belongs: ({ alter, info }) => <><GroupsSection alter={alter} /><SubsystemsSection alter={alter} info={info} /></>,
  subsystems: ({ alter, info }) => <SubsystemsSection alter={alter} info={info} />,
  preferences: ({ info }) => <PreferencesSection info={info} />,
  tags: ({ info }) => <TagsSection info={info} />,
  answers: ({ info }) => <AnswersSection info={info} />,
};

// One form per alter: when the widget is pointed at someone else, the
// editor starts over for them (keyed on the id), so the previous alter's
// draft can never be compared against — or saved onto — the new one.
function InfoSectionEditor({ settings, section }) {
  const { alter } = useInfoAlter(settings);
  return <AlterSectionEditor key={alter?.id || "none"} alter={alter} section={section} />;
}

function AlterSectionEditor({ alter, section }) {
  const t = useTerms();
  const info = useAlterInfoForm(alter);
  if (!alter || !info.form) return null;
  const Section = SECTIONS[section];
  return (
    <div data-widget-info-editor={section}>
      <p className="text-xs text-muted-foreground pt-1">
        This edits {alter.name || `the ${t.alter}`}'s info — the same as the pencil on their profile. It saves as you go.
      </p>
      <InfoBar info={info} />
      <Section alter={alter} info={info} />
    </div>
  );
}

// One config field per section: `{ key, type: "component", Component }`.
// (A function declaration with no module state, so it is safe to call while
// the widget registries are still loading.)
export function infoEditorField(section) {
  function ProfileInfoEditor(props) { return <InfoSectionEditor {...props} section={section} />; }
  return { key: `_info_${section}`, type: "component", label: "", Component: ProfileInfoEditor };
}
