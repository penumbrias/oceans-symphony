import React, { useState, useEffect, useRef, useMemo } from "react";
// The group's profile is a widget board (v0.291.0): the same canvas as the
// home screen, one page per tab, every section a widget (GroupSections.jsx
// + src/v2/profileWidgets.jsx). The record's own fields are still edited on
// the form below (the pencil).
import ProfileBoardCanvas, { useProfilePageState, openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import PageBackground from "@/components/profile/PageBackground";
import { GroupAvatar } from "@/components/groups/GroupSections";
import { GROUP_PROFILE_PAGES, NEW_GROUP_PROFILE_PAGES, profilePageId, usesNewProfile, layoutSuffixFor } from "@/lib/profileBoard";
import NewProfileOffer from "@/components/alters/NewProfileOffer";
import ProfileLayoutSwitch from "@/components/profile/ProfileLayoutSwitch";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Folder, User, Crown, Users, Pencil, Eye, EyeOff, Save,
  Loader2, Upload, X, Trash2, Smile, MessageSquare, FileText,
  Undo2, Redo2, ShieldCheck, BookOpen, IdCard, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readProfileBg, profileSurfaceCss, profileThemeCss, PS } from "@/lib/profileStyle";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import BioEditor from "@/components/alters/BioEditor";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import { deleteGroupCascade } from "@/lib/groupMembership";
