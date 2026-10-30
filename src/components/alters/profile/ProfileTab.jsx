import React, { useState, useEffect, useRef, useCallback } from "react";
import { PS } from "@/lib/profileStyle";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { deleteAlter as deleteAlterEverywhere, extractYear, firstAppearanceOf, saveAlterEdits, refreshAlter, createOwnedSubsystem } from "@/lib/alterEntry";
import { User, Tag, Users, Save, Archive, ArchiveRestore, Trash2, Loader2, Upload, X, Link2, FolderPlus, Folder, Undo2, Redo2, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import GroupIcon from "@/components/shared/GroupIcon";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { uploadAlterImage, largeGifWarning } from "@/lib/alterImageUpload";
import { registerAlterUpload } from "@/lib/assetFolders";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import BioEditor from "@/components/alters/BioEditor";
import { parsePreferences } from "@/lib/alterPreferences";
import AlterPreferencesEditor from "@/components/alters/AlterPreferencesEditor";
import PageLookRow from "@/components/profile/PageLookRow";
import { IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { useTerms } from "@/lib/useTerms";
import { needsHalo, getPageBackground, adjustForContrast, groupNameColor } from "@/lib/contrast";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import AlterImagePoolManager from "@/components/alters/AlterImagePoolManager";
import RotationModeControl from "@/components/shared/RotationModeControl";
import { PictureFramingRow } from "@/components/shared/PictureFramingRow";
import { withImageFraming, pictureStyle } from "@/lib/imageFraming";
import { TRASH_HINT } from "@/lib/trashSettings";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";

// The pencil form for an alter's own record (v0.293.0: edit only — viewing
// a profile is its widget board, see AlterProfile / ProfileBoardCanvas).
// Style keys are PS.* from profileStyle.js.

function AvatarModal({ src, onSave, onClose, ownerAlterId = null }) {
  const [url, setUrl] = useState(src || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const resolvedPreview = useResolvedAvatarUrl(url);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      // GIF-aware: animated GIFs are stored raw so they keep moving;
      // stills are compressed. (processUploadedImage handles the split.)
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 400, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        registerAlterUpload({ url: createLocalImageUrl(imageId), alterId: ownerAlterId, role: "avatar" });
        setUrl(createLocalImageUrl(imageId));
      } else {
        setUrl(dataUrl);
      }
      toast.success(isGif ? "GIF ready!" : "Image ready!");
    } catch { toast.error("Failed to process image"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-sm mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Avatar</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {url && (
          <div className="flex justify-center">
            <img src={resolvedPreview || url} alt="preview" className="w-24 h-24 rounded-2xl object-cover border-2 border-border" onError={e => e.target.style.display = "none"} />
          </div>
        )}
        <div className="flex gap-2">
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste image URL..." className="flex-1 text-sm" />
          <AssetButton onPick={(u) => setUrl(u)} className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onSave(url); onClose(); }}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}


export default function ProfileTab({ alter, onEditModeChange, saveRef }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showHeaderTextPicker, setShowHeaderTextPicker] = useState(false);
  const [showPageTextPicker, setShowPageTextPicker] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showAvatarUrl, setShowAvatarUrl] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef(null);
  const [form, setForm, formHistory] = useUndoRedo({
    name: "", alias: "", pronouns: "", role: "", birthday: "", origin_year: "",
    description: "", color: "", avatar_url: "", avatar_rotation_mode: "off", emoji: "", use_emoji_as_alias: false, subsystems_icon: "",
    is_pinned: false,
    custom_fields: {},
    preferences: [],
    image_framing: {},
  });
  const [avatarPoolOpen, setAvatarPoolOpen] = useState(false);
  // "Advanced — preferences & boundaries" drawer under Pronouns
  // (pronouns.cc-style comfort levels). Mirrors AlterEditModal's drawer.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [creatingSubsystem, setCreatingSubsystem] = useState(false);
  const [managingSubsystem, setManagingSubsystem] = useState(null);
  const bgFileInputRef = useRef(null);
  const headerFileInputRef = useRef(null);
  const navigate = useNavigate();

  // Subsystems this alter owns (groups with owner_alter_id === this alter).
  const { data: allGroups = [], isSuccess: groupsLoaded } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const ownedSubsystems = getSubsystemsOwnedBy(allGroups, alter.id);

  // The alter's group chips, resolved against the LIVE groups list. The
  // stored entries are embedded { id, name, color } copies, which go stale
  // on rename/recolour and outlive a deleted group entirely (the "Group not
  // found" chip). Resolving here keeps names fresh; dangling entries are
  // dropped only once the groups query has actually loaded.
  const resolvedGroups = React.useMemo(() => {
    const entries = alter.groups || [];
    if (!groupsLoaded) return entries;
    return entries
      .map((g) => allGroups.find((x) => x.id === g?.id || (g?.id && x.sp_id === g.id) || (g?.sp_id && x.id === g.sp_id)) || null)
      .filter(Boolean);
  }, [alter.groups, allGroups, groupsLoaded]);

  // Create a new subsystem owned by this alter. The term is "sub" + the
  // user's system term (subsystem / subcollective / …).
  const subsystemTerm = `sub${t.system}`;
  const createSubsystem = async () => {
    setCreatingSubsystem(true);
    try {
      const name = `${alter.name}'s ${subsystemTerm}`;
      await createOwnedSubsystem(alter, name);
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Created ${name}`);
    } catch (e) {
      toast.error(e.message || "Failed to create subsystem");
    } finally {
      setCreatingSubsystem(false);
    }
  };

  // What the form was loaded from: Save writes only what differs from it
  // (alterEntry.saveAlterEdits), so edits made elsewhere meanwhile stay.
  const baselineRef = useRef(null);
  useEffect(() => {
    const { birthday, origin_year } = firstAppearanceOf(alter);
    // reset() (not setForm) so the load is the baseline: it creates no undo
    // history and undo can never wipe the form back to empty.
    const loaded = {
      name: alter.name || "",
      alias: alter.alias || "",
      pronouns: alter.pronouns || "",
      role: alter.role || "",
      birthday,
      origin_year,
      description: alter.description || "",
      color: alter.color || "",
      avatar_url: alter.avatar_url || "",
      avatar_rotation_mode: alter.avatar_rotation_mode || "off",
      emoji: alter.emoji || "",
      use_emoji_as_alias: !!alter.use_emoji_as_alias,
      is_pinned: !!alter.is_pinned,
      subsystems_icon: alter.subsystems_icon || "",
      custom_fields: alter.custom_fields || {},
      preferences: parsePreferences(alter),
      image_framing: alter.image_framing && typeof alter.image_framing === "object" ? alter.image_framing : {},
    };
    baselineRef.current = loaded;
    formHistory.reset(loaded);
    setPrefsOpen(parsePreferences(alter).length > 0);
    // Keyed on the {alter}'s ID, not the object. The alters query is
    // invalidated constantly (fronting, pins, avatars, this page's own
    // saves), and every invalidation handed us a NEW object, re-running
    // this reset and restoring whatever the user had part-way edited.
    // Deleting a description was the visible casualty: it came back on
    // the next refresh and then saved itself again (owner report —
    // "no matter what I do or how I edit it, it doesn't delete").
  }, [alter?.id]);  

  const bgColor = form.custom_fields?.[PS.BG_COLOR] || "";
  const bgImage = form.custom_fields?.[PS.BG_IMAGE] || "";
  const bgOpacity = form.custom_fields?.[PS.BG_OPACITY] !== undefined ? form.custom_fields[PS.BG_OPACITY] : 0.15;
  const headerTextColor = form.custom_fields?.[PS.HEADER_TEXT] || "";
  const hideHeader = form.custom_fields?.[PS.HIDE_HEADER] || false;
  const headerImage = form.custom_fields?.[PS.HEADER_IMAGE] || "";
  const sectionBgOpacity = form.custom_fields?.[PS.READABILITY] !== undefined ? form.custom_fields[PS.READABILITY] : 0;
  const pageTextColor = form.custom_fields?.[PS.PAGE_TEXT] || "";

  const setBgField = (key, val) => setForm(f => ({
    ...f, custom_fields: { ...f.custom_fields, [key]: val },
  }));

  const clearBg = () => setForm(f => {
    const cf = { ...f.custom_fields };
    delete cf[PS.BG_COLOR]; delete cf[PS.BG_IMAGE]; delete cf[PS.BG_OPACITY];
    delete cf[PS.HEADER_TEXT]; delete cf[PS.HEADER_IMAGE]; delete cf[PS.READABILITY]; delete cf[PS.PAGE_TEXT];
    return { ...f, custom_fields: cf };
  });

  const handleSave = useCallback(async () => {
  if (!form.name.trim()) { toast.error("Name is required"); return; }
  setSaving(true);
  try {
    await saveAlterEdits({ alterId: alter.id, baseline: baselineRef.current, form });
    baselineRef.current = form;
    toast.success("Saved!");
    refreshAlter(queryClient, alter.id);
    onEditModeChange(false);
  } catch (e) { toast.error(e.message || "Failed to save"); }
  finally { setSaving(false); }
}, [form, alter.id]);
useEffect(() => {
  if (saveRef) saveRef.current = handleSave;
}, [handleSave]);

  const handleArchive = async () => {
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
      toast.success(alter.is_archived ? "Unarchived!" : "Archived!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!(await confirm(`Delete ${alter?.name}? ${TRASH_HINT}`))) return;
    setDeleting(true);
    try {
      await deleteAlterEverywhere(alter);
      toast.success(`${t.Alter} deleted.`);
      queryClient.invalidateQueries();
    } catch (e) { toast.error(e.message || "Failed to delete"); }
    finally { setDeleting(false); }
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingBg(true);
    try {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > 1 && file.type !== "image/gif") toast.info(`Compressing background image (${sizeMB.toFixed(1)}MB)…`);
      // GIF-aware: GIF backgrounds stay raw (animated); stills compressed.
      const { url, isGif, sizeKB } = await uploadAlterImage(file, { alterId: alter?.id, role: "background", prefix: "bg", maxDim: 1200, quality: 0.8 });
      const warn = largeGifWarning({ isGif, sizeKB });
      if (warn) toast.warning(warn);
      setBgField(PS.BG_IMAGE, url);
      toast.success(isGif ? "Background GIF saved!" : "Background image saved!");
    } catch (err) {
      toast.error("Failed to process background image");
    } finally { setUploadingBg(false); e.target.value = ""; }
  };

  const handleHeaderUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingHeader(true);
    try {
      // GIF-aware: GIF banners stay raw (animated); stills compressed.
      const { url, isGif, sizeKB } = await uploadAlterImage(file, { alterId: alter?.id, role: "header", maxDim: 1200, quality: 0.85 });
      const warn = largeGifWarning({ isGif, sizeKB });
      if (warn) toast.warning(warn);
      setBgField(PS.HEADER_IMAGE, url);
      toast.success(isGif ? "Header GIF saved!" : "Header image saved!");
    } catch { toast.error("Failed to process header image"); }
    finally { setUploadingHeader(false); e.target.value = ""; }
  };


  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Resolved avatar (local-image:// → blob) for the inline avatar preview.
  const avatarPreview = useResolvedAvatarUrl(form.avatar_url);
  // Resolved subsystems-chip icon — user-picked asset can be a local-image://
  // URI, so it must go through the hook before hitting an <img src>.
  const subsystemsIconPreview = useResolvedAvatarUrl(form.subsystems_icon);

  // First-appearance is one field feeding both the free-form birthday text
  // (display) and the integer origin_year (lineage/timeline) — same as the
  // Add New / Edit alter modal.
  const setFirstAppearance = (val) => setForm((f) => ({ ...f, birthday: val, origin_year: extractYear(val) }));

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try {
      const { url, isGif, sizeKB } = await uploadAlterImage(file, { alterId: alter?.id, role: "avatar" });
      const warn = largeGifWarning({ isGif, sizeKB });
      if (warn) toast.warning(warn);
      set("avatar_url", url);
      toast.success("Avatar saved!");
    } catch { toast.error("Failed to process avatar"); }
    finally { setUploadingAvatar(false); e.target.value = ""; }
  };

  // Remove a single tag from this alter. Tags are populated by Get
  // to know me's preset writeback (the user's literal answer
  // label, plus any legacy inferred bag from before the writeback
  // was changed to only store direct answers). Surface a per-tag
  // delete so users can prune the inferred soup that landed on
  // their profiles without their explicit intent.
  const removeTag = async (tagToRemove) => {
    const existing = Array.isArray(alter.tags) ? alter.tags : [];
    const next = existing.filter((t) => t !== tagToRemove);
    if (next.length === existing.length) return;
    try {
      await base44.entities.Alter.update(alter.id, { tags: next });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't remove tag");
    }
  };

  const clearAllTags = async () => {
    const existing = Array.isArray(alter.tags) ? alter.tags : [];
    if (existing.length === 0) return;
    if (!(await confirm(`Remove all ${existing.length} tag${existing.length === 1 ? "" : "s"} from ${alter.name || "this alter"}? This can't be undone.`))) return;
    try {
      await base44.entities.Alter.update(alter.id, { tags: [] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success("Tags cleared");
    } catch (err) {
      toast.error(err?.message || "Couldn't clear tags");
    }
  };

  // Preset answers (energy / body-or-head / role-lean / dominant
  // feeling) from Get to know me — render directly on the profile
  // so the user sees their literal answers without flipping to the
  // Info tab. Same shape as InfoTab's "From Get to know me"
  // section.
  const presetAnswersRaw = (alter?.preset_answers && typeof alter.preset_answers === "object" && !Array.isArray(alter.preset_answers))
    ? alter.preset_answers
    : null;
  const presetAnswerRows = (() => {
    if (!presetAnswersRaw) return [];
    return Object.entries(presetAnswersRaw)
      .map(([key, raw]) => ({
        key,
        label: PRESET_ANSWER_LABELS[key] || key.replace(/_/g, " "),
        values: typeof raw === "string"
          ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
          : [],
      }))
      .filter((row) => row.values.length > 0);
  })();

  const removePresetValue = async (questionKey, valueToRemove) => {
    if (!presetAnswersRaw) return;
    const prev = typeof presetAnswersRaw[questionKey] === "string" ? presetAnswersRaw[questionKey] : "";
    const next = prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).filter((v) => v !== valueToRemove);
    const updated = { ...presetAnswersRaw };
    if (next.length === 0) delete updated[questionKey];
    else updated[questionKey] = next.join(", ");
    try {
      await base44.entities.Alter.update(alter.id, { preset_answers: updated });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't remove answer");
    }
  };
  const hasColor = form.color && form.color.length > 3;
  const bgColorAlter = hasColor ? form.color : null;
  const textOnColor = hasColor ? getContrastColor(form.color) : null;

  // ── EDIT MODE ──
  return (
    <div className="space-y-4">
      {form.color && <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: form.color }} />}

      {/* The header toggle lives buried in Profile style, and edit mode used
          to render the header regardless — so someone who caught that switch
          by accident saw the avatar, name, pronouns and role vanish from the
          saved profile with nothing anywhere to explain it or undo it. It
          reads as deleted data (owner report). Say so, and offer it back. */}
      {hideHeader && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
          <EyeOff className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground flex-1 min-w-0">
            The header is hidden, so the avatar, name, pronouns and role don't show on this profile. Nothing was deleted.
          </p>
          <button
            type="button"
            onClick={() => setForm((f) => {
              const cf = { ...f.custom_fields };
              delete cf[PS.HIDE_HEADER];
              return { ...f, custom_fields: cf };
            })}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-border/60 hover:bg-muted flex-shrink-0"
          >
            Show it
          </button>
        </div>
      )}

      {/* Name + Alias on the left, Avatar on the right — matches the
          Add New / Edit {alter} modal arrangement. */}
      <div className="flex gap-3 rounded-2xl" data-pf-surface>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Name *</label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Display name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Alias</label>
            <div className="flex gap-2">
              <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="For mentions" className="flex-1 min-w-0" />
              <Input value={form.emoji} onChange={(e) => set("emoji", e.target.value)} placeholder="😀" maxLength={8} aria-label="Emoji" className="w-14 flex-shrink-0 text-center text-lg" />
            </div>
            <button
              type="button"
              onClick={() => form.emoji && set("use_emoji_as_alias", !form.use_emoji_as_alias)}
              disabled={!form.emoji}
              className={`flex items-center gap-1.5 text-[0.6875rem] ${form.emoji ? "text-muted-foreground cursor-pointer" : "text-muted-foreground/40 cursor-not-allowed"}`}
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[0.625rem] leading-none ${form.use_emoji_as_alias ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{form.use_emoji_as_alias ? "✓" : ""}</span>
              Use emoji as an alias for mentions{form.emoji ? <> — type <span className="font-medium">@{form.emoji}</span></> : ""}
            </button>
            <p className="text-[0.6875rem] text-muted-foreground leading-snug">
              The alias (or emoji) is a shorthand for @ mentions and - signposts.
            </p>
          </div>
          {/* Pin checkbox removed (v0.88.1, tester) — redundant with the
              pin icon in the profile header, which saves immediately. */}
        </div>
        <div className="flex-shrink-0 w-[76px] flex flex-col items-center gap-1.5">
          <label className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">Avatar</label>
          <div className="w-[68px] h-[68px] rounded-full border-2 border-border/60 overflow-hidden flex items-center justify-center bg-muted/40">
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" style={pictureStyle(form, form.avatar_url)} />
              : <User className="w-7 h-7 text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap justify-center gap-0.5 w-[68px]">
            <IconButton icon={Upload} title="Upload image" onClick={() => avatarFileRef.current?.click()} busy={uploadingAvatar} />
            <AssetButton onPick={(url) => set("avatar_url", url)} className={iconBtnClass()} allowFolders ownerAlterId={alter?.id || null} ownerAlterName={alter?.name || ""} />
            <IconButton icon={Link2} title="Image URL" onClick={() => setShowAvatarUrl((s) => !s)} />
            <IconButton icon={X} title="Remove avatar" onClick={() => set("avatar_url", "")} danger disabled={!form.avatar_url} />
          </div>
          <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>
      </div>
      {showAvatarUrl && (
        <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://… or paste an image URL" />
      )}
      <PictureFramingRow url={form.avatar_url} value={form.image_framing?.[form.avatar_url]} shape="circle" label="Framing"
        hint="Saved with the picture, so it shows this way everywhere"
        onChange={(f) => set("image_framing", withImageFraming(form.image_framing, form.avatar_url, f))} />

      <RotationModeControl
        mode={form.avatar_rotation_mode}
        onChange={(m) => set("avatar_rotation_mode", m)}
        disabled={false}
        showManage
        onManagePool={() => setAvatarPoolOpen(true)}
        hint="When not Off, the avatar shown cycles through a pool of images for this alter — randomly, or in order — each time the app reloads."
      />

      {/* Pronouns + Color */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl" data-pf-surface>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Pronouns</label>
          <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
          <button
            type="button"
            onClick={() => setPrefsOpen((v) => !v)}
            className="text-[0.6875rem] text-muted-foreground hover:text-primary transition-colors"
          >
            {prefsOpen ? "▾" : "▸"} Advanced — preferences &amp; boundaries
            {(form.preferences || []).length > 0 ? ` (${form.preferences.length})` : ""}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowColorPicker(true)}
              className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
              style={{ backgroundColor: form.color || "#8b5cf6" }} />
            <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{form.color || "#8b5cf6"}</span>
          </div>
        </div>
      </div>

      {/* Advanced preferences & boundaries — pronouns.cc-style comfort
          levels; same drawer AlterEditModal has. */}
      {prefsOpen && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2" data-pf-surface>
          <p className="text-xs text-muted-foreground">
            Rate how each pronoun set, name, or term feels — from hate to love. Shows on the profile, and can optionally be shared with friends.
          </p>
          <AlterPreferencesEditor value={form.preferences || []} onChange={(next) => set("preferences", next)} />
        </div>
      )}

      {/* Role + First appearance — paired on one row (v0.88.1 layout tidy;
          they're both short single-line inputs). First appearance feeds
          both the free-form display and the integer origin_year. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl" data-pf-surface>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Role</label>
          <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host…" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">First appearance</label>
          <Input
            value={form.birthday || ""}
            onChange={(e) => setFirstAppearance(e.target.value)}
            placeholder={`e.g. ${new Date().getFullYear() - 5}, March ${new Date().getFullYear() - 5}, or a full date`}
          />
          <p className="text-[0.6875rem] text-muted-foreground leading-snug">Feeds the {t.Alter} History timeline — a year is enough.</p>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-2 rounded-2xl" data-pf-surface>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-primary flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups</label>
          <button type="button" onClick={() => setShowGroupPicker(true)} className="text-xs text-primary hover:text-primary/80 font-medium">Edit groups →</button>
        </div>

        {/* Subsystems this alter owns + a create button. A subsystem is a
            group this alter parents — see subsystemUtils. */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" /> {alter.name}'s {subsystemTerm}{ownedSubsystems.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={createSubsystem}
              disabled={creatingSubsystem}
              className="text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 disabled:opacity-50"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Create {subsystemTerm}
            </button>
          </div>
          {ownedSubsystems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {ownedSubsystems.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/group/${g.id}`)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium border inline-flex items-center gap-1"
                  style={{ borderColor: g.color ? `${g.color}40` : "hsl(var(--border))", color: groupNameColor(g.color) || "hsl(var(--foreground))" }}
                  title="Open profile"
                >
                  <GroupIcon group={g} className="w-3 h-3" /> {g.name}
                </button>
              ))}
            </div>
          ) : null}
          {/* When this alter owns several subsystems, the alters-list chip
              shows a stacked-folder icon — let the user pick a custom image
              for it (from their assets). */}
          {ownedSubsystems.length > 1 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="w-7 h-7 rounded-full overflow-hidden border border-border/40 flex items-center justify-center flex-shrink-0 bg-muted/30">
                {subsystemsIconPreview
                  ? <img src={subsystemsIconPreview} alt="" className="w-full h-full object-cover" />
                  : <Folder className="w-3.5 h-3.5 text-muted-foreground" />}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground flex-1 leading-snug">Icon for the “{ownedSubsystems.length} {subsystemTerm}s” chip</span>
              <AssetButton onPick={(url) => set("subsystems_icon", url)} className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0" />
              {form.subsystems_icon && (
                <button type="button" onClick={() => set("subsystems_icon", "")} className="text-muted-foreground hover:text-destructive flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          )}
        </div>
        {resolvedGroups.length > 0 ? (() => {
          const pageBg = getPageBackground();
          return (
          <div className="flex flex-wrap gap-1.5">
            {resolvedGroups.map((g) => {
              const halo = g.color && needsHalo(g.color, pageBg);
              const fillColor = halo ? adjustForContrast(g.color, pageBg) : g.color;
              return (
              <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)}
                title={`Open ${g.name}`}
                className="px-2 py-0.5 rounded-full text-xs font-medium border hover:brightness-110 transition"
                style={{
                  backgroundColor: fillColor ? `${fillColor}${halo ? "55" : "18"}` : "hsl(var(--muted))",
                  borderColor: fillColor ? `${fillColor}${halo ? "" : "40"}` : "hsl(var(--border))",
                  color: halo ? "hsl(var(--foreground))" : (g.color || "hsl(var(--foreground))"),
                }}>
                {g.name}
              </button>
              );
            })}
          </div>
          );
        })() : <p className="text-xs text-muted-foreground">Not in any groups</p>}
      </div>

      <div className="rounded-2xl" data-pf-surface>
        <BioEditor value={form.description} onChange={(val) => set("description", val)} />
      </div>

      {/* The page's look — colours, pictures, fonts, song, header — is
          edited in Display options on this profile (v0.310.0). */}
      <PageLookRow />

      {presetAnswerRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-2">
            <Tag className="w-3.5 h-3.5" /> From Get to know me
          </p>
          <div className="space-y-2">
            {presetAnswerRows.map((row) => (
              <div key={row.key} className="rounded-xl border border-border/40 bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1.5">{row.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {row.values.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-foreground border border-border/40">
                      {v}
                      <button
                        type="button"
                        onClick={() => removePresetValue(row.key, v)}
                        aria-label={`Remove ${v}`}
                        className="-mr-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alter.tags && alter.tags.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-primary flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Tags
              <span className="ml-1 text-[10px] font-normal italic text-muted-foreground/70">
                legacy — Get to know me no longer writes here
              </span>
            </p>
            <button
              type="button"
              onClick={clearAllTags}
              className="text-[10px] font-medium text-muted-foreground/70 hover:text-red-500 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alter.tags.map((tag) => (
              <span key={tag} className="group inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="-mr-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        {/* Undo / Redo sit right beside Save. */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={formHistory.undo} disabled={!formHistory.canUndo} className="flex-shrink-0 px-3" title="Undo" aria-label="Undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={formHistory.redo} disabled={!formHistory.canRedo} className="flex-shrink-0 px-3" title="Redo" aria-label="Redo">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleArchive} disabled={saving} className="flex-1">
            {alter?.is_archived ? <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</> : <><Archive className="w-4 h-4 mr-2" /> Archive</>}
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={deleting} className="flex-1 text-destructive hover:text-destructive border-destructive/30">
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>

      <GroupPickerModal alter={alter} open={showGroupPicker} onClose={() => setShowGroupPicker(false)} />
      {managingSubsystem && (
        <GroupMembersModal
          group={managingSubsystem}
          allGroups={allGroups}
          isOpen={!!managingSubsystem}
          onClose={() => setManagingSubsystem(null)}
        />
      )}
      {showAvatarModal && <AvatarModal ownerAlterId={alter?.id} src={form.avatar_url} onSave={(url) => set("avatar_url", url)} onClose={() => setShowAvatarModal(false)} />}
      {showColorPicker && <ColorPickerModal color={form.color || "#8b5cf6"} label="Alter Color" onSave={(hex) => set("color", hex)} onClose={() => setShowColorPicker(false)} />}
      {showBgColorPicker && <ColorPickerModal color={bgColor || "#1a0a2e"} label="Background Color" onSave={(hex) => setBgField(PS.BG_COLOR, hex)} onClose={() => setShowBgColorPicker(false)} />}
      {showHeaderTextPicker && <ColorPickerModal color={headerTextColor || "#ffffff"} label="Header Text Color" onSave={(hex) => setBgField(PS.HEADER_TEXT, hex)} onClose={() => setShowHeaderTextPicker(false)} />}
      {showPageTextPicker && <ColorPickerModal color={pageTextColor || "#ffffff"} label="Page Text Color" onSave={(hex) => setBgField(PS.PAGE_TEXT, hex)} onClose={() => setShowPageTextPicker(false)} />}
      <AlterImagePoolManager open={avatarPoolOpen} onClose={() => setAvatarPoolOpen(false)} alterId={alter.id} role="avatar" />
    </div>
  );
}