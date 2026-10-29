// Settings → Alter setup → Profile layouts (v0.292.0). A profile type can
// have ONE default layout — a ProfileBoard row owned by DEFAULT_OWNER_ID —
// which every profile of that type shows until its own layout is edited.
// It is set from a profile ("Use as the default layout…" in the layout
// editor's Save menu) and cleared here. Clearing trashes the row, so
// Recent changes / the trash can bring it back.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Trash2, Wand2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { listProfileBoardRows, profileBoardQueryKey } from "@/lib/boardStore";
import { DEFAULT_OWNER_ID, pickProfileBoardRows, PROFILE_OWNER_TYPES, isGardenProfile, usesNewProfile, NEW_LAYOUT_SUFFIX, hasNewProfile } from "@/lib/profileBoard";
import { switchRecordToNewProfile, revertRecordToOldProfile } from "@/lib/profileLayoutSwitch";
import { convertAlterProfile } from "@/lib/profileConvertRun";
import { clearDefaultLayout } from "@/lib/profileBoardBulk";

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
};

function TypeRow({ type, label, labelOne, suffix = "" }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: rows = [], isFetched } = useQuery({
    queryKey: profileBoardQueryKey(type, DEFAULT_OWNER_ID + suffix),
    queryFn: () => listProfileBoardRows(type, DEFAULT_OWNER_ID + suffix),
  });
  const { keeper } = pickProfileBoardRows(rows);
  const pages = Array.isArray(keeper?.board?.pages) ? keeper.board.pages.length : 0;
  const clear = async () => {
    const ok = await confirm({
      title: `Clear the default ${labelOne} layout?`,
      body: `Every ${labelOne} whose layout hasn't been edited goes back to the standard layout. Edited layouts stay as they are. The default goes to the trash, where Recent changes can bring it back.`,
      confirmLabel: "Clear default",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await clearDefaultLayout(type, { qc, suffix });
      toast.success(`Default ${labelOne} layout cleared.`);
    } catch (e) {
      toast.error(e?.message || "That didn't save.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-b-0" data-profile-layout-type={`${type}${suffix}`}>
      <LayoutGrid className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium first-letter:uppercase">{label}</div>
        <div className="text-xs text-muted-foreground">
          {!isFetched ? "…" : keeper
            ? `Default set${when(keeper.updated_date || keeper.created_date) ? ` ${when(keeper.updated_date || keeper.created_date)}` : ""} · ${pages} page${pages === 1 ? "" : "s"}`
            : "No default — every unedited profile shows the standard layout."}
        </div>
      </div>
      {keeper && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear} className="flex-shrink-0 gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

// Convert every classic alter profile to the widget layout (v0.297.0).
// Each conversion keeps the original bio and can be undone from that
// alter's info (pencil → Profile page).
function ConvertAllRow() {
  const t = useTerms();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(null);
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const classic = alters.filter((a) => a?.id && !isGardenProfile(a) && !usesNewProfile(a));
  const run = async () => {
    const ok = await confirm({
      title: `Turn every ${t.alter}'s bio into widgets?`,
      body: `${classic.length} ${classic.length === 1 ? `profile uses` : `profiles use`} the classic layout. Each bio's parts become widgets you can move and style, and its pictures join that ${t.alter}'s Pictures. Nothing is deleted: every original bio is kept, and each ${t.alter}'s info (the pencil → Profile page) has an Undo.`,
      confirmLabel: "Convert all",
    });
    if (!ok) return;
    let done = 0;
    let failed = 0;
    setProgress({ done, total: classic.length });
    for (const a of classic) {
      try { await convertAlterProfile(a.id, { qc }); } catch { failed += 1; }
      done += 1;
      setProgress({ done, total: classic.length });
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ["alters"] });
    if (failed) toast.error(`${failed} couldn't be converted; they keep the classic layout.`);
    else toast.success(`Converted ${done} profile${done === 1 ? "" : "s"}.`);
  };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30" data-convert-all="">
      <Wand2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Old profile: bio as widgets</div>
        <div className="text-xs text-muted-foreground">
          {progress ? `Converting ${progress.done} of ${progress.total}…`
            : classic.length ? `${classic.length} on the old profile still use${classic.length === 1 ? "s" : ""} the classic bio.`
            : `No old-profile bios left to convert.`}
        </div>
      </div>
      {classic.length > 0 && (
        <Button type="button" size="sm" variant="outline" disabled={!!progress} onClick={run} className="flex-shrink-0">Convert all</Button>
      )}
    </div>
  );
}

// The new profile for everyone (v0.305.0). Only each record's layout flag
// changes; every profile keeps the layout it has now, and each one can
// revert on its own (pencil → ⋯), or everyone at once here.
// Groups (v0.307.0), contacts (v0.308.0) and locations (v0.309.0) too: `ownerType` picks which
// records.
const ROW_KIND = {
  alter: { key: ["alters"], entity: "Alter" },
  group: { key: ["groups"], entity: "Group", one: "group", many: "groups" },
  contact: { key: ["contacts"], entity: "Contact", one: "contact", many: "contacts" },
  location: { key: ["innerWorldLocations"], entity: "InnerWorldLocation", one: "location", many: "locations" },
};
function NewProfileAllRow({ ownerType = "alter" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(null);
  const kind = ROW_KIND[ownerType] || ROW_KIND.alter;
  const one = kind.one || t.alter;
  const many = kind.many || t.alters;
  const { data: records = [] } = useQuery({
    queryKey: kind.key,
    queryFn: () => base44.entities[kind.entity].list(),
  });
  const live = records.filter((a) => a?.id);
  const older = live.filter((a) => !usesNewProfile(a));
  const onNew = live.filter((a) => usesNewProfile(a));
  const runAll = async (list, fn, label) => {
    let done = 0;
    let failed = 0;
    setProgress({ done, total: list.length, label });
    for (const a of list) {
      try { await fn(a.id); } catch { failed += 1; }
      done += 1;
      setProgress({ done, total: list.length, label });
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: kind.key });
    if (ownerType === "alter") qc.invalidateQueries({ queryKey: ["alter"] });
    return { done, failed };
  };
  const useForAll = async () => {
    const ok = await confirm({
      title: `Use the new profile for every ${one}?`,
      body: `${older.length} ${older.length === 1 ? "profile switches" : "profiles switch"} to the new profile. Nothing is deleted: the layout each one has now is kept, and any profile can go back on its own (Revert to the old profile), or all of them from here.`,
      confirmLabel: "Use for everyone",
    });
    if (!ok) return;
    const { done, failed } = await runAll(older, (id) => switchRecordToNewProfile(ownerType, id), "Switching");
    if (failed) toast.error(`${failed} couldn't switch; they keep the layout they had.`);
    else toast.success(`${done} profile${done === 1 ? "" : "s"} now use the new profile.`);
  };
  const revertAll = async () => {
    const ok = await confirm({
      title: `Put every ${one} back on the old profile?`,
      body: `${onNew.length} ${onNew.length === 1 ? "profile goes" : "profiles go"} back to the layout ${onNew.length === 1 ? "it" : "they"} had before. Their new-profile layouts are kept, so switching again brings them back as they were.`,
      confirmLabel: "Revert everyone",
    });
    if (!ok) return;
    const { done, failed } = await runAll(onNew, (id) => revertRecordToOldProfile(ownerType, id), "Reverting");
    if (failed) toast.error(`${failed} couldn't change; they keep the new profile.`);
    else toast.success(`${done} profile${done === 1 ? "" : "s"} back on the old profile.`);
  };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30" data-new-profile-all={ownerType}>
      <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">The new {one} profile</div>
        <div className="text-xs text-muted-foreground">
          {progress ? `${progress.label} ${progress.done} of ${progress.total}…`
            : older.length ? `${onNew.length} of ${live.length} use it. New ${many} start on it.`
            : `Every ${one} uses it.`}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        {older.length > 0 && (
          <Button type="button" size="sm" variant="outline" disabled={!!progress} onClick={useForAll}>Use for everyone</Button>
        )}
        {onNew.length > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={!!progress} onClick={revertAll}>Revert everyone</Button>
        )}
      </div>
    </div>
  );
}

