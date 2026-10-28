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
// Rows follow the inspector row grammar (SettingRows.jsx), split into
// pages with the inspector's TabBar (v0.299.0): Info · Entries · Pictures ·
// Links · Look. Everything saves
// as you type (useAlterInfoForm) with undo / redo for the whole list; there
// is no Save button to miss. The sections are shared with the profile
// widgets' Content tabs (infoSections.jsx, v0.296.0).

import React, { useState } from "react";
import { User, ListChecks, Images, Link2, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { deleteAlter, refreshAlter, switchToNewProfile, revertToOldProfile } from "@/lib/alterEntry";
import { usesNewProfile } from "@/lib/profileBoard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import OptionsTab from "@/components/alters/profile/OptionsTab";
import { TRASH_HINT } from "@/lib/trashSettings";
import { Group, TabBar } from "@/components/shared/SettingRows";
import { useAlterInfoForm } from "./useAlterInfoForm";
import ProfileConvertRow from "./ProfileConvertRow";
import {
  InfoBar, BasicsSection, BioSection, EntriesSection, PicturesSection, GroupsSection, SubsystemsSection,
  PreferencesSection, TagsSection, AnswersSection, answerRowsOf, PageStyleSection, HeaderOptionsSection,
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
  // Which profile layout (v0.305.0). Only a flag on the record changes;
  // both layouts are kept, so either way can be undone.
  const onNew = usesNewProfile(alter);
  const switchLayout = async (toNew) => {
    try {
      await info.flush();
      await (toNew ? switchToNewProfile(alter.id) : revertToOldProfile(alter.id));
      refreshAlter(qc, alter.id);
      toast.success(toNew ? "Now showing the new profile" : "Back to the old profile", {
        action: { label: "Undo", onClick: async () => {
          await (toNew ? revertToOldProfile(alter.id) : switchToNewProfile(alter.id));
          refreshAlter(qc, alter.id);
        } },
      });
    } catch (e) { toast.error(e?.message || "Couldn't change the layout"); }
  };
  const menu = [
    onNew
      ? { label: "Revert to the old profile", onClick: () => switchLayout(false) }
      : { label: "Use the new profile", onClick: () => switchLayout(true) },
    { label: "Export, merge, sharing…", onClick: () => setOptionsOpen(true) },
    { label: alter.is_archived ? "Unarchive" : "Archive", onClick: archive },
    { label: "Delete…", onClick: remove },
    ...(onOpenClassic ? [{ label: "Classic edit form (older)", onClick: onOpenClassic }] : []),
  ];

  const tabs = [
    { id: "info", label: "Info", icon: User },
    { id: "entries", label: "Entries", icon: ListChecks },
    { id: "pictures", label: "Pictures", icon: Images },
    { id: "links", label: "Links", icon: Link2 },
    { id: "look", label: "Look", icon: Palette },
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
            <Group title="Preferences & boundaries"><PreferencesSection info={info} /></Group>
            <Group title="Tags"><TagsSection info={info} /></Group>
            {answerRowsOf(form).length > 0 && (
              <Group title="Get to know me"><AnswersSection info={info} /></Group>
            )}
          </>
        )}
        {tab === "look" && (
          <>
            <Group title="Page look" first>
              <ProfileConvertRow alter={alter} info={info} />
              <PageStyleSection alter={alter} info={info} />
            </Group>
            <Group title="Header"><HeaderOptionsSection info={info} /></Group>
          </>
        )}
      </div>
    </div>
  );
}
