import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Folder, FolderTree, User, Crown, Users, Pencil, Eye, EyeOff, Save,
  Loader2, Upload, X, Image as ImageIcon, Trash2, Smile, MessageSquare, FileText, Send, Archive,
  Undo2, Redo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { isValidHexColor } from "@/lib/colorUtils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import BioEditor from "@/components/alters/BioEditor";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import GroupSelect from "@/components/groups/GroupSelect";
import ProfileStyleEditor from "@/components/shared/ProfileStyleEditor";
import { SubSection } from "@/components/settings/SettingsUI";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import GroupIcon from "@/components/shared/GroupIcon";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import { Textarea } from "@/components/ui/textarea";
import AlterCard from "@/components/alters/AlterCard";
import {
  getMemberAlters, getSubsystemsOwnedBy, isSubsystem,
  wouldCreateOwnershipCycle,
} from "@/lib/subsystemUtils";
import { groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, profileSurfaceCss, profileThemeCss, headerThemeStyleVars } from "@/lib/profileStyle";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import GroupConfigToggles from "@/components/groups/GroupConfigToggles";
import { pickGroupConfig } from "@/lib/groupConfig";
import { useUndoRedo } from "@/hooks/useUndoRedo";

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_IMAGE_KEY = "_header_image";
const HEADER_BG_KEY = "_header_bg_color";
const HEADER_FONT_KEY = "_header_font";
const HIDE_HEADER_KEY = "_hide_header";
// Same keys the alter profile uses, so contrast helpers + rendering treat
// group and alter text colours identically.
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";
const HEADER_TEXT_KEY = "_header_text_color";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a2e" : "#ffffff";
}

// Would setting `candidateParentId` as the parent of `childId` create a
// group-nesting loop? Walk UP from the candidate; if we reach the child,
// it loops. Depth-clamped + visited-guarded against pre-existing bad data.
function wouldCreateGroupParentCycle(groups, childId, candidateParentId) {
  if (!candidateParentId) return false;
  if (childId === candidateParentId) return true;
  let cur = groups.find((g) => g.id === candidateParentId || g.sp_id === candidateParentId);
  const seen = new Set();
  let depth = 0;
  while (cur && depth < 50) {
    if (cur.id === childId) return true;
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const pid = cur.parent;
    cur = pid ? groups.find((g) => g.id === pid || g.sp_id === pid) : null;
    depth++;
  }
  return false;
}

function GroupAvatar({ url, color, emoji, size = "w-24 h-24", iconSize = "w-10 h-10" }) {
  const resolved = useResolvedAvatarUrl(url);
  const textColor = isValidHexColor(color) ? getContrastColor(color) : "hsl(var(--muted-foreground))";
  return (
    <div className={`${size} rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center`}
      style={{ backgroundColor: isValidHexColor(color) ? color : "hsl(var(--muted))" }}>
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : emoji
          ? <span className="text-3xl">{emoji}</span>
          : <Folder className={iconSize} style={{ color: textColor }} />}
    </div>
  );
}

// Member avatar that resolves local-image:// (and the SW /local-image/
// path) the same way the rest of the app does — a raw <img src> on a
// legacy local-image:// URL renders broken, which is why member pictures
// weren't showing on the group profile.
function MemberAvatar({ alter, size = "w-9 h-9", rounded = "rounded-lg" }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  const color = alter?.color;
  return (
    <div className={`${size} ${rounded} overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40`}
      style={{ backgroundColor: isValidHexColor(color) ? color : "hsl(var(--muted))" }}>
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" />
        : <User className="w-4 h-4" style={{ color: isValidHexColor(color) ? getContrastColor(color) : "hsl(var(--muted-foreground))" }} />}
    </div>
  );
}

