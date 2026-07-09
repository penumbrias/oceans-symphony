import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { User, Tag, Users, Save, Archive, ArchiveRestore, Trash2, Loader2, Upload, X, Image, Link2, FolderPlus, Folder, Undo2, Redo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import GroupIcon from "@/components/shared/GroupIcon";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import BioEditor from "@/components/alters/BioEditor";
import ProfileStyleEditor from "@/components/shared/ProfileStyleEditor";
import { colorWithAlpha, readProfileBg, headerThemeStyleVars } from "@/lib/profileStyle";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { useTerms } from "@/lib/useTerms";
import { needsHalo, getPageBackground, adjustForContrast, groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";
import MarkdownText from "@/components/shared/MarkdownText";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import AlterImagePoolManager from "@/components/alters/AlterImagePoolManager";
import RotationModeControl from "@/components/shared/RotationModeControl";

// Pull a 4-digit year out of a free-form birthday string so we can keep
// the integer origin_year (used by Alter History / lineage) linked
// to whatever the user typed in Birthday.
function extractYear(str) {
  if (!str) return "";
  const m = String(str).match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : "";
}

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_TEXT_KEY = "_header_text_color";
const HEADER_BG_KEY = "_header_bg_color";
const HIDE_HEADER_KEY = "_hide_header";
const HEADER_IMAGE_KEY = "_header_image";
const HEADER_FONT_KEY = "_header_font";
const HEADER_OPACITY_KEY = "_header_opacity";
// Optional header extras — surface groups / subsystems / custom fields in the
// profile header. Group/subsystem chips render as icon / name / both and link
// to their pages.
const HEADER_SHOW_GROUPS_KEY = "_header_show_groups";
const HEADER_SHOW_SUBSYSTEMS_KEY = "_header_show_subsystems";
const HEADER_SHOW_FIELDS_KEY = "_header_show_fields";
const HEADER_CHIP_MODE_KEY = "_header_chip_mode"; // "icon" | "name" | "both"
const HEADER_SHOW_ALTER_FIELDS_KEY = "_header_show_alter_fields"; // ad-hoc per-alter fields
const HEADER_SHOW_PRONOUNS_KEY = "_header_show_pronouns"; // force-show pronouns even if name contains them
const SECTION_BG_KEY = "_section_bg_opacity";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";

function AvatarModal({ src, onSave, onClose }) {
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

function relativeLuminance(hex) {
  if (!hex) return 1;
  const clean = hex.replace("#", "");
  if (clean.length < 6) return 1;
  const toLin = (n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(clean.substring(0, 2), 16));
  const g = toLin(parseInt(clean.substring(2, 4), 16));
  const b = toLin(parseInt(clean.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export default function ProfileTab({ alter, editMode, onEditModeChange, systemFields = [], saveRef }) {
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
  });
  const [avatarPoolOpen, setAvatarPoolOpen] = useState(false);
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
  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const ownedSubsystems = getSubsystemsOwnedBy(allGroups, alter.id);

  // Create a new subsystem owned by this alter. The term is "sub" + the
  // user's system term (subsystem / subcollective / …).
  const subsystemTerm = `sub${t.system}`;
  const createSubsystem = async () => {
    setCreatingSubsystem(true);
    try {
      const name = `${alter.name}'s ${subsystemTerm}`;
      await base44.entities.Group.create({
        name,
        color: alter.color || "#8b5cf6",
        parent: "",
        member_sp_ids: [],
        owner_alter_id: alter.id,
      });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Created ${name}`);
    } catch (e) {
      toast.error(e.message || "Failed to create subsystem");
    } finally {
      setCreatingSubsystem(false);
    }
  };

  useEffect(() => {
    let birthday = alter.birthday || "";
    let origin_year = alter.origin_year ? String(alter.origin_year) : "";
    // Mirror a blank field from the filled one — birthday and
    // origin_year are conceptually the same "first appeared" idea.
    if (!birthday && origin_year) birthday = origin_year;
    if (!origin_year && birthday) origin_year = extractYear(birthday);
    // reset() (not setForm) so the load is the baseline: it creates no undo
    // history and undo can never wipe the form back to empty.
    formHistory.reset({
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
    });
  }, [alter]);

  const bgColor = form.custom_fields?.[BG_COLOR_KEY] || "";
  const bgImage = form.custom_fields?.[BG_IMAGE_KEY] || "";
  const bgOpacity = form.custom_fields?.[BG_OPACITY_KEY] !== undefined ? form.custom_fields[BG_OPACITY_KEY] : 0.15;
  const headerTextColor = form.custom_fields?.[HEADER_TEXT_KEY] || "";
  const hideHeader = form.custom_fields?.[HIDE_HEADER_KEY] || false;
  const headerImage = form.custom_fields?.[HEADER_IMAGE_KEY] || "";
  const sectionBgOpacity = form.custom_fields?.[SECTION_BG_KEY] !== undefined ? form.custom_fields[SECTION_BG_KEY] : 0;
  const pageTextColor = form.custom_fields?.[PAGE_TEXT_KEY] || "";

  const setBgField = (key, val) => setForm(f => ({
    ...f, custom_fields: { ...f.custom_fields, [key]: val },
  }));

  const clearBg = () => setForm(f => {
    const cf = { ...f.custom_fields };
    delete cf[BG_COLOR_KEY]; delete cf[BG_IMAGE_KEY]; delete cf[BG_OPACITY_KEY];
    delete cf[HEADER_TEXT_KEY]; delete cf[HEADER_IMAGE_KEY]; delete cf[SECTION_BG_KEY]; delete cf[PAGE_TEXT_KEY];
    return { ...f, custom_fields: cf };
  });

  const handleSave = useCallback(async () => {
  if (!form.name.trim()) { toast.error("Name is required"); return; }
  setSaving(true);
  try {
    const payload = {
      ...form,
      origin_year: form.origin_year ? parseInt(form.origin_year, 10) : null,
    };
    await base44.entities.Alter.update(alter.id, payload);
    toast.success("Saved!");
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
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
    if (!confirm(`Permanently delete ${alter?.name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Alter.delete(alter.id);
      toast.success("Alter deleted.");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
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
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.8);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setBgField(BG_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setBgField(BG_IMAGE_KEY, dataUrl);
      }
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
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `header-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setBgField(HEADER_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setBgField(HEADER_IMAGE_KEY, dataUrl);
      }
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
  // Resolved avatar for the VIEW-mode header — must go through the hook too,
  // since a raw <img src="local-image://…"> can't be loaded by the browser
  // and renders as a broken-image icon (the same gotcha the group member
  // avatars and AlterCard already guard against). Resolve the saved
  // alter.avatar_url directly so the header is correct regardless of how the
  // profile was reached (Alters page or a group's member list).
  const rotatingViewAvatarUrl = useRotatingImageUrl({ alterId: alter.id, role: "avatar", mode: alter.avatar_rotation_mode, fallbackUrl: alter.avatar_url });
  const viewAvatar = useResolvedAvatarUrl(rotatingViewAvatarUrl);

  // First-appearance is one field feeding both the free-form birthday text
  // (display) and the integer origin_year (lineage/timeline) — same as the
  // Add New / Edit alter modal.
  const setFirstAppearance = (val) => setForm((f) => ({ ...f, birthday: val, origin_year: extractYear(val) }));

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 512, 0.82);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        set("avatar_url", createLocalImageUrl(imageId));
      } else {
        set("avatar_url", dataUrl);
      }
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
    if (!window.confirm(`Remove all ${existing.length} tag${existing.length === 1 ? "" : "s"} from ${alter.name || "this alter"}? This can't be undone.`)) return;
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

  const viewBgColor = alter.custom_fields?.[BG_COLOR_KEY] || "";
  const viewBgImage = alter.custom_fields?.[BG_IMAGE_KEY] || "";
  const viewBgOpacity = alter.custom_fields?.[BG_OPACITY_KEY] !== undefined ? alter.custom_fields[BG_OPACITY_KEY] : 0.15;
  const viewHeaderText = alter.custom_fields?.[HEADER_TEXT_KEY] || null;
  const viewHeaderBgColorRaw = alter.custom_fields?.[HEADER_BG_KEY] || "";
  // Header bg colour with its own opacity baked in (rgba), so the header
  // colour can be translucent independently of the body bg.
  const viewHeaderBgColor = readProfileBg(alter.custom_fields || {}).headerBgColorWithAlpha || viewHeaderBgColorRaw;
  const viewHideHeader = alter.custom_fields?.[HIDE_HEADER_KEY] || false;
  const viewHeaderImage = alter.custom_fields?.[HEADER_IMAGE_KEY] || "";
  const viewHeaderFont = fontStackFor(alter.custom_fields?.[HEADER_FONT_KEY]);
  // Header-extras flags — when on, that info renders in the header and is
  // MOVED out of the body (not duplicated).
  const headerShowGroups = !!alter.custom_fields?.[HEADER_SHOW_GROUPS_KEY];
  const headerShowSubsystems = !!alter.custom_fields?.[HEADER_SHOW_SUBSYSTEMS_KEY];
  const headerShowFields = !!alter.custom_fields?.[HEADER_SHOW_FIELDS_KEY];
  const headerShowAlterFields = !!alter.custom_fields?.[HEADER_SHOW_ALTER_FIELDS_KEY];
  const headerShowPronouns = !!alter.custom_fields?.[HEADER_SHOW_PRONOUNS_KEY];
  const viewPageFont = fontStackFor(alter.custom_fields?.[PAGE_FONT_KEY]);
  const hasBg = viewBgColor || viewBgImage;
  const alterTextContrast = alter.color ? getContrastColor(alter.color) : null;

  // Resolve background image URLs (may be local-image:// in local mode)
  const [resolvedViewBgImage, setResolvedViewBgImage] = useState(viewBgImage);
  const [resolvedEditBgImage, setResolvedEditBgImage] = useState(bgImage);
  const [resolvedViewHeaderImage, setResolvedViewHeaderImage] = useState("");

  useEffect(() => {
    if (!viewBgImage) { setResolvedViewBgImage(""); return; }
    resolveImageUrl(viewBgImage).then(r => setResolvedViewBgImage(r || "")).catch(() => setResolvedViewBgImage(""));
  }, [viewBgImage]);

  useEffect(() => {
    if (!bgImage) { setResolvedEditBgImage(""); return; }
    resolveImageUrl(bgImage).then(r => setResolvedEditBgImage(r || "")).catch(() => setResolvedEditBgImage(""));
  }, [bgImage]);

  useEffect(() => {
    if (!viewHeaderImage) { setResolvedViewHeaderImage(""); return; }
    resolveImageUrl(viewHeaderImage).then(r => setResolvedViewHeaderImage(r || "")).catch(() => setResolvedViewHeaderImage(""));
  }, [viewHeaderImage]);

  // ── VIEW MODE ──
  const viewHeaderOpacity = alter.custom_fields?.[HEADER_OPACITY_KEY] !== undefined
    ? parseFloat(alter.custom_fields[HEADER_OPACITY_KEY]) : 0.45;
  const viewSectionBgOpacity = parseFloat(alter.custom_fields?.[SECTION_BG_KEY] ?? 0.9);
  const hasSectionBg = viewSectionBgOpacity > 0 && (viewBgColor || viewBgImage || viewHeaderImage);
  // With a background image + background colour, the section cards use that
  // colour at the surface ("readability") opacity — matching the page's other
  // surfaces. Otherwise the readability tint uses the theme surface colour.
  const sectionCardStyle = (viewBgImage && viewBgColor)
    ? { backgroundColor: colorWithAlpha(viewBgColor, viewSectionBgOpacity) }
    : hasSectionBg
      ? { backgroundColor: `rgba(var(--color-surface-rgb), ${viewSectionBgOpacity})` }
      : {};

  if (!editMode) {
    return (
      <div className="relative">
        {/* NB: the page-wide background (colour + image) is rendered ONCE by
            AlterProfile as a `fixed inset-0` layer that doesn't scroll. We
            deliberately do NOT render it again here — doing so produced a
            second, content-height copy that scrolled with the page. The
            header image below stays scoped to the header banner. */}
        <div className="relative z-10 space-y-6" style={viewPageFont ? { fontFamily: viewPageFont } : undefined}>
        {!viewHideHeader && (
          <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(alter.custom_fields || {}), ...(viewHeaderBgColor ? { backgroundColor: viewHeaderBgColor } : {}) }}>
            {viewHeaderImage && resolvedViewHeaderImage && (
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `url("${resolvedViewHeaderImage}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: viewHeaderOpacity,
              }} />
            )}
            {viewBgImage?.startsWith("data:") && (
              <div className="absolute top-2 right-2 z-10">
                <LocalImageFixer
                  value={viewBgImage}
                  maxWidth={1200}
                  quality={0.8}
                  label="⚠️ Fix background"
                  onFixed={async (url) => {
                    await base44.entities.Alter.update(alter.id, {
                      custom_fields: { ...alter.custom_fields, [BG_IMAGE_KEY]: url }
                    });
                    queryClient.invalidateQueries({ queryKey: ["alters"] });
                  }}
                />
              </div>
            )}
            <div className={`relative z-10 flex gap-4 items-start ${hasBg || viewHeaderImage ? "p-4" : ""}`}>
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
                  {viewAvatar
                    ? <img src={viewAvatar} alt={alter.name} className="w-full h-full object-cover" />
                    : <User className="w-10 h-10" style={{ color: alterTextContrast || "hsl(var(--muted-foreground))" }} />}
                </div>
                <div className="absolute -bottom-2 left-0 right-0 flex justify-center">
                  <LocalImageFixer
                    value={alter.avatar_url}
                    maxWidth={400}
                    quality={0.85}
                    onFixed={async (url) => {
                      await base44.entities.Alter.update(alter.id, { avatar_url: url });
                      queryClient.invalidateQueries({ queryKey: ["alters"] });
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1" style={viewHeaderFont ? { fontFamily: viewHeaderFont } : undefined}>
                <h2 className="font-display text-2xl font-semibold" style={{ color: viewHeaderText || undefined }}>
                  {alter.emoji ? <span className="mr-1.5">{alter.emoji}</span> : null}{alter.name}
                </h2>
                {/* Archived tag — archived alters are hidden from most lists, so
                    without this it wasn't possible to tell you were looking at an
                    archived (often duplicate-import) profile. handleArchive
                    toggles is_archived, so it doubles as one-tap Restore. */}
                {alter.is_archived && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Archive className="w-3 h-3" /> Archived
                    </span>
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      <ArchiveRestore className="w-3 h-3" /> Restore
                    </button>
                  </div>
                )}
                {alter.alias && !(alter.name || "").toLowerCase().includes(alter.alias.toLowerCase()) && (
                  <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>aka {alter.alias}</p>
                )}
                {alter.pronouns && (headerShowPronouns || !(alter.name || "").toLowerCase().includes(alter.pronouns.toLowerCase())) && (
                  <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>{alter.pronouns}</p>
                )}
                {alter.birthday && <p className="text-xs" style={{ color: viewHeaderText ? `${viewHeaderText}99` : "hsl(var(--muted-foreground))" }}>🎂 {alter.birthday}</p>}
                {alter.role && (() => {
                  // Soft tint pill is the default look. When the alter's color is
                  // too close to the rendered header backdrop (viewBgColor), the
                  // tint + text collapse into the same wash — fall back to a
                  // solid pill so the role stays readable. WCAG AA-large = 3:1.
                  const pillColor = viewHeaderText || alter.color;
                  const backdrop = viewBgColor;
                  const lowContrast =
                    !viewHeaderText &&
                    pillColor &&
                    backdrop &&
                    contrastRatio(pillColor, backdrop) < 3;
                  // When the header has a user-uploaded image behind it,
                  // the role text sits directly on top of arbitrary pixels —
                  // a dark-on-dark or light-on-light collision can hide it.
                  // A soft outline is always worth it here regardless of
                  // contrast maths, since we can't analyse the image.
                  const textShadow = viewHeaderImage
                    ? "0 0 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.85)"
                    : undefined;
                  if (lowContrast) {
                    return (
                      <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-1"
                        style={{
                          backgroundColor: pillColor,
                          color: getContrastColor(pillColor),
                          textShadow,
                        }}>
                        {alter.role}
                      </span>
                    );
                  }
                  return (
                    <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-1"
                      style={{
                        backgroundColor: viewHeaderText ? `${viewHeaderText}20` : (alter.color ? `${alter.color}20` : "hsl(var(--muted))"),
                        color: viewHeaderText || alter.color || "hsl(var(--muted-foreground))",
                        textShadow,
                      }}>
                      {alter.role}
                    </span>
                  );
                })()}
                {/* Optional header extras — groups / subsystems / custom fields,
                    toggled per-alter on the edit page. Group & subsystem chips
                    link to their pages; chip mode = icon / name / both. */}
                {(() => {
                  const cf = alter.custom_fields || {};
                  if (!headerShowGroups && !headerShowSubsystems && !headerShowFields && !headerShowAlterFields) return null;
                  const chipMode = cf[HEADER_CHIP_MODE_KEY] || "both";
                  const hgroups = headerShowGroups ? (alter.groups || []).map((g) => allGroups.find((x) => x.id === g.id || x.sp_id === g.id) || g) : [];
                  const hsubs = headerShowSubsystems ? ownedSubsystems : [];
                  const fieldChips = [];
                  if (headerShowFields) {
                    for (const f of systemFields) {
                      const v = cf[f.id];
                      if (f.is_visible !== false && v && v !== "false") {
                        fieldChips.push({ label: f.name, value: f.field_type === "boolean" ? "Yes" : String(v) });
                      }
                    }
                  }
                  if (headerShowAlterFields && Array.isArray(alter.alter_custom_fields)) {
                    for (const f of alter.alter_custom_fields) if (f?.value) fieldChips.push({ label: f.name, value: String(f.value) });
                  }
                  if (!hgroups.length && !hsubs.length && !fieldChips.length) return null;
                  const chipStyle = (c) => ({
                    backgroundColor: viewHeaderText ? `${viewHeaderText}18` : (c ? `${c}20` : "hsl(var(--muted))"),
                    borderColor: viewHeaderText ? `${viewHeaderText}40` : (c ? `${c}55` : "hsl(var(--border))"),
                    color: viewHeaderText || c || "hsl(var(--foreground))",
                  });
                  const linkChip = (g, key) => (
                    <button key={key} type="button" onClick={() => navigate(`/group/${g.id}`)} title={`Open ${g.name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:brightness-110 transition max-w-full"
                      style={chipStyle(g.color)}>
                      {chipMode !== "name" && <GroupIcon group={g} className="w-3.5 h-3.5 flex-shrink-0" />}
                      {chipMode !== "icon" && <span className="truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>}
                    </button>
                  );
                  return (
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {hgroups.map((g) => linkChip(g, `hg-${g.id}`))}
                      {hsubs.map((g) => linkChip(g, `hs-${g.id}`))}
                      {fieldChips.map((f, i) => (
                        <span key={`hf-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border max-w-full" style={chipStyle(null)}>
                          <span className="opacity-70">{f.label}:</span><span className="truncate font-medium">{f.value}</span>
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {alter.description ? (() => {
          const blocks = htmlToBlocks(alter.description);
          // If all blocks are raw/text type whose content looks like encoded data, the bio is corrupted
          const looksCorrupted = blocks.length > 0 && blocks.every(b =>
            (b.type === "raw" || b.type === "text") &&
            (b.content?.includes("data-blocks=") || b.content?.match(/^%5B|^blocks=/))
          );
          if (looksCorrupted) {
            return (
              <div className="bg-muted/20 rounded-xl p-4 border border-border/40 text-center">
                <p className="text-sm text-muted-foreground italic">Bio display issue — open Edit to re-save the bio and it will display correctly.</p>
              </div>
            );
          }
          return (
            <div className="bg-muted/20 rounded-xl p-4 border border-border/40" style={sectionCardStyle}>
              <SimplePreview blocks={blocks} onBlockChange={() => {}} readOnly={true} scopeId={alter?.id} />
            </div>
          );
        })() : (
          <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
            No bio yet. Tap <strong>Edit</strong> to add one.
          </div>
        )}

        {alter.groups && alter.groups.length > 0 && !headerShowGroups && (() => {
          // Group chips render against the page background here (bio area).
          // When the group's user-picked colour is very close to the page
          // bg (e.g. a dark group colour in dark mode), the tinted fill
          // and border collapse into the surrounding wash and the chip
          // becomes effectively invisible. Add a subtle contrast ring in
          // that case — the colour itself is preserved untouched.
          const pageBg = getPageBackground();
          return (
          <div>
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Groups</p>
            <div className="flex flex-wrap gap-1.5">
              {alter.groups.map((g) => {
                const halo = g.color && needsHalo(g.color, pageBg);
                const fillColor = halo ? adjustForContrast(g.color, pageBg) : g.color;
                return (
                <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)}
                  title={`Open ${g.name}`}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border hover:brightness-110 transition"
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
          </div>
          );
        })()}

        {ownedSubsystems.length > 0 && !headerShowSubsystems && (
          <div>
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {alter.name}'s {subsystemTerm}{ownedSubsystems.length === 1 ? "" : "s"}
            </p>
            <div className="space-y-1.5">
              {ownedSubsystems.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/group/${g.id}`)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
                  style={{ borderLeftColor: g.color || "transparent", borderLeftWidth: g.color ? 3 : 1 }}
                >
                  <Folder className="w-4 h-4 flex-shrink-0" style={{ color: g.color || "hsl(var(--muted-foreground))" }} />
                  <span className="text-sm flex-1 truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {presetAnswerRows.length > 0 && (
          <div>
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              From Get to know me
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
              <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tags
                <span className="ml-2 text-[10px] font-normal italic normal-case tracking-normal text-muted-foreground/70">
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
                <span key={tag} className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">
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

        {(() => {
          const customFieldValues = alter.custom_fields || {};
const FIELD_ORDER_KEY = "_field_order";
const perAlterOrder = customFieldValues[FIELD_ORDER_KEY] || null;
const orderedFields = perAlterOrder
  ? [...systemFields].sort((a, b) => {
      const ai = perAlterOrder.indexOf(a.id);
      const bi = perAlterOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    })
  : systemFields;
const visibleFilled = orderedFields.filter(f => f.is_visible !== false && customFieldValues[f.id]);
          // alter_custom_fields can be either an array of ad-hoc
          // { name, value } records (this tab's UI) or an object
          // map keyed by CustomField id (Get to know me / Help me
          // unblend writeback). Guard against the object shape so
          // .filter() doesn't blow up when the user has used the
          // unblend writeback path.
          const alterSpecific = Array.isArray(alter.alter_custom_fields)
            ? alter.alter_custom_fields.filter(f => f.value)
            : [];
          // Fields shown in the header are MOVED there, not duplicated here.
          const bodyFilled = headerShowFields ? [] : visibleFilled;
          const bodyAdhoc = headerShowAlterFields ? [] : alterSpecific;
          if (bodyFilled.length === 0 && bodyAdhoc.length === 0) return null;
          return (
            <div>
              <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Info</p>
              <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden" style={sectionCardStyle}>
                {bodyFilled.map((field, i) => (
                  <div key={field.id} className={`flex gap-3 px-3 py-2.5 ${i < bodyFilled.length + bodyAdhoc.length - 1 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5 leading-relaxed">{field.name}</span>
                    {/* div (not span) so text-type fields can host the
                        block-level MarkdownText without invalid nesting. */}
                    <div className="text-xs text-foreground flex-1 leading-relaxed break-words min-w-0">
                      {field.field_type === "boolean"
                        ? (customFieldValues[field.id] === "true" ? "Yes" : "No")
                        : field.field_type === "list" && typeof customFieldValues[field.id] === "string"
                          ? (
                            <span className="inline-flex flex-wrap gap-1">
                              {customFieldValues[field.id].split(/[,;|]/).map((s) => s.trim()).filter(Boolean).map((item, i) => (
                                <span key={`${item}-${i}`} className="text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{item}</span>
                              ))}
                            </span>
                          )
                          : (field.field_type === "text" || field.field_type === "richtext")
                            ? <MarkdownText>{String(customFieldValues[field.id])}</MarkdownText>
                            : <span className="whitespace-pre-wrap break-words">{customFieldValues[field.id]}</span>}
                    </div>
                  </div>
                ))}
                {bodyAdhoc.map((field, idx) => (
                  <div key={idx} className={`flex gap-3 px-3 py-2.5 ${idx < bodyAdhoc.length - 1 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5 leading-relaxed">{field.name}</span>
                    <div className="text-xs text-foreground flex-1 leading-relaxed break-words min-w-0">
                      <MarkdownText>{String(field.value)}</MarkdownText>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        </div>
      </div>
    );
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-4">
      {form.color && <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: form.color }} />}

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
          {/* Pin to top — parity with the press-and-hold action on the
              alters list. Rides through the save via {...form}. */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => set("is_pinned", !form.is_pinned)}
              className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground cursor-pointer"
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[0.625rem] leading-none ${form.is_pinned ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{form.is_pinned ? "✓" : ""}</span>
              Pin to the top of {t.alters} lists
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 w-[76px] flex flex-col items-center gap-1.5">
          <label className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">Avatar</label>
          <div className="w-[68px] h-[68px] rounded-full border-2 border-border/60 overflow-hidden flex items-center justify-center bg-muted/40">
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              : <User className="w-7 h-7 text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap justify-center gap-0.5 w-[68px]">
            <IconButton icon={Upload} title="Upload image" onClick={() => avatarFileRef.current?.click()} busy={uploadingAvatar} />
            <AssetButton onPick={(url) => set("avatar_url", url)} className={iconBtnClass()} />
            <IconButton icon={Link2} title="Image URL" onClick={() => setShowAvatarUrl((s) => !s)} />
            <IconButton icon={X} title="Remove avatar" onClick={() => set("avatar_url", "")} danger disabled={!form.avatar_url} />
          </div>
          <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>
      </div>
      {showAvatarUrl && (
        <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://… or paste an image URL" />
      )}

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

      {/* Role */}
      <div className="space-y-1 rounded-2xl" data-pf-surface>
        <label className="text-xs text-muted-foreground font-medium">Role</label>
        <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host…" />
      </div>

      {/* First appearance — one field feeding both the free-form display
          and the integer origin_year (lineage/timeline). */}
      <div className="space-y-1 rounded-2xl" data-pf-surface>
        <label className="text-xs text-muted-foreground font-medium">First appearance</label>
        <Input
          value={form.birthday || ""}
          onChange={(e) => setFirstAppearance(e.target.value)}
          placeholder={`e.g. ${new Date().getFullYear() - 5}, March ${new Date().getFullYear() - 5}, or a full date`}
        />
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">When this {t.alter} first appeared — just a year, or a specific month/day. Feeds the {t.Alter} History timeline.</p>
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
        {alter.groups && alter.groups.length > 0 ? (() => {
          const pageBg = getPageBackground();
          return (
          <div className="flex flex-wrap gap-1.5">
            {alter.groups.map((g) => {
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

      {/* Profile style — shared editor (Header collapsible; Body inline).
          Same editor as the Add New / Edit {alter} modal. */}
      <SubSection title="Profile style" icon={Image} defaultOpen={false}>
        <ProfileStyleEditor
          customFields={form.custom_fields}
          setField={setBgField}
          clearField={(key) => setForm((f) => {
            const cf = { ...f.custom_fields };
            delete cf[key];
            return { ...f, custom_fields: cf };
          })}
          rotationConfig={{ alterId: alter.id, role: "background" }}
        />
      </SubSection>

      <SubSection title="Header extras" icon={Users} defaultOpen={false}>
        <p className="text-xs text-muted-foreground mb-1.5">Show extra info in this profile's header — it moves up there instead of showing in the body below. Group &amp; {subsystemTerm} chips link to their pages.</p>
        {[
          { key: HEADER_SHOW_GROUPS_KEY, label: "Show groups" },
          { key: HEADER_SHOW_SUBSYSTEMS_KEY, label: `Show ${subsystemTerm}s` },
          { key: HEADER_SHOW_FIELDS_KEY, label: "Show custom fields" },
          { key: HEADER_SHOW_ALTER_FIELDS_KEY, label: `Show ${t.alter}-specific custom fields` },
          { key: HEADER_SHOW_PRONOUNS_KEY, label: "Always show pronouns" },
        ].map(({ key, label }) => {
          const on = !!form.custom_fields?.[key];
          return (
            <button key={key} type="button" onClick={() => setBgField(key, !on)} className="w-full flex items-center justify-between gap-2 py-1.5">
              <span className="text-sm text-foreground">{label}</span>
              <span className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors ${on ? "bg-primary justify-end" : "bg-muted justify-start"}`}>
                <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </span>
            </button>
          );
        })}
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-1">Group / {subsystemTerm} chip style</p>
          <div className="flex gap-1.5">
            {["icon", "name", "both"].map((m) => {
              const active = (form.custom_fields?.[HEADER_CHIP_MODE_KEY] || "both") === m;
              return (
                <button key={m} type="button" onClick={() => setBgField(HEADER_CHIP_MODE_KEY, m)}
                  className={`flex-1 h-8 rounded-lg border text-xs font-medium capitalize transition-colors ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </SubSection>

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
      {showAvatarModal && <AvatarModal src={form.avatar_url} onSave={(url) => set("avatar_url", url)} onClose={() => setShowAvatarModal(false)} />}
      {showColorPicker && <ColorPickerModal color={form.color || "#8b5cf6"} label="Alter Color" onSave={(hex) => set("color", hex)} onClose={() => setShowColorPicker(false)} />}
      {showBgColorPicker && <ColorPickerModal color={bgColor || "#1a0a2e"} label="Background Color" onSave={(hex) => setBgField(BG_COLOR_KEY, hex)} onClose={() => setShowBgColorPicker(false)} />}
      {showHeaderTextPicker && <ColorPickerModal color={headerTextColor || "#ffffff"} label="Header Text Color" onSave={(hex) => setBgField(HEADER_TEXT_KEY, hex)} onClose={() => setShowHeaderTextPicker(false)} />}
      {showPageTextPicker && <ColorPickerModal color={pageTextColor || "#ffffff"} label="Page Text Color" onSave={(hex) => setBgField(PAGE_TEXT_KEY, hex)} onClose={() => setShowPageTextPicker(false)} />}
      <AlterImagePoolManager open={avatarPoolOpen} onClose={() => setAvatarPoolOpen(false)} alterId={alter.id} role="avatar" />
    </div>
  );
}