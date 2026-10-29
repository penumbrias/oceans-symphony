// The sections of a group / subsystem profile page (v0.291.0) — ONE copy
// each, used by the page's widgets (src/v2/profileWidgets.jsx). Every
// section takes the group record and reads the rest (members, nesting,
// who's in front) itself through useGroupContext, so a section can be
// placed on any page of the group's board.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Folder, FolderTree, User, Crown, Users, X, Archive, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { isValidHexColor } from "@/lib/colorUtils";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import GroupIcon from "@/components/shared/GroupIcon";
import ProfileJournalTab from "@/components/journal/ProfileJournalTab";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { isLogCommandError } from "@/lib/authoredText";
import { groupNotesKey, listGroupNotes, saveGroupNote, deleteGroupNote } from "@/lib/groupNotes";
import AlterCard from "@/components/alters/AlterCard";
import { getMemberAlters, getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import { groupNameColor } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, headerThemeStyleVars, PS } from "@/lib/profileStyle";
import { parentGroupOf, childGroups as childGroupsOf, byGroupOrder } from "@/lib/groupTree";
import { resolveImageUrl } from "@/lib/imageUrlResolver";


export function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a2e" : "#ffffff";
}

export function GroupAvatar({ url, color, emoji, size = "w-24 h-24", iconSize = "w-10 h-10" }) {
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

// The term for a subsystem under the person's own word for "system".
export const useSubTerm = () => {
  const t = useTerms();
  return t.system === "system" ? "subsystem" : `sub${t.system}`;
};

// Everything a section needs beyond the group record.
export function useGroupContext(group) {
  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const ownerAlter = group?.owner_alter_id ? alters.find((a) => a.id === group.owner_alter_id) || null : null;
  const parentGroup = group ? parentGroupOf(group, allGroups) : null;
  const members = group ? getMemberAlters(group, alters).filter((m) => !(group.hide_archived_members && m.is_archived)) : [];
  const childGroups = group ? childGroupsOf(allGroups, group.id).sort(byGroupOrder) : [];
  const frontingAlterIds = activeSessions.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean);
  return { allGroups, alters, activeSessions, ownerAlter, parentGroup, members, childGroups, frontingAlterIds };
}

// ── Profile page ─────────────────────────────────────────────────────

export function GroupHeaderSection({ group }) {
  const navigate = useNavigate();
  const t = useTerms();
  const subTerm = useSubTerm();
  const { ownerAlter, parentGroup, members } = useGroupContext(group);
  const cf = group.custom_fields || {};
  const ps = readProfileBg(cf);
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  // Header bg colour with its own opacity baked in (rgba) — so the header
  // colour can be made translucent independently of the body bg.
  const headerBgColor = ps.headerBgColorWithAlpha || cf[PS.HEADER_BG] || "";
  const headerTextColor = cf[PS.HEADER_TEXT] || "";
  const headerFont = fontStackFor(cf[PS.HEADER_FONT]);
  const headerOpacity = ps.headerOpacity;
  const [resolvedHeader, setResolvedHeader] = useState(null);
  React.useEffect(() => { if (headerImage) resolveImageUrl(headerImage).then(setResolvedHeader).catch(() => setResolvedHeader(null)); else setResolvedHeader(null); }, [headerImage]);
  if (cf[PS.HIDE_HEADER]) return null;
  const hasHeader = !!(headerImage && resolvedHeader);
  // Header text colour: the user's override wins; otherwise white over a
  // header image (for contrast), else the group's name colour.
  const nameColor = headerTextColor || (hasHeader ? undefined : groupNameColor(group.color));
  const memberCount = members.length;
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(cf), ...(headerTextColor ? { color: headerTextColor } : {}), ...(headerBgColor ? { backgroundColor: headerBgColor } : {}) }}>
      {hasHeader && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${resolvedHeader}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: headerOpacity }} />
      )}
      <div className={`relative z-10 flex gap-4 items-start ${hasHeader || headerBgColor ? "p-4" : ""}`} style={headerFont ? { fontFamily: headerFont } : undefined}>
        <GroupAvatar url={group.avatar_url} color={group.color} emoji={group.emoji} />
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2" style={{ color: nameColor }}>
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
          <p className="text-xs text-muted-foreground">{memberCount} {memberCount === 1 ? t.alter : t.alters}</p>
        </div>
      </div>
    </div>
  );
}

