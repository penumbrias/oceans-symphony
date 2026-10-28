// Alter info (v0.294.0) — the one place an alter's information is entered.
//
// The "garden" model (owner, 2026-10-28): an alter's information lives in
// ONE simple list, the record itself; widgets on the profile board choose
// what to show and how. Nothing entered here is lost just because no
// widget shows it. This replaces the pencil form as what the profile's
// pencil button opens; that form stays reachable as "Classic edit form"
// (page look and header options still live there for now).
//
// Rows follow the inspector row grammar (SettingRows.jsx). Everything saves
// as you type (useAlterInfoForm) with undo / redo for the whole list; there
// is no Save button to miss. The sections are shared with the profile
// widgets' Content tabs (infoSections.jsx, v0.296.0).

import React from "react";
import { useTerms } from "@/lib/useTerms";
import { Row, Group } from "@/components/shared/SettingRows";
import { useAlterInfoForm } from "./useAlterInfoForm";
import ProfileConvertRow from "./ProfileConvertRow";
import { smallBtn } from "./entryEditors";
import {
  InfoBar, BasicsSection, EntriesSection, PicturesSection, GroupsSection, SubsystemsSection,
  PreferencesSection, TagsSection, AnswersSection, answerRowsOf,
} from "./infoSections";

export default function AlterInfo({ alter, onOpenClassic }) {
  const t = useTerms();
  const info = useAlterInfoForm(alter);
  const { form, set } = info;
  if (!alter || !form) return null;

  return (
    <div className="space-y-1" data-alter-info="">
      <InfoBar info={info} title={`${form.name || t.Alter} · info`} sticky />
      <p className="text-xs text-muted-foreground pt-2">
        Everything about {form.name || `this ${t.alter}`} lives here and saves as you type. Widgets on the profile choose what to show, so anything here is kept even when nothing shows it.
      </p>

      <Group title="Basics"><BasicsSection alter={alter} info={info} /></Group>
      <Group title="Entries"><EntriesSection alter={alter} info={info} /></Group>
      <Group title="Pictures">
        <PicturesSection alter={alter} avatarUrl={form.avatar_url} onUseAsAvatar={(url) => set("avatar_url", url)} />
      </Group>
      <Group title="Belongs to">
        <GroupsSection alter={alter} />
        <SubsystemsSection alter={alter} info={info} />
      </Group>
      <Group title="Preferences & boundaries"><PreferencesSection info={info} /></Group>
      <Group title="Tags"><TagsSection info={info} /></Group>
      {answerRowsOf(form).length > 0 && (
        <Group title="Get to know me"><AnswersSection info={info} /></Group>
      )}
      <Group title="Page look">
        <ProfileConvertRow alter={alter} info={info} />
        <Row label="Page style and header options" hint="Still on the classic edit form for now">
          <button type="button" className={smallBtn} onClick={onOpenClassic}>Classic edit form</button>
        </Row>
      </Group>
    </div>
  );
}