import GroupSelect from "@/components/groups/GroupSelect";
import PageLookRow from "@/components/profile/PageLookRow";
import { useRegisterLookSubject, withFreshLook } from "@/lib/lookSubject";
import { useLookDefaults, withLookDefaults } from "@/lib/profileLookDefaults";
import { SubSection } from "@/components/settings/SettingsUI";
import { getPrivacyLevels, sortedLevels } from "@/lib/privacyLevels";
import { pushAlterShares } from "@/lib/friendsShare";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import GroupIcon from "@/components/shared/GroupIcon";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { getMemberAlters, getSubsystemsOwnedBy, wouldCreateOwnershipCycle } from "@/lib/subsystemUtils";
import { groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import GroupConfigToggles from "@/components/groups/GroupConfigToggles";
import { pickGroupConfig } from "@/lib/groupConfig";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { TRASH_HINT } from "@/lib/trashSettings";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

// Same keys the alter profile uses, so contrast helpers + rendering treat
// group and alter text colours identically.

// The icon each page shows in the page strip (by page id).
const PAGE_ICONS = {
  [profilePageId("profile")]: User,
  [profilePageId("board")]: MessageSquare,
  [profilePageId("notes")]: FileText,
  [profilePageId("journal")]: BookOpen,
  [profilePageId("fronting")]: BarChart3,
};

function GroupProfileInner() {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();
  const [editMode, setEditMode] = useState(false);
  // The board's pages are the tabs (profile | board | notes | journal);
  // ?tab= opens one and the board keeps the URL in step.
  // Which profile the group shows is read off the cached groups list, so
  // the pages are right on the first render.
  const cachedGroups = queryClient.getQueryData(["groups"]) || [];
  const cachedGroup = cachedGroups.find((g) => String(g.id) === String(groupId) || (g.sp_id && String(g.sp_id) === String(groupId)));
  const [onNewLayout, setOnNewLayout] = useState(() => usesNewProfile(cachedGroup));
  const page = useProfilePageState(onNewLayout ? NEW_GROUP_PROFILE_PAGES : GROUP_PROFILE_PAGES);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showPageTextPicker, setShowPageTextPicker] = useState(false);
  const [showHeaderTextPicker, setShowHeaderTextPicker] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const avatarInputRef = useRef(null);
  const headerInputRef = useRef(null);
  const bgInputRef = useRef(null);

  const { data: allGroups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  // Resolve by entity id OR sp_id — alter.groups stores `sp_id || id`, so a
  // chip tapped from an alter profile can arrive with either.
  const group = allGroups.find((g) => String(g.id) === String(groupId) || (g.sp_id && String(g.sp_id) === String(groupId))) || null;
  const groupOnNew = usesNewProfile(group);
  useEffect(() => { if (group) setOnNewLayout(groupOnNew); }, [group?.id, groupOnNew]);
  // Display options offers this group's look while the page is open.
  useRegisterLookSubject("group", group, group?.name);
  // What the page draws: the group's own look over the group defaults
  // (profileLookDefaults.js); the form keeps the raw record.
  const lookCf = withLookDefaults(group?.custom_fields, useLookDefaults("group"));

  // Recolour the APP-HEADER wave to this group's wave colour while it's open
  // (resolving a var(--color-…) palette reference against the live .os-pf
  // theme). Cleared on unmount. Mirrors AlterProfile.
  const groupWaveRaw = lookCf["_theme_wave"];
  useEffect(() => {
    if (!groupWaveRaw) { setPageWaveOverride(null); return () => setPageWaveOverride(null); }
    let color = groupWaveRaw;
    const m = typeof groupWaveRaw === "string" && groupWaveRaw.match(/^var\((--[\w-]+)\)/);
    if (m) {
      const el = document.querySelector(".os-pf");
      color = el ? getComputedStyle(el).getPropertyValue(m[1]).trim() : "";
    }
    setPageWaveOverride(color || null);
    return () => setPageWaveOverride(null);
  }, [groupWaveRaw]);

  // Form starts null (group not loaded yet); reset() seeds the baseline once
  // the group loads. reset() (not setForm) means the initial load is not an
  // undo entry and undo can never revert past the loaded data back to null.
  const [form, setForm, formHistory] = useUndoRedo(null);
  useEffect(() => {
    if (!group) return;
    formHistory.reset({
      name: group.name || "",
      color: group.color || "",
      emoji: group.emoji || "",
      description: group.description || "",
      avatar_url: group.avatar_url || "",
      owner_alter_id: group.owner_alter_id || "",
      parent: group.parent || "",
      ...pickGroupConfig(group),
      custom_fields: group.custom_fields || {},
    });
  }, [group?.id]);

  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const setCf = (key, val) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));

  const handleUpload = async (e, kind) => {
    const file = e.target.files?.[0];
    if (file) {
      const setBusy = kind === "avatar" ? setUploadingAvatar : kind === "header" ? setUploadingHeader : setUploadingBg;
      setBusy(true);
      try {
        const maxDim = kind === "avatar" ? 400 : 1200;
        const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, maxDim, 0.82);
        if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
        let stored = dataUrl;
        if (isLocalMode()) {
          const imageId = `group-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await saveLocalImage(imageId, dataUrl);
          stored = createLocalImageUrl(imageId);
        }
        if (kind === "avatar") setForm((f) => ({ ...f, avatar_url: stored }));
        else if (kind === "header") setCf(PS.HEADER_IMAGE, stored);
        else setCf(PS.BG_IMAGE, stored);
        toast.success(isGif ? "GIF saved!" : "Image saved!");
      } catch { toast.error("Failed to process image"); }
      finally { setBusy(false); }
    }
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const fresh = (await base44.entities.Group.get(group.id)) || group;
      await base44.entities.Group.update(group.id, {
        name: form.name.trim(),
        color: form.color,
        emoji: form.emoji,
        description: form.description,
        avatar_url: form.avatar_url,
        owner_alter_id: form.owner_alter_id || "",
        parent: form.parent || "",
        ...pickGroupConfig(form),
        custom_fields: withFreshLook(form.custom_fields, fresh.custom_fields),
      });
      toast.success("Saved!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      setEditMode(false);
    } catch (e) { toast.error(e.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!(await confirm(`Delete the group "${group.name}"? Members are not deleted — they just leave the group. ${TRASH_HINT}`))) return;
    setDeleting(true);
    try {
      // Cascade: also scrubs the group's membership entries off every
      // member, so no "Group not found" chips are left behind.
      await deleteGroupCascade(group);
      toast.success("Group deleted.");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      navigate("/Home");
    } catch (e) { toast.error(e.message || "Failed to delete"); }
    finally { setDeleting(false); }
  };

  if (isLoading || (group && !form)) {
    return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!group) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Group not found</p>
        <Link to="/Home"><Button variant="outline" className="mt-4">Go back</Button></Link>
      </div>
    );
  }

  const members = getMemberAlters(group, alters).filter((m) => !(group.hide_archived_members && m.is_archived));

  const cf = lookCf;
  const ps = readProfileBg(cf);
  const bgColor = ps.bgColor;
  const bgImage = ps.bgImage;
  const bgOpacity = ps.bgOpacity;
  const surfaceCss = profileSurfaceCss("os-pf", cf);
  const themeCss = profileThemeCss("os-pf", cf);
  const pageTextColor = cf[PS.PAGE_TEXT] || "";
  const pageFont = fontStackFor(cf[PS.PAGE_FONT]);

  // ---------- VIEW MODE: the board ----------
  if (!editMode) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
        <PageBackground bgColor={bgColor} bgImage={bgImage} bgOpacity={bgOpacity} />
        {themeCss && <style>{themeCss}</style>}
        {surfaceCss && <style>{surfaceCss}</style>}
        {/* The song belongs to VIEWING the page. */}
        {cf[PS.SONG]?.ref && <ProfileSongPlayer song={cf[PS.SONG]} />}
        <div className="relative z-10 os-pf" style={{ ...(pageTextColor ? { color: pageTextColor } : {}), ...(pageFont ? { fontFamily: pageFont } : {}) }}>
        <div data-pf-chrome className="flex items-center justify-between px-2 py-1.5 mb-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {!page.layoutEditing && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setEditMode(true)} title="Its name, picture, description and settings">
                <IdCard className="w-3.5 h-3.5" /> Info
              </Button>
              <Button
                data-tour="group-profile-layout-btn"
                variant="outline" size="sm" className="h-9 w-9 px-0"
                onClick={openProfileLayoutEditor}
                title="Edit page — move, resize and add widgets, and change what's shown"
                aria-label="Edit page"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Off the Profile page, the group's name stays in view. */}
        {!page.onFirstPage && (
          <div className="flex items-center gap-2.5 mb-4">
            <GroupIcon group={group} boxed className="w-9 h-9" boxClassName="rounded-lg border border-border/40" />
            <span className="font-display text-lg font-semibold truncate" style={{ color: groupNameColor(group.color) }}>{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
          </div>
        )}

        {page.onFirstPage && !page.layoutEditing && <NewProfileOffer ownerType="group" record={group} />}
        {/* One render behind a switch, the pages and the layout would
            disagree — wait for the page list to follow the record. */}
        {onNewLayout === groupOnNew && (
          <ProfileBoardCanvas key={groupOnNew ? "v2" : "classic"} ownerType="group" record={group} pageIcons={PAGE_ICONS} page={page}
            tourId="group-profile-tabs" api={{ alters }} layoutSuffix={layoutSuffixFor(group, "group")} />
        )}
        </div>
      </motion.div>
    );
  }

  // ---------- EDIT MODE ----------
  const ownerCandidates = alters.filter((a) => !a.is_archived);
  // Alters that would close an ownership loop if made the root — greyed
  // out in the picker.
  const rootDisabledIds = new Set(
    ownerCandidates.filter((a) => wouldCreateOwnershipCycle(allGroups, alters, group.id, a.id)).map((a) => a.id)
  );
  // Live background preview while editing (uses the unsaved form values).
  const formPs = readProfileBg(form.custom_fields || {});
  const formBgColor = formPs.bgColor;
  const formBgImage = formPs.bgImage;
  const formBgOpacity = formPs.bgOpacity;
  const formReadability = formPs.readability;
  const formSurfaceCss = profileSurfaceCss("os-pf", form.custom_fields || {});
  const formThemeCss = profileThemeCss("os-pf", form.custom_fields || {});
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
      <PageBackground bgColor={formBgColor} bgImage={formBgImage} bgOpacity={formBgOpacity} />
      {formThemeCss && <style>{formThemeCss}</style>}
      {formSurfaceCss && <style>{formSurfaceCss}</style>}
      {/* This page's song, set in its style editor like any other profile. */}
      {cf[PS.SONG]?.ref && <ProfileSongPlayer song={cf[PS.SONG]} />}
      <div className="relative z-10 os-pf space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setEditMode(false)}>
          <Eye className="w-4 h-4 mr-1.5" /> View
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={formHistory.undo} disabled={!formHistory.canUndo} className="gap-1.5" title="Undo">
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={formHistory.redo} disabled={!formHistory.canRedo} className="gap-1.5" title="Redo">
            <Redo2 className="w-3.5 h-3.5" /> Redo
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </Button>
        </div>
      </div>

      {form.color && <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: form.color }} />}

      {/* Avatar */}
      <div className="flex justify-center items-center gap-3">
        <button type="button" onClick={() => avatarInputRef.current?.click()}
          className="relative rounded-2xl overflow-hidden group" disabled={uploadingAvatar}>
          <GroupAvatar url={form.avatar_url} color={form.color} emoji={form.emoji} />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Upload className="w-5 h-5 text-white" />}
          </div>
        </button>
        <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, "avatar")} />
        <AssetButton onPick={(url) => setForm((f) => ({ ...f, avatar_url: url }))} />
      </div>
      {form.avatar_url && (
        <div className="flex justify-center -mt-2">
          <button type="button" onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))} className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1">
            <X className="w-3 h-3" /> Remove avatar
          </button>
        </div>
      )}

      {/* Name + emoji + color */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Name *</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Group name" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Smile className="w-3 h-3" /></label>
          <Input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} placeholder="🌊" className="w-14 text-center text-lg" maxLength={4} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <button type="button" onClick={() => setShowColorPicker(true)}
            className="w-9 h-9 rounded-lg border-2 border-border hover:ring-2 hover:ring-primary transition-all"
            style={{ backgroundColor: form.color || "#8b5cf6" }} />
        </div>
      </div>

      {/* Root / subsystem */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Crown className="w-3.5 h-3.5 text-amber-500" /> Root — makes this a {subTerm}
        </label>
        <AlterSearchSelect
          alters={ownerCandidates}
          value={form.owner_alter_id || null}
          onChange={(id) => setForm((f) => ({ ...f, owner_alter_id: id || "" }))}
          terms={t}
          placeholder="No root (regular group)"
          noneLabel="No root (regular group)"
          disabledIds={rootDisabledIds}
          disabledLabel="would loop"
        />
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">
          The root becomes the parent of this {subTerm}; its members are their inner {t.alters}. {t.Alters} that would create a loop are greyed out.
        </p>
      </div>

      {/* Parent group (nesting) — nested, parent-respecting single-select.
          Excludes this group + its descendants so you can't nest it inside
          itself or one of its own children. */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Parent group (nest inside)</label>
        <GroupSelect
          groups={allGroups}
          value={form.parent || ""}
          onChange={(id) => setForm((f) => ({ ...f, parent: id }))}
          excludeId={group.id}
          zIndex={60}
        />
      </div>

      {/* Group config — group-level member-visibility filtering across surfaces */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2.5">
        <label className="text-xs font-medium text-foreground flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5" /> Group config</label>
        <GroupConfigToggles
          values={form}
          onChange={(key, val) => setForm((f) => ({ ...f, [key]: val }))}
        />
      </div>

      {/* Bio first, then Profile style under it — same order as the alter
          edit page. */}
      <div className="rounded-2xl" data-pf-surface>
        <BioEditor value={form.description} onChange={(val) => setForm((f) => ({ ...f, description: val }))} />
      </div>

      {/* The page's look is edited in Display options on this group
          (v0.310.0); the form keeps whatever the sheet wrote (withFreshLook). */}
      <PageLookRow />

      <GroupFriendsVisibility group={group} members={members} allGroups={allGroups} alters={alters} />

      <ProfileLayoutSwitch ownerType="group" record={group} />

      <button type="button" onClick={() => setShowMembers(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 text-sm font-medium transition-colors">
        <Users className="w-4 h-4" /> Manage members{members.length ? ` (${members.length})` : ""}
      </button>

      <div className="flex flex-col gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Changes
        </Button>
        <Button variant="outline" onClick={handleDelete} disabled={deleting} className="w-full text-destructive hover:text-destructive border-destructive/30">
          {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete group
        </Button>
      </div>

      {showColorPicker && <ColorPickerModal color={form.color || "#8b5cf6"} label="Group Color" onSave={(hex) => setForm((f) => ({ ...f, color: hex }))} onClose={() => setShowColorPicker(false)} />}
      {showBgColorPicker && <ColorPickerModal color={form.custom_fields[PS.BG_COLOR] || "#1a0a2e"} label="Background Color" onSave={(hex) => setCf(PS.BG_COLOR, hex)} onClose={() => setShowBgColorPicker(false)} />}
      {showPageTextPicker && <ColorPickerModal color={form.custom_fields[PS.PAGE_TEXT] || "#ffffff"} label="Page Text Color" onSave={(hex) => setCf(PS.PAGE_TEXT, hex)} onClose={() => setShowPageTextPicker(false)} />}
      {showHeaderTextPicker && <ColorPickerModal color={form.custom_fields[PS.HEADER_TEXT] || "#ffffff"} label="Header Text Color" onSave={(hex) => setCf(PS.HEADER_TEXT, hex)} onClose={() => setShowHeaderTextPicker(false)} />}
      {showMembers && <GroupMembersModal group={group} allGroups={allGroups} isOpen={showMembers} onClose={() => setShowMembers(false)} />}

      </div>
    </motion.div>
  );
}

// Set friends-sharing privacy levels for this group/subsystem's members in one
// place — the same assignment available in Friends → Member sharing, but scoped
// to this group (optionally including nested subsystems). Hidden when no levels
// exist yet.
function GroupFriendsVisibility({ group, members, allGroups, alters }) {
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = sortedLevels(getPrivacyLevels(pickPrimarySystemSettings(settingsList)));
  const qc = useQueryClient();
  const [includeSubs, setIncludeSubs] = useState(true);
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    const seen = new Map();
    members.forEach((a) => seen.set(a.id, a));
    if (includeSubs) {
      const walk = (list, depth, visited) => {
        if (depth > 12) return;
        for (const a of list) {
          for (const sub of getSubsystemsOwnedBy(allGroups, a.id)) {
            if (visited.has(sub.id)) continue;
            const nv = new Set(visited).add(sub.id);
            const sm = getMemberAlters(sub, alters);
            sm.forEach((m) => seen.set(m.id, m));
            walk(sm, depth + 1, nv);
          }
        }
      };
      walk(members, 0, new Set());
    }
    return [...seen.values()].filter((a) => !a.is_archived);
  }, [members, includeSubs, allGroups, alters]);

  const setLevelOn = async (levelId, on) => {
    setBusy(true);
    try {
      for (const a of targets) {
        const cur = Array.isArray(a.privacy_levels) ? a.privacy_levels : [];
        const has = cur.includes(levelId);
        if (on && !has) await base44.entities.Alter.update(a.id, { privacy_levels: [...cur, levelId] });
        else if (!on && has) await base44.entities.Alter.update(a.id, { privacy_levels: cur.filter((id) => id !== levelId) });
      }
      qc.invalidateQueries({ queryKey: ["alters"] });
      pushAlterShares().catch(() => {});
    } catch (e) { toast.error(e?.message || "Couldn't update"); }
    finally { setBusy(false); }
  };

  if (levels.length === 0) return null;

  return (
    <SubSection title="Friends sharing" icon={ShieldCheck} defaultOpen={false}>
      <p className="text-xs text-muted-foreground">Add or remove this group's members from your privacy levels in one go. Friends see a level only if you grant it to them on the Friends page.</p>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={includeSubs} onChange={(e) => setIncludeSubs(e.target.checked)} className="accent-primary" /> Include members of nested subsystems
      </label>
      <div className="space-y-1.5">
        {levels.map((l) => {
          const on = targets.filter((a) => Array.isArray(a.privacy_levels) && a.privacy_levels.includes(l.id)).length;
          return (
            <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/40 bg-muted/10">
              <span className="text-xs font-medium flex-1 truncate">{l.number}. {l.name}</span>
              <span className="text-[0.625rem] text-muted-foreground">{on}/{targets.length}</span>
              <div className="flex gap-1">
                <button type="button" disabled={busy || targets.length === 0 || on === targets.length} onClick={() => setLevelOn(l.id, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
                <button type="button" disabled={busy || on === 0} onClick={() => setLevelOn(l.id, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
              </div>
            </div>
          );
        })}
      </div>
      {busy && <p className="text-[0.625rem] text-muted-foreground"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Saving…</p>}
    </SubSection>
  );
}

export default function GroupProfile() {
  const { id } = useParams();
  return (
    <ErrorBoundary
      resetKeys={[id]}
      fallback={(error, reset) => (
        <div className="p-4 space-y-3">
          <Link to="/Home"><Button variant="ghost" size="sm" className="-ml-2" aria-label="Back" title="Back"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-destructive">Something went wrong loading this group</p>
            <p className="text-xs text-foreground/90 break-words">{(error && (error.message || String(error))) || "Unknown error"}</p>
            <Button size="sm" variant="outline" onClick={reset}>Try again</Button>
          </div>
        </div>
      )}
    >
      <GroupProfileInner />
    </ErrorBoundary>
  );
}