export function GroupBioSection({ group }) {
  return group.description ? (
    <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
      <SimplePreview blocks={htmlToBlocks(group.description)} onBlockChange={() => {}} readOnly scopeId={group?.id} />
    </div>
  ) : (
    <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
      No description yet. Tap <strong>Edit</strong> to add one.
    </div>
  );
}

export function GroupNestedSection({ group }) {
  const navigate = useNavigate();
  const { childGroups } = useGroupContext(group);
  if (childGroups.length === 0) return null;
  return (
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
  );
}

export function GroupMembersSection({ group }) {
  const navigate = useNavigate();
  const t = useTerms();
  const subTerm = useSubTerm();
  const { allGroups, alters, activeSessions, members } = useGroupContext(group);
  const [showMembers, setShowMembers] = useState(false);
  // When a member owns MORE THAN ONE subsystem, tapping their subsystem icon
  // opens this chooser instead of jumping to an arbitrary one.
  const [subPicker, setSubPicker] = useState(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p data-pf-chrome-label className="inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t.Alters}{members.length ? ` (${members.length})` : ""}
        </p>
        <button type="button" onClick={() => setShowMembers(true)} className="text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> Manage
        </button>
      </div>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">No {t.alters} yet. Tap Manage to add some.</p>
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
                        title={ownedSubs.length === 1 ? `Open ${ownedSubs[0].name}` : `${ownedSubs.length} ${subTerm}s`}
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
      {showMembers && (
        <GroupMembersModal group={group} allGroups={allGroups} isOpen={showMembers} onClose={() => setShowMembers(false)} />
      )}
      {/* Multi-subsystem chooser — when a member owns more than one subsystem. */}
      {subPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSubPicker(null)}>
          <div className="bg-card border border-border rounded-2xl w-full sm:max-w-xs p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">{subPicker.alter.name}'s {subTerm}s</p>
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
  );
}

// ── The other pages ──────────────────────────────────────────────────

// The group's bulletin board.
export function GroupBoardSection({ group }) {
  const { alters, frontingAlterIds } = useGroupContext(group);
  return (
    <BulletinBoard
      alters={alters.filter((a) => !a.is_archived)}
      currentAlterId={frontingAlterIds[0] || null}
      frontingAlterIds={frontingAlterIds}
      groupId={group.id}
    />
  );
}

// The group's slice of the journals: entries authored or co-authored by
// any member.
export function GroupJournalSection({ group }) {
  const { members } = useGroupContext(group);
  return <ProfileJournalTab alterIds={members.map((m) => m.id)} />;
}

// Per-group notes — a private notebook for this group/subsystem, separate
// from its bulletin board.
export function GroupNotesTab({ groupId }) {
  const qc = useQueryClient();
  const t = useTerms();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: notes = [] } = useQuery({
    queryKey: groupNotesKey(groupId),
    queryFn: () => listGroupNotes(groupId),
  });
  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      // Notes render as plain text here, so ~commands become "icon label" tokens.
      const row = await saveGroupNote({ groupId, text, alters, terms: t, chips: false });
      if (row === null) return; // backed out of the whisper warning
      setText("");
      qc.invalidateQueries({ queryKey: groupNotesKey(groupId) });
    } catch (e) { toast.error(isLogCommandError(e) ? e.message : (e?.message || "Couldn't save note")); }
    finally { setSaving(false); }
  };
  const del = async (id) => {
    if (!(await confirm("Delete this note?"))) return;
    try { await deleteGroupNote(id); qc.invalidateQueries({ queryKey: groupNotesKey(groupId) }); } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-card p-2 space-y-2">
        <MentionTextarea value={text} onChange={setText} alters={alters} signposts placeholder="Add a note for this group…" className="min-h-[70px] text-sm resize-none" />
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

export const GroupNotesSection = ({ group }) => <GroupNotesTab groupId={group.id} />;

// Unused import guard: User is used by MemberAvatar in the page's edit mode
// only; keep the export here so nothing imports from the page.
export function MemberAvatar({ alter, size = "w-9 h-9", rounded = "rounded-lg" }) {
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