function GroupProfileInner() {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  // When a member owns MORE THAN ONE subsystem, tapping their subsystem icon
  // opens this chooser instead of jumping to an arbitrary one.
  const [subPicker, setSubPicker] = useState(null);
  const queryClient = useQueryClient();
  const t = useTerms();
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("profile"); // profile | board | notes
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
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  // Resolve by entity id OR sp_id — alter.groups stores `sp_id || id`, so a
  // chip tapped from an alter profile can arrive with either.
  const group = allGroups.find((g) => String(g.id) === String(groupId) || (g.sp_id && String(g.sp_id) === String(groupId))) || null;

  // Recolour the APP-HEADER wave to this group's wave colour while it's open
  // (resolving a var(--color-…) palette reference against the live .os-pf
  // theme). Cleared on unmount. Mirrors AlterProfile.
  const groupWaveRaw = group?.custom_fields?.["_theme_wave"];
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
        else if (kind === "header") setCf(HEADER_IMAGE_KEY, stored);
        else setCf(BG_IMAGE_KEY, stored);
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
      await base44.entities.Group.update(group.id, {
        name: form.name.trim(),
        color: form.color,
        emoji: form.emoji,
        description: form.description,
        avatar_url: form.avatar_url,
        owner_alter_id: form.owner_alter_id || "",
        parent: form.parent || "",
        ...pickGroupConfig(form),
        custom_fields: form.custom_fields,
      });
      toast.success("Saved!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      setEditMode(false);
    } catch (e) { toast.error(e.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the group "${group.name}"? Members are not deleted — they just leave the group. This can't be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Group.delete(group.id);
      toast.success("Group deleted.");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
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

  const ownerAlter = group.owner_alter_id ? alters.find((a) => a.id === group.owner_alter_id) : null;
  const parentGroup = group.parent ? allGroups.find((g) => g.id === group.parent || g.sp_id === group.parent) : null;
  const members = getMemberAlters(group, alters);
  const childGroups = allGroups.filter((g) => g.parent && (g.parent === group.id || g.parent === group.sp_id));
  const subsystem = isSubsystem(group);

  const cf = group.custom_fields || {};
  const ps = readProfileBg(cf);
  const bgColor = ps.bgColor;
  const bgImage = ps.bgImage;
  const bgOpacity = ps.bgOpacity;
  const headerOpacity = ps.headerOpacity;
  const surfaceCss = profileSurfaceCss("os-pf", cf);
  const themeCss = profileThemeCss("os-pf", cf);
  const headerImage = cf[HEADER_IMAGE_KEY] || "";
  // Header bg colour with its own opacity baked in (rgba) — so the header
  // colour can be made translucent independently of the body bg.
  const headerBgColor = ps.headerBgColorWithAlpha || cf[HEADER_BG_KEY] || "";
  const pageTextColor = cf[PAGE_TEXT_KEY] || "";
  const headerTextColor = cf[HEADER_TEXT_KEY] || "";
  const headerFont = fontStackFor(cf[HEADER_FONT_KEY]);
  const pageFont = fontStackFor(cf[PAGE_FONT_KEY]);
  const hideHeader = !!cf[HIDE_HEADER_KEY];
  const frontingAlterIds = activeSessions.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean);

  const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "board", label: "Board", icon: MessageSquare },
    { id: "notes", label: "Notes", icon: FileText },
  ];
  const tabBar = (
    <div data-pf-chrome className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none px-1.5 py-1">
      {TABS.map((tb) => {
        const Icon = tb.icon;
        return (
          <button key={tb.id} onClick={() => { setTab(tb.id); if (tb.id !== "profile") setEditMode(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${tab === tb.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            <Icon className="w-4 h-4" /> {tb.label}
          </button>
        );
      })}
    </div>
  );

  // ---------- BOARD / NOTES TABS ----------
  if (tab === "board" || tab === "notes") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
        <PageBackground bgColor={bgColor} bgImage={bgImage} bgOpacity={bgOpacity} />
        {themeCss && <style>{themeCss}</style>}
        {surfaceCss && <style>{surfaceCss}</style>}
        <div className="relative z-10 os-pf space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <div className="flex items-center gap-2.5">
          <GroupIcon group={group} boxed className="w-9 h-9" boxClassName="rounded-lg border border-border/40" />
          <span className="font-display text-lg font-semibold truncate" style={{ color: groupNameColor(group.color) }}>{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
        </div>
        {tabBar}
        {tab === "board" ? (
          <BulletinBoard
            alters={alters.filter((a) => !a.is_archived)}
            currentAlterId={frontingAlterIds[0] || null}
            frontingAlterIds={frontingAlterIds}
            groupId={group.id}
          />
        ) : (
          <GroupNotesTab groupId={group.id} />
        )}
        </div>
      </motion.div>
    );
  }

  // ---------- VIEW MODE ----------
  if (!editMode) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative">
        <PageBackground bgColor={bgColor} bgImage={bgImage} bgOpacity={bgOpacity} />
        {themeCss && <style>{themeCss}</style>}
        {surfaceCss && <style>{surfaceCss}</style>}
        <div className="relative z-10 os-pf space-y-6" style={{ ...(pageTextColor ? { color: pageTextColor } : {}), ...(pageFont ? { fontFamily: pageFont } : {}) }}>
        <div data-pf-chrome className="flex items-center justify-between px-2 py-1.5">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>

        {tabBar}

        {!hideHeader && (
          <ViewHeader group={group} headerImage={headerImage} headerTextColor={headerTextColor}
            headerBgColor={headerBgColor} headerFont={headerFont} headerOpacity={headerOpacity}
            ownerAlter={ownerAlter} subTerm={subTerm} t={t} navigate={navigate} parentGroup={parentGroup} memberCount={members.length} />
        )}

        {group.description ? (
          <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
            <SimplePreview blocks={htmlToBlocks(group.description)} onBlockChange={() => {}} readOnly />
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
            No description yet. Tap <strong>Edit</strong> to add one.
          </div>
        )}

        {childGroups.length > 0 && (
          <div>
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Nested groups</p>
            <div className="space-y-1.5">
              {childGroups.map((g) => (
                <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
                  style={{ borderLeftColor: g.color || "transparent", borderLeftWidth: g.color ? 3 : 1 }}>
                  <GroupIcon group={g} className="w-4 h-4" />
                  <span className="text-sm flex-1 truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Members{members.length ? ` (${members.length})` : ""}
            </p>
            <button type="button" onClick={() => setShowMembers(true)} className="text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Manage
            </button>
          </div>
          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground">No members yet. Tap Manage to add some.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m, i) => {
                const ownedSubs = getSubsystemsOwnedBy(allGroups, m.id);
                return (
                  <AlterCard
                    key={m.id}
                    alter={m}
                    index={i}
                    activeSessions={activeSessions}
                    hideFront
                    rightAccessory={(m.is_archived || ownedSubs.length > 0) ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Archived members are hidden from Manage members and the
                            Alters folder, so without this tag the group looked like
                            it had "normal" members that were really archived (often
                            duplicate) imports. */}
                        {m.is_archived && (
                          <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <Archive className="w-2.5 h-2.5" /> Archived
                          </span>
                        )}
                        {ownedSubs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              // One subsystem → jump straight in; several →
                              // chooser (matches the alters-page behaviour).
                              if (ownedSubs.length === 1) navigate(`/group/${ownedSubs[0].id}`);
                              else setSubPicker({ alter: m, subs: ownedSubs });
                            }}
                            title={ownedSubs.length === 1 ? `Open ${ownedSubs[0].name}` : `${ownedSubs.length} subsystems`}
                            className="relative w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          >
                            <FolderTree className="w-4 h-4" style={{ color: ownedSubs.length === 1 ? (ownedSubs[0].color || undefined) : undefined }} />
                            {ownedSubs.length > 1 && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-primary-foreground text-[0.5625rem] font-semibold flex items-center justify-center">{ownedSubs.length}</span>
                            )}
                          </button>
                        )}
                      </div>
                    ) : null}
                  />
                );
              })}
            </div>
          )}
        </div>

        {showMembers && (
          <GroupMembersModal group={group} allGroups={allGroups} isOpen={showMembers} onClose={() => setShowMembers(false)} />
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

      {tabBar}

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

      {/* Profile style — shared editor (collapsible Header / Body with
          colours, images, fonts, opacity + readability). Matches the
          Add New Group modal pattern. */}
      <SubSection title="Profile style" icon={ImageIcon} defaultOpen={false}>
        <ProfileStyleEditor
          customFields={form.custom_fields}
          setField={setCf}
          clearField={(key) => setForm((f) => {
            const cf = { ...f.custom_fields };
            delete cf[key];
            return { ...f, custom_fields: cf };
          })}
        />
      </SubSection>

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
      {showBgColorPicker && <ColorPickerModal color={form.custom_fields[BG_COLOR_KEY] || "#1a0a2e"} label="Background Color" onSave={(hex) => setCf(BG_COLOR_KEY, hex)} onClose={() => setShowBgColorPicker(false)} />}
      {showPageTextPicker && <ColorPickerModal color={form.custom_fields[PAGE_TEXT_KEY] || "#ffffff"} label="Page Text Color" onSave={(hex) => setCf(PAGE_TEXT_KEY, hex)} onClose={() => setShowPageTextPicker(false)} />}
      {showHeaderTextPicker && <ColorPickerModal color={form.custom_fields[HEADER_TEXT_KEY] || "#ffffff"} label="Header Text Color" onSave={(hex) => setCf(HEADER_TEXT_KEY, hex)} onClose={() => setShowHeaderTextPicker(false)} />}
      {showMembers && <GroupMembersModal group={group} allGroups={allGroups} isOpen={showMembers} onClose={() => setShowMembers(false)} />}

      {/* Multi-subsystem chooser — when a member owns more than one subsystem. */}
      {subPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSubPicker(null)}>
          <div className="bg-card border border-border rounded-2xl w-full sm:max-w-xs p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">{subPicker.alter.name}'s subsystems</p>
              <button type="button" onClick={() => setSubPicker(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              {subPicker.subs.map((sub) => {
                const count = getMemberAlters(sub, alters).length;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => { setSubPicker(null); navigate(`/group/${sub.id}`); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 hover:bg-muted/40 text-left transition-colors"
                  >
                    <GroupIcon group={sub} className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm flex-1 truncate" style={{ color: groupNameColor(sub.color) }}>{sub.emoji ? `${sub.emoji} ` : ""}{sub.name}</span>
                    <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </div>
    </motion.div>
  );
}

// Per-group notes — a private notebook for this group/subsystem, separate
// from its bulletin board.
function GroupNotesTab({ groupId }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: notes = [] } = useQuery({
    queryKey: ["groupNotes", groupId],
    queryFn: async () => {
      const all = await base44.entities.GroupNote.list("-created_date");
      return all.filter((n) => n.group_id === groupId);
    },
  });
  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await base44.entities.GroupNote.create({ group_id: groupId, content: text.trim(), created_date: new Date().toISOString() });
      setText("");
      qc.invalidateQueries({ queryKey: ["groupNotes", groupId] });
    } catch (e) { toast.error(e?.message || "Couldn't save note"); }
    finally { setSaving(false); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this note?")) return;
    try { await base44.entities.GroupNote.delete(id); qc.invalidateQueries({ queryKey: ["groupNotes", groupId] }); } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-card p-2 space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for this group…" className="min-h-[70px] text-sm resize-none" />
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={saving || !text.trim()} className="bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Add note
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No notes yet for this group.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-border/40 bg-muted/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words flex-1">{n.content}</p>
                <button type="button" onClick={() => del(n.id)} aria-label="Delete note" className="text-muted-foreground/50 hover:text-destructive flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {n.created_date && <p className="text-[0.625rem] text-muted-foreground mt-1.5">{new Date(n.created_date).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StyleImageRow({ label, busy, inputRef, value, onClear, onChange, onText }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="flex gap-2">
        <Input value={value || ""} onChange={(e) => onText(e.target.value)} placeholder="https://… or upload →" className="flex-1 text-xs h-7" />
        <AssetButton onPick={onText} className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 flex-shrink-0">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 text-muted-foreground" />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} />
        {value && <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive flex-shrink-0"><X className="w-3 h-3" /></button>}
      </div>
    </div>
  );
}

// Full-screen background for the whole group/subsystem screen. The
// "Background image" + "Background color" + opacity are page-wide (they
// sit behind ALL the content), while the "Header image" stays scoped to
// the header banner in ViewHeader. Rendered as the first, absolutely
// positioned child of a `relative` page wrapper; the content alongside
// it must be `relative z-10` so it paints on top.
function PageBackground({ bgColor, bgImage, bgOpacity }) {
  const [resolvedBg, setResolvedBg] = useState(null);
  useEffect(() => {
    if (bgImage) resolveImageUrl(bgImage).then(setResolvedBg).catch(() => setResolvedBg(null));
    else setResolvedBg(null);
  }, [bgImage]);
  if (!bgColor && !bgImage) return null;
  const hasImage = !!(bgImage && resolvedBg);
  return (
    // Fixed full-screen background — fills the viewport, edge-to-edge, doesn't
    // scroll. When an image is set, _bg_color is painted as a SOLID base layer
    // UNDER the image so lowering the image opacity reveals the colour (and the
    // profile's bg colour wins over the app page bg here). The surfaces are
    // additionally tinted via profileSurfaceCss.
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {hasImage ? (
        <>
          {bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor }} />}
          <div className="absolute inset-0" style={{ backgroundImage: `url("${resolvedBg}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOpacity }} />
        </>
      ) : (
        bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor, opacity: bgOpacity }} />
      )}
    </div>
  );
}

function ViewHeader({ group, headerImage, headerTextColor, headerBgColor, headerFont, headerOpacity = 0.45, ownerAlter, subTerm, t, navigate, parentGroup, memberCount }) {
  const [resolvedHeader, setResolvedHeader] = useState(null);
  useEffect(() => { if (headerImage) resolveImageUrl(headerImage).then(setResolvedHeader).catch(() => setResolvedHeader(null)); else setResolvedHeader(null); }, [headerImage]);
  const hasHeader = !!(headerImage && resolvedHeader);
  // Header text colour: the user's override wins; otherwise white over a
  // header image (for contrast), else the group's name colour.
  const nameColor = headerTextColor || (hasHeader ? undefined : groupNameColor(group.color));
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(group.custom_fields || {}), ...(headerTextColor ? { color: headerTextColor } : {}), ...(headerBgColor ? { backgroundColor: headerBgColor } : {}) }}>
      {hasHeader && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${resolvedHeader}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: headerOpacity }} />
      )}
      <div className={`relative z-10 flex gap-4 items-start ${hasHeader || headerBgColor ? "p-4" : ""}`} style={headerFont ? { fontFamily: headerFont } : undefined}>
        <GroupAvatar url={group.avatar_url} color={group.color} emoji={group.emoji} />
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2"
            style={{ color: nameColor }}>
            {group.emoji ? <span>{group.emoji}</span> : null}{group.name}
          </h2>
          {ownerAlter && (
            <button type="button" onClick={() => navigate(`/alter/${ownerAlter.id}`)} className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:underline">
              <Crown className="w-3.5 h-3.5" /> {ownerAlter.name}'s {subTerm}
            </button>
          )}
          {parentGroup && (
            <button type="button" onClick={() => navigate(`/group/${parentGroup.id}`)} className="block text-xs text-muted-foreground hover:text-foreground">
              <Folder className="w-3 h-3 inline mr-1" /> inside {parentGroup.name}
            </button>
          )}
          <p className="text-xs text-muted-foreground">{memberCount} member{memberCount === 1 ? "" : "s"}</p>
        </div>
      </div>
    </div>
  );
}

export default function GroupProfile() {
  const { id } = useParams();
  return (
    <ErrorBoundary
      resetKeys={[id]}
      fallback={(error, reset) => (
        <div className="p-4 space-y-3">
          <Link to="/Home"><Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
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
