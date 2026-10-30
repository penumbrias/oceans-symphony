// THE "new alter" sheet (v0.320.0 rebuild).
//
// Built from the same pieces as the Alter info list and Profile style, so
// adding an alter and editing one look and work the same way:
//
//   Info          — Basics (name, alias, pronouns and their preferences &
//                   boundaries, colour, avatar, role, first appearance), the
//                   bio, and a pin shortcut; a "Profile style" row drills
//                   into the look.
//   Custom fields — every field every alter has, plus this alter's own.
//   Links         — groups and subsystems to join, tags.
//   Profile style — a drill-in page: ProfileLookTabs (Content · Text ·
//                   Colour · Styles) editing the draft's look.
//
// Nothing about the alter is written until "Add": the sections edit one
// in-memory draft (useAlterDraftForm — the Alter info list's draft without
// the autosave), with undo / redo for the whole sheet. The record is
// created once, through alterEntry.createAlter, with its groups set through
// groupMembership. Two things do land before Add, because they aren't this
// alter's: a custom field made for every alter is a shared CustomField row
// at once, and an uploaded picture goes into the library at once (it is
// filed under the alter after Add). Editing an existing alter happens on
// their profile (AlterInfo).

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, ListChecks, Link2, Palette, ChevronLeft, Loader2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { PS } from "@/lib/profileStyle";
import { createAlter, refreshAlter } from "@/lib/alterEntry";
import { registerAlterUpload } from "@/lib/assetFolders";
import { isLocalImageUrl } from "@/lib/localImageStorage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Group, LinkRow, StackedRow, SwitchRow, TabBar } from "@/components/shared/SettingRows";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import ProfileLookTabs, { PROFILE_LOOK_TAB_KEYS } from "@/components/profile/ProfileLookTabs";
import { useAlterDraftForm } from "@/components/alters/info/useAlterInfoForm";
import { InfoBar, BasicsSection, BioSection, EntriesSection, TagsSection, GroupChip } from "@/components/alters/info/infoSections";
import { smallBtn } from "@/components/alters/info/entryEditors";

// The draft's look subject for ProfileLookTabs: not a stored record.
const DRAFT_LOOK_ID = "__new_alter_draft__";

// The groups the new alter will join, as chips, with the picker.
function DraftGroupsSection({ groupIds, onChange }) {
  const t = useTerms();
  const [open, setOpen] = useState(false);
  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const chosen = groupIds.map((id) => allGroups.find((g) => g.id === id)).filter(Boolean);
  const subsystemTerm = `sub${t.system}`;
  return (
    <>
      <StackedRow label={`Groups and ${subsystemTerm}s`} hint={`${t.Alters} can be added to more later, from their profile`}>
        <div className="flex flex-wrap gap-1.5 items-center">
          {chosen.map((g) => <GroupChip key={g.id} group={g} link={false} />)}
          {chosen.length === 0 && <span className="text-xs text-muted-foreground">Not in any groups</span>}
          <button type="button" className={smallBtn} onClick={() => setOpen(true)}>Choose…</button>
        </div>
      </StackedRow>
      <GroupPickerModal alter={null} open={open} onClose={() => setOpen(false)} selectedIds={groupIds} onConfirm={onChange} />
    </>
  );
}

