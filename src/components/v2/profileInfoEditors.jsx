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
  PreferencesSection, TagsSection, AnswersSection, HeaderOptionsSection,
} from "@/components/alters/info/infoSections";

const SECTIONS = {
  basics: ({ alter, info }) => <BasicsSection alter={alter} info={info} />,
  header: ({ alter, info }) => <><BasicsSection alter={alter} info={info} /><HeaderOptionsSection info={info} /></>,
  bio: ({ info }) => <BioSection info={info} withRow={false} />,
  entries: ({ alter, info }) => <EntriesSection alter={alter} info={info} bio={false} />,
  groups: ({ alter }) => <GroupsSection alter={alter} />,
  subsystems: ({ alter, info }) => <SubsystemsSection alter={alter} info={info} />,
  preferences: ({ info }) => <PreferencesSection info={info} />,
  tags: ({ info }) => <TagsSection info={info} />,
  answers: ({ info }) => <AnswersSection info={info} />,
};

function InfoSectionEditor({ settings, section }) {
  const t = useTerms();
  const { alter } = useInfoAlter(settings);
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