export default function ProfileLayoutSettings() {
  const t = useTerms();
  const labels = {
    alter: [t.alters, t.alter],
    group: ["groups", "group"],
    contact: ["contacts", "contact"],
    location: ["inner-world locations", "location"],
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        To set a default, open any profile, tap its grid button, then Save → "Use as the default layout…". Profiles whose layout you have edited keep their own.
      </p>
      <div>
        <NewProfileAllRow />
        <NewProfileAllRow ownerType="group" />
        <NewProfileAllRow ownerType="contact" />
        <NewProfileAllRow ownerType="location" />
        <ConvertAllRow />
        <TypeRow type="alter" suffix={NEW_LAYOUT_SUFFIX} label={`${t.alters} (new profile)`} labelOne={`new ${t.alter} profile`} />
        <TypeRow type="group" suffix={NEW_LAYOUT_SUFFIX} label="groups (new profile)" labelOne="new group profile" />
        <TypeRow type="contact" suffix={NEW_LAYOUT_SUFFIX} label="contacts (new profile)" labelOne="new contact profile" />
        <TypeRow type="location" suffix={NEW_LAYOUT_SUFFIX} label="locations (new profile)" labelOne="new location profile" />
        {PROFILE_OWNER_TYPES.map((type) => (
          <TypeRow key={type} type={type} label={hasNewProfile(type) ? `${labels[type][0]} (old profile)` : labels[type][0]} labelOne={labels[type][1]} />
        ))}
      </div>
    </div>
  );
}