export default function AlterEditModal({ open, onClose, initialGroupIds = [] }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const info = useAlterDraftForm();
  const { form, set, update } = info;
  const [tab, setTab] = useState("info");
  // "look" is the Profile style drill-in page; its own tab is kept while
  // the sheet is open.
  const [page, setPage] = useState("sheet"); // sheet | look
  const [lookTab, setLookTab] = useState("content");
  const [groupIds, setGroupIds] = useState([]);
  const [saving, setSaving] = useState(false);

  // A fresh draft each time the sheet opens — never on a background refresh.
  useEffect(() => {
    if (!open) return;
    info.reset();
    setTab("info");
    setPage("sheet");
    setLookTab("content");
    setGroupIds([...(initialGroupIds || [])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(initialGroupIds)]);

  const name = (form?.name || "").trim();
  // Settings the look page holds (not the companion keys it writes alongside).
  const lookKeys = Object.values(PROFILE_LOOK_TAB_KEYS).flat();
  const lookCount = lookKeys.filter((k) => (form?.custom_fields || {})[k] !== undefined).length;

  // Profile style edits land on the draft's custom_fields (a value of
  // undefined removes the key), like patchProfileLook does on a record.
  const applyLook = (changes) => update((f) => {
    const cf = { ...(f.custom_fields || {}) };
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) delete cf[k];
      else cf[k] = v;
    }
    return { ...f, custom_fields: cf };
  });

  const handleAdd = async () => {
    if (!name) { toast.error("A name is needed"); return; }
    setSaving(true);
    try {
      const created = await createAlter(form, { groupIds });
      if (groupIds.length) queryClient.invalidateQueries({ queryKey: ["groups"] });
      // Pictures uploaded while drafting are filed under the new alter now
      // that they have an id (best-effort; the pictures are saved either way).
      if (created?.id) {
        const cf = form.custom_fields || {};
        const filed = [[form.avatar_url, "avatar"], [cf[PS.HEADER_IMAGE], "header"], [cf[PS.BG_IMAGE], "background"]];
        for (const [url, role] of filed) {
          if (url && isLocalImageUrl(url)) registerAlterUpload({ url, alterId: created.id, role }).catch(() => {});
        }
      }
      toast.success(`${t.Alter} added`);
      refreshAlter(queryClient);
      onClose();
    } catch (e) {
      toast.error(e?.message || "Couldn't add");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  const tabs = [
    { id: "info", label: "Info", icon: User },
    { id: "entries", label: "Custom fields", icon: ListChecks },
    { id: "links", label: "Links", icon: Link2 },
  ];
  const title = name ? `New ${t.alter}: ${name}` : `New ${t.alter}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md h-[min(90vh,52rem)] flex flex-col gap-0 overflow-hidden p-0" data-new-alter-sheet="" data-tour="new-alter-sheet">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Header + fixed tab strip (the inspector's) */}
        <div className="flex-shrink-0 px-4 pt-3 border-b border-border/50 bg-background">
          {page === "look" ? (
            <div className="flex items-center gap-1 pb-2">
              <button type="button" onClick={() => setPage("sheet")} aria-label="Back"
                className="w-9 h-9 -ml-2 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">Profile style</p>
                <p className="text-xs text-muted-foreground truncate">{title}</p>
              </div>
            </div>
          ) : (
            <>
              <InfoBar info={info} title={title} />
              <div className="-mx-4">
                <TabBar tabs={tabs} value={tab} onChange={setTab} />
              </div>
            </>
          )}
        </div>

        {/* The panel */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4 overscroll-contain">
          {page === "look" ? (
            <ProfileLookTabs
              subject={{ type: "alter", id: DRAFT_LOOK_ID, label: name, customFields: form.custom_fields || {} }}
              tab={lookTab} onTab={setLookTab} onDraft={applyLook} />
          ) : (
            <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} data-new-alter-tab={tab}>
              {tab === "info" && (
                <>
                  <Group title="Basics" first>
                    <BasicsSection alter={null} info={info} />
                    <SwitchRow label={`Pin to the top of the ${t.alters} page`} checked={!!form.is_pinned} onChange={(on) => set("is_pinned", on)} />
                  </Group>
                  <Group title="Bio"><BioSection alter={null} info={info} withRow={false} /></Group>
                  <Group title="Profile page">
                    <LinkRow label="Profile style" hint="Colours, fonts, pictures and the header; can be changed any time" icon={Palette}
                      value={lookCount ? `${lookCount} set` : "Set up"} onClick={() => setPage("look")} tour="new-alter-look" />
                  </Group>
                </>
              )}
              {tab === "entries" && (
                <Group title={`About ${name || `this ${t.alter}`}`} first><EntriesSection alter={null} info={info} bio={false} /></Group>
              )}
              {tab === "links" && (
                <>
                  <Group title="Belongs to" first><DraftGroupsSection groupIds={groupIds} onChange={setGroupIds} /></Group>
                  <Group title="Tags"><TagsSection info={info} /></Group>
                </>
              )}
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-border/50 flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <Button onClick={handleAdd} disabled={saving || !name} className="flex-1 h-10" title={name ? undefined : "A name is needed"}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {`Add ${t.alter}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
