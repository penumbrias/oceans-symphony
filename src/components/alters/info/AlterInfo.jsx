// Alter info (v0.294.0) — the one place an alter's information is entered.
//
// The "garden" model (owner, 2026-10-28): an alter's information lives in
// ONE simple list, the record itself; widgets on the profile board choose
// what to show and how. Nothing entered here is lost just because no
// widget shows it. This replaces the pencil form as what the profile's
// pencil button opens. Since v0.298.0 the page look and header options are
// here too; the old form is only reachable from the ⋯ menu ("Classic edit
// form (older)") for anyone who still wants it.
//
// Rows follow the inspector row grammar (SettingRows.jsx). Everything saves
// as you type (useAlterInfoForm) with undo / redo for the whole list; there
// is no Save button to miss. The sections are shared with the profile
// widgets' Content tabs (infoSections.jsx, v0.296.0).

import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { deleteAlter, refreshAlter } from "@/lib/alterEntry";
import { TRASH_HINT } from "@/lib/trashSettings";
import { Group } from "@/components/shared/SettingRows";
import { useAlterInfoForm } from "./useAlterInfoForm";
import ProfileConvertRow from "./ProfileConvertRow";
import {
  InfoBar, BasicsSection, EntriesSection, PicturesSection, GroupsSection, SubsystemsSection,
  PreferencesSection, TagsSection, AnswersSection, answerRowsOf, PageStyleSection, HeaderOptionsSection,
} from "./infoSections";

export default function AlterInfo({ alter, onOpenClassic }) {
  const t = useTerms();
  const info = useAlterInfoForm(alter);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { form, set } = info;
  if (!alter || !form) return null;

  // Archive and delete (the trash keeps a deleted alter with their notes
  // and messages for the recovery window).
  const archive = async () => {
    await info.flush();
    await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
    toast.success(alter.is_archived ? "Unarchived" : "Archived");
    refreshAlter(qc, alter.id);
  };
  const remove = async () => {
    if (!(await confirm(`Delete ${alter.name}? ${TRASH_HINT}`))) return;
    try {
      await info.flush();
      await deleteAlter(alter);
      toast.success(`${t.Alter} deleted`);
      qc.invalidateQueries();
      navigate("/Home");
    } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };
  const menu = [
    { label: alter.is_archived ? "Unarchive" : "Archive", onClick: archive },
    { label: "Delete…", onClick: remove },
    ...(onOpenClassic ? [{ label: "Classic edit form (older)", onClick: onOpenClassic }] : []),
  ];

  return (
    <div className="space-y-1" data-alter-info="">
      <InfoBar info={info} title={`${form.name || t.Alter} · info`} sticky
        menu={menu} />
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
        <PageStyleSection alter={alter} info={info} />
      </Group>
      <Group title="Header"><HeaderOptionsSection info={info} /></Group>
    </div>
  );
}
