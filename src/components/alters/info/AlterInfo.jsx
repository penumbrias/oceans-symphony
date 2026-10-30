// Alter info (v0.294.0) — the one place an alter's information is entered.
//
// The "garden" model (owner, 2026-10-28): an alter's information lives in
// ONE simple list, the record itself; widgets on the profile board choose
// what to show and how. Nothing entered here is lost just because no
// widget shows it. This replaces the pencil form as what the profile's
// pencil button opens. The old form is only reachable from the ⋯ menu
// ("Classic edit form (older)") for anyone who still wants it. The page's
// LOOK is not information about the alter, so since v0.310.0 it lives in
// Profile style (ProfileLookSheet, ProfileLookTabs); the
// "Profile style" row on the Info tab opens it.
//
// Rows follow the inspector row grammar (SettingRows.jsx), split into
// pages with the inspector's TabBar (v0.299.0): Info · Entries · Pictures ·
// Links. Everything saves
// as you type (useAlterInfoForm) with undo / redo for the whole list; there
// is no Save button to miss. The sections are shared with the profile
// widgets' Content tabs (infoSections.jsx, v0.296.0).

import React, { useState } from "react";
import { User, ListChecks, Images, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { deleteAlter, refreshAlter } from "@/lib/alterEntry";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import OptionsTab from "@/components/alters/profile/OptionsTab";
import { TRASH_HINT } from "@/lib/trashSettings";
import { Group, TabBar } from "@/components/shared/SettingRows";
import { useAlterInfoForm } from "./useAlterInfoForm";
import ProfileConvertRow from "./ProfileConvertRow";
import ProfileLayoutSwitch from "@/components/profile/ProfileLayoutSwitch";
import PageLookRow from "@/components/profile/PageLookRow";
import {
  InfoBar, BasicsSection, BioSection, EntriesSection, PicturesSection, GroupsSection, SubsystemsSection,
  TagsSection, AnswersSection, answerRowsOf,
} from "./infoSections";

export default function AlterInfo({ alter, onOpenClassic }) {
  const t = useTerms();
  const info = useAlterInfoForm(alter);
  // Pages, like the widget inspector: one tab on screen at a time.
  const [tab, setTab] = useState("info");
  const [optionsOpen, setOptionsOpen] = useState(false);
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
    { label: "Export, merge, sharing…", onClick: () => setOptionsOpen(true) },
    { label: alter.is_archived ? "Unarchive" : "Archive", onClick: archive },
    { label: "Delete…", onClick: remove },
    ...(onOpenClassic ? [{ label: "Classic edit form (older)", onClick: onOpenClassic }] : []),
  ];

  const tabs = [
    { id: "info", label: "Info", icon: User },
    { id: "entries", label: "Custom fields", icon: ListChecks },
    { id: "pictures", label: "Pictures", icon: Images },
    { id: "links", label: "Links", icon: Link2 },
  ];

  return (
    <div data-alter-info="">
      {/* The rest of the old Options tab: export, analytics, merge,
          friends sharing, levels. */}
      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-alter-options-sheet="">
          <DialogTitle>{form.name || t.Alter} · more options</DialogTitle>
          <OptionsTab alter={alter} />
        </DialogContent>
      </Dialog>
      {/* The bar and the tabs stay put while a tab scrolls (inspector). */}
      <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
        <InfoBar info={info} title={`${form.name || t.Alter} · info`} menu={menu} />
        <TabBar tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} data-alter-info-tab={tab}>
        {tab === "info" && (
          <>
            <Group title="Basics" first><BasicsSection alter={alter} info={info} /></Group>
            <Group title="Bio"><BioSection alter={alter} info={info} withRow={false} /></Group>
            <Group title="Profile page">
              <ProfileLayoutSwitch ownerType="alter" record={alter} noun={t.alter} plural={t.alters} onBefore={info.flush} />
              <ProfileConvertRow alter={alter} info={info} />
              <PageLookRow />
            </Group>
          </>
        )}
        {tab === "entries" && (
          <Group title={`About ${form.name || `this ${t.alter}`}`} first><EntriesSection alter={alter} info={info} bio={false} /></Group>
        )}
        {tab === "pictures" && (
          <Group title="Pictures" first>
            <PicturesSection alter={alter} avatarUrl={form.avatar_url} onUseAsAvatar={(url) => set("avatar_url", url)} />
          </Group>
        )}
        {tab === "links" && (
          <>
            <Group title="Belongs to" first>
              <GroupsSection alter={alter} />
              <SubsystemsSection alter={alter} info={info} />
            </Group>
            <Group title="Tags"><TagsSection info={info} /></Group>
            {answerRowsOf(form).length > 0 && (
              <Group title="Get to know me"><AnswersSection info={info} /></Group>
            )}
          </>
        )}
      </div>
    </div>
  );
}
