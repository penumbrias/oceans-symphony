// The sections of an alter's Profile page, each on its own (v0.290.0).
//
// These used to be one block of JSX inside ProfileTab's view mode. They
// are the same markup, split so that each section can be a widget on the
// alter's profile board (src/v2/profileWidgets.jsx) AND still stack in
// ProfileTab's classic view in the same order. One copy of each section,
// two places that show it — never fork these.
//
// Every section takes the live `alter` record (and `systemFields` where it
// reads custom fields) and resolves what it needs itself, so a widget can
// mount any one of them alone.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { User, Archive, ArchiveRestore, Folder, X } from "lucide-react";
import { getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import GroupIcon from "@/components/shared/GroupIcon";
import { parsePreferences } from "@/lib/alterPreferences";
import { PreferencesDisplay } from "@/components/alters/AlterPreferencesEditor";
import { colorWithAlpha, readProfileBg, headerThemeStyleVars, PS } from "@/lib/profileStyle";
import { patchAlterCustomFields } from "@/lib/alterEntry";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { useTerms } from "@/lib/useTerms";
import { useCustomFieldsLayout, fieldLayoutClasses, FIELD_LAYOUTS } from "@/lib/customFieldsLayout";
import { needsHalo, getPageBackground, adjustForContrast } from "@/lib/contrast";
import { fontStackFor } from "@/lib/profileFonts";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";
import MarkdownText from "@/components/shared/MarkdownText";


export function getContrastColor(hex) {
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

// The "header extras" flags: when on, that information renders in the
// header and is MOVED out of the body (never duplicated).
export function headerExtras(alter) {
  const cf = alter?.custom_fields || {};
  return {
    groups: !!cf[PS.HEADER_SHOW_GROUPS],
    subsystems: !!cf[PS.HEADER_SHOW_SUBSYSTEMS],
    fields: !!cf[PS.HEADER_SHOW_FIELDS],
    alterFields: !!cf[PS.HEADER_SHOW_ALTER_FIELDS],
    pronouns: !!cf[PS.HEADER_SHOW_PRONOUNS],
    chipMode: cf[PS.HEADER_CHIP_MODE] || "both",
  };
}

// The card background the sections share. With a background image + colour
// the cards use that colour at the section opacity, matching the page's
// other surfaces; otherwise the readability tint uses the theme surface.
export function profileSectionCardStyle(alter) {
  const cf = alter?.custom_fields || {};
  const bgColor = cf[PS.BG_COLOR] || "";
  const bgImage = cf[PS.BG_IMAGE] || "";
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  const opacity = parseFloat(cf[PS.READABILITY] ?? 0.9);
  const hasSectionBg = opacity > 0 && (bgColor || bgImage || headerImage);
  if (bgImage && bgColor) return { backgroundColor: colorWithAlpha(bgColor, opacity) };
  if (hasSectionBg) return { backgroundColor: `rgba(var(--color-surface-rgb), ${opacity})` };
  return {};
}

// The alter's group chips, resolved against the LIVE groups list. The
// stored entries are embedded { id, name, color } copies, which go stale on
// rename/recolour and outlive a deleted group entirely. Dangling entries
// are dropped only once the groups query has actually loaded.
export function useAlterGroups(alter) {
  const { data: allGroups = [], isSuccess: groupsLoaded } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const resolvedGroups = React.useMemo(() => {
    const entries = alter?.groups || [];
    if (!groupsLoaded) return entries;
    return entries
      .map((g) => allGroups.find((x) => x.id === g?.id || (g?.id && x.sp_id === g.id) || (g?.sp_id && x.id === g.sp_id)) || null)
      .filter(Boolean);
  }, [alter?.groups, allGroups, groupsLoaded]);
  const alterId = alter?.id;
  const ownedSubsystems = React.useMemo(() => (alterId ? getSubsystemsOwnedBy(allGroups, alterId) : []), [allGroups, alterId]);
  return { allGroups, groupsLoaded, resolvedGroups, ownedSubsystems };
}

const chromeLabel = "inline-block text-xs font-medium text-muted-foreground uppercase tracking-wider";

// ── Header: avatar, name, alias, pronouns, birthday, role, header extras ──
export function ProfileHeaderSection({ alter, systemFields = [] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { resolvedGroups, ownedSubsystems } = useAlterGroups(alter);
  const cf = alter.custom_fields || {};
  const headerText = cf[PS.HEADER_TEXT] || null;
  const headerBgColor = readProfileBg(cf).headerBgColorWithAlpha || cf[PS.HEADER_BG] || "";
  const hideHeader = !!cf[PS.HIDE_HEADER];
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  const headerFont = fontStackFor(cf[PS.HEADER_FONT]);
  const headerOpacity = cf[PS.HEADER_OPACITY] !== undefined ? parseFloat(cf[PS.HEADER_OPACITY]) : 0.45;
  const bgColor = cf[PS.BG_COLOR] || "";
  const bgImage = cf[PS.BG_IMAGE] || "";
  const hasBg = bgColor || bgImage;
  const extras = headerExtras(alter);
  const alterTextContrast = alter.color ? getContrastColor(alter.color) : null;

  // The avatar may rotate through a per-alter pool; resolve through the
  // hook (local-image:// can't be fed to <img src> raw).
  const rotatingAvatarUrl = useRotatingImageUrl({ alterId: alter.id, role: "avatar", mode: alter.avatar_rotation_mode, fallbackUrl: alter.avatar_url, alter });
  const avatar = useResolvedAvatarUrl(rotatingAvatarUrl);
  const [resolvedHeaderImage, setResolvedHeaderImage] = useState("");
  useEffect(() => {
    if (!headerImage) { setResolvedHeaderImage(""); return; }
    resolveImageUrl(headerImage).then((r) => setResolvedHeaderImage(r || "")).catch(() => setResolvedHeaderImage(""));
  }, [headerImage]);

  const handleArchive = async () => {
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
      toast.success(alter.is_archived ? "Unarchived!" : "Archived!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    } finally { setSaving(false); }
  };

  if (hideHeader) return null;

  const rolePill = alter.role ? (() => {
    // Soft tint pill is the default look. When the alter's color is too
    // close to the rendered header backdrop, fall back to a solid pill so
    // the role stays readable. WCAG AA-large = 3:1.
    const pillColor = headerText || alter.color;
    const lowContrast = !headerText && pillColor && bgColor && contrastRatio(pillColor, bgColor) < 3;
    // Over a user-uploaded header image the role sits on arbitrary pixels;
    // a soft outline is always worth it there.
    const textShadow = headerImage ? "0 0 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.85)" : undefined;
    if (lowContrast) {
      return (
        <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-1"
          style={{ backgroundColor: pillColor, color: getContrastColor(pillColor), textShadow }}>
          {alter.role}
        </span>
      );
    }
    return (
      <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-1"
        style={{
          backgroundColor: headerText ? `${headerText}20` : (alter.color ? `${alter.color}20` : "hsl(var(--muted))"),
          color: headerText || alter.color || "hsl(var(--muted-foreground))",
          textShadow,
        }}>
        {alter.role}
      </span>
    );
  })() : null;

  const extrasRow = (() => {
    if (!extras.groups && !extras.subsystems && !extras.fields && !extras.alterFields) return null;
    const hgroups = extras.groups ? resolvedGroups : [];
    const hsubs = extras.subsystems ? ownedSubsystems : [];
    const fieldChips = [];
    if (extras.fields) {
      for (const f of systemFields) {
        const v = cf[f.id];
        if (f.is_visible !== false && v && v !== "false") {
          fieldChips.push({ label: f.name, value: f.field_type === "boolean" ? "Yes" : String(v) });
        }
      }
    }
    if (extras.alterFields && Array.isArray(alter.alter_custom_fields)) {
      for (const f of alter.alter_custom_fields) if (f?.value) fieldChips.push({ label: f.name, value: String(f.value) });
    }
    if (!hgroups.length && !hsubs.length && !fieldChips.length) return null;
    const chipStyle = (c) => ({
      backgroundColor: headerText ? `${headerText}18` : (c ? `${c}20` : "hsl(var(--muted))"),
      borderColor: headerText ? `${headerText}40` : (c ? `${c}55` : "hsl(var(--border))"),
      color: headerText || c || "hsl(var(--foreground))",
    });
    const linkChip = (g, key) => (
      <button key={key} type="button" onClick={() => navigate(`/group/${g.id}`)} title={`Open ${g.name}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:brightness-110 transition max-w-full"
        style={chipStyle(g.color)}>
        {extras.chipMode !== "name" && <GroupIcon group={g} className="w-3.5 h-3.5 flex-shrink-0" />}
        {extras.chipMode !== "icon" && <span className="truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>}
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
  })();

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ ...headerThemeStyleVars(cf), ...(headerBgColor ? { backgroundColor: headerBgColor } : {}) }}>
      {headerImage && resolvedHeaderImage && (
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `url("${resolvedHeaderImage}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: headerOpacity,
        }} />
      )}
      {bgImage?.startsWith("data:") && (
        <div className="absolute top-2 right-2 z-10">
          <LocalImageFixer
            value={bgImage}
            maxWidth={1200}
            quality={0.8}
            label="⚠️ Fix background"
            onFixed={async (url) => {
              await patchAlterCustomFields(alter.id, { [PS.BG_IMAGE]: url });
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            }}
          />
        </div>
      )}
      <div className={`relative z-10 flex gap-4 items-start ${hasBg || headerImage ? "p-4" : ""}`}>
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
            {avatar
              ? <img src={avatar} alt={alter.name} className="w-full h-full object-cover" />
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
        <div className="flex-1 min-w-0 space-y-1" style={headerFont ? { fontFamily: headerFont } : undefined}>
          <h2 className="font-display text-2xl font-semibold" style={{ color: headerText || undefined }}>
            {alter.emoji ? <span className="mr-1.5">{alter.emoji}</span> : null}{alter.name}
          </h2>
          {/* Archived tag — archived alters are hidden from most lists, so
              without this it wasn't possible to tell you were looking at an
              archived (often duplicate-import) profile. Restore is one tap. */}
          {alter.is_archived && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Archive className="w-3 h-3" /> Archived
              </span>
              <button type="button" onClick={handleArchive} disabled={saving}
                className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-primary hover:text-primary/80 disabled:opacity-50">
                <ArchiveRestore className="w-3 h-3" /> Restore
              </button>
            </div>
          )}
          {alter.alias && !(alter.name || "").toLowerCase().includes(alter.alias.toLowerCase()) && (
            <p className="text-sm" style={{ color: headerText ? `${headerText}cc` : "hsl(var(--muted-foreground))" }}>aka {alter.alias}</p>
          )}
          {alter.pronouns && (extras.pronouns || !(alter.name || "").toLowerCase().includes(alter.pronouns.toLowerCase())) && (
            <p className="text-sm" style={{ color: headerText ? `${headerText}cc` : "hsl(var(--muted-foreground))" }}>{alter.pronouns}</p>
          )}
          {alter.birthday && <p className="text-xs" style={{ color: headerText ? `${headerText}99` : "hsl(var(--muted-foreground))" }}>🎂 {alter.birthday}</p>}
          {rolePill}
          {extrasRow}
        </div>
      </div>
    </div>
  );
}

// ── Preferences & boundaries — pronouns.cc-style comfort chips ──
export function ProfilePreferencesSection({ alter }) {
  const prefs = parsePreferences(alter);
  if (prefs.length === 0) return null;
  return (
    <div className="bg-muted/20 rounded-xl p-4 border border-border/40" style={profileSectionCardStyle(alter)}>
      <PreferencesDisplay preferences={prefs} />
    </div>
  );
}

// ── Bio ──
export function ProfileBioSection({ alter, emptyHint = true }) {
  if (!alter.description) {
    if (!emptyHint) return null;
    return (
      <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
        No bio yet. Add one with the pencil, or in this widget's options.
      </div>
    );
  }
  const blocks = htmlToBlocks(alter.description);
  // If all blocks are raw/text whose content looks like encoded data, the
  // bio is corrupted — say so instead of printing markup.
  const looksCorrupted = blocks.length > 0 && blocks.every((b) =>
    (b.type === "raw" || b.type === "text") &&
    (b.content?.includes("data-blocks=") || b.content?.match(/^%5B|^blocks=/)));
  if (looksCorrupted) {
    return (
      <div className="bg-muted/20 rounded-xl p-4 border border-border/40 text-center">
        <p className="text-sm text-muted-foreground italic">Bio display issue — re-save the bio from the pencil and it will display correctly.</p>
      </div>
    );
  }
  return (
    <div className="bg-muted/20 rounded-xl p-4 border border-border/40" style={profileSectionCardStyle(alter)}>
      <SimplePreview blocks={blocks} onBlockChange={() => {}} readOnly={true} scopeId={alter?.id} />
    </div>
  );
}

// ── Groups (chips) — hidden here when shown in the header ──
export function ProfileGroupsSection({ alter }) {
  const navigate = useNavigate();
  const { resolvedGroups } = useAlterGroups(alter);
  if (resolvedGroups.length === 0 || headerExtras(alter).groups) return null;
  // When a group's colour is very close to the page bg, the tinted fill and
  // border vanish — add a subtle contrast ring, keeping the colour itself.
  const pageBg = getPageBackground();
  return (
    <div>
      <p data-pf-chrome-label className={`${chromeLabel} mb-2`}>Groups</p>
      <div className="flex flex-wrap gap-1.5">
        {resolvedGroups.map((g) => {
          const halo = g.color && needsHalo(g.color, pageBg);
          const fillColor = halo ? adjustForContrast(g.color, pageBg) : g.color;
          return (
            <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)} title={`Open ${g.name}`}
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
}

// ── Subsystems this alter owns — hidden here when shown in the header ──
export function ProfileSubsystemsSection({ alter }) {
  const navigate = useNavigate();
  const t = useTerms();
  const { ownedSubsystems } = useAlterGroups(alter);
  if (ownedSubsystems.length === 0 || headerExtras(alter).subsystems) return null;
  const subsystemTerm = `sub${t.system}`;
  return (
    <div>
      <p data-pf-chrome-label className={`${chromeLabel} mb-2`}>
        {alter.name}'s {subsystemTerm}{ownedSubsystems.length === 1 ? "" : "s"}
      </p>
      <div className="space-y-1.5">
        {ownedSubsystems.map((g) => (
          <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
            style={{ borderLeftColor: g.color || "transparent", borderLeftWidth: g.color ? 3 : 1 }}>
            <Folder className="w-4 h-4 flex-shrink-0" style={{ color: g.color || "hsl(var(--muted-foreground))" }} />
            <span className="text-sm flex-1 truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Preset answers (energy / body-or-head / role-lean / dominant feeling)
// from Get to know me, as the person's literal answers.
export function presetAnswerRowsOf(alter) {
  const raw = (alter?.preset_answers && typeof alter.preset_answers === "object" && !Array.isArray(alter.preset_answers))
    ? alter.preset_answers : null;
  if (!raw) return [];
  return Object.entries(raw)
    .map(([key, v]) => ({
      key,
      label: PRESET_ANSWER_LABELS[key] || key.replace(/_/g, " "),
      values: typeof v === "string" ? v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : [],
    }))
    .filter((row) => row.values.length > 0);
}

// ── "From Get to know me" ──
export function ProfileAnswersSection({ alter }) {
  const queryClient = useQueryClient();
  const rows = presetAnswerRowsOf(alter);
  if (rows.length === 0) return null;
  const removeValue = async (questionKey, valueToRemove) => {
    const raw = alter.preset_answers || {};
    const prev = typeof raw[questionKey] === "string" ? raw[questionKey] : "";
    const next = prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).filter((v) => v !== valueToRemove);
    const updated = { ...raw };
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
  return (
    <div>
      <p data-pf-chrome-label className={`${chromeLabel} mb-2`}>From Get to know me</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl border border-border/40 bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground mb-1.5">{row.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {row.values.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-foreground border border-border/40">
                  {v}
                  <button type="button" onClick={() => removeValue(row.key, v)} aria-label={`Remove ${v}`}
                    className="-mr-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tags (legacy — Get to know me no longer writes here) ──
export function ProfileTagsSection({ alter }) {
  const queryClient = useQueryClient();
  const tags = Array.isArray(alter.tags) ? alter.tags : [];
  if (tags.length === 0) return null;
  const write = async (next, done) => {
    try {
      await base44.entities.Alter.update(alter.id, { tags: next });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err?.message || "Couldn't update tags");
    }
  };
  const removeTag = (tag) => write(tags.filter((x) => x !== tag));
  const clearAll = async () => {
    if (!(await confirm(`Remove all ${tags.length} tag${tags.length === 1 ? "" : "s"} from ${alter.name || "this alter"}? This can't be undone.`))) return;
    write([], "Tags cleared");
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p data-pf-chrome-label className={chromeLabel}>
          Tags
          <span className="ml-2 text-[10px] font-normal italic normal-case tracking-normal text-muted-foreground/70">
            legacy — Get to know me no longer writes here
          </span>
        </p>
        <button type="button" onClick={clearAll} className="text-[10px] font-medium text-muted-foreground/70 hover:text-red-500 hover:underline">
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}
              className="-mr-1 p-0.5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Info: the filled custom fields, in this profile's own layout ──
export function ProfileFieldsSection({ alter, systemFields = [] }) {
  const queryClient = useQueryClient();
  // Custom-field layout (Settings → {Alter} setup → Custom fields): stacked
  // rows, side-by-side wrapping, or one sideways-scrolling line.
  const fieldLayout = useCustomFieldsLayout(alter);
  const fieldLayoutCls = fieldLayoutClasses(fieldLayout);
  const values = alter.custom_fields || {};
  const extras = headerExtras(alter);
  const perAlterOrder = values[PS.FIELD_ORDER] || null;
  const orderedFields = perAlterOrder
    ? [...systemFields].sort((a, b) => {
        const ai = perAlterOrder.indexOf(a.id);
        const bi = perAlterOrder.indexOf(b.id);
        return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
      })
    : systemFields;
  const visibleFilled = orderedFields.filter((f) => f.is_visible !== false && values[f.id]);
  // alter_custom_fields is either an array of ad-hoc { name, value } records
  // or an object map keyed by CustomField id (Get to know me / Help me
  // unblend writeback) — guard the object shape.
  // Parts of a bio that a profile conversion split out (from_bio) show where
  // the layout puts them, not here as well.
  const alterSpecific = Array.isArray(alter.alter_custom_fields) ? alter.alter_custom_fields.filter((f) => f.value && !f.from_bio) : [];
  // Fields shown in the header are MOVED there, not duplicated here.
  const bodyFilled = extras.fields ? [] : visibleFilled;
  const bodyAdhoc = extras.alterFields ? [] : alterSpecific;
  if (bodyFilled.length === 0 && bodyAdhoc.length === 0) return null;
  const sectionCardStyle = profileSectionCardStyle(alter);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p data-pf-chrome-label className={chromeLabel}>Info</p>
        {/* Per-PROFILE layout: one tap cycles stacked → side by side → one line. */}
        <button type="button"
          onClick={async () => {
            const ids = FIELD_LAYOUTS.map((l) => l.id);
            const next = ids[(ids.indexOf(fieldLayout) + 1) % ids.length];
            try {
              await base44.entities.Alter.update(alter.id, { custom_fields_layout: next });
              queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            } catch { /* non-fatal */ }
          }}
          className="text-[0.6875rem] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground"
          title="How this profile lays out its fields — tap to change">
          {FIELD_LAYOUTS.find((l) => l.id === fieldLayout)?.label || "Stacked"}
        </button>
      </div>
      <div className={`rounded-xl border border-border/40 bg-muted/10 ${fieldLayout === "stacked" ? "overflow-hidden" : `${fieldLayoutCls.container} p-2`}`} style={sectionCardStyle}>
        {bodyFilled.map((field, i) => (
          <div key={field.id} className={fieldLayout === "stacked"
            ? `flex gap-3 px-3 py-2.5 ${i < bodyFilled.length + bodyAdhoc.length - 1 ? "border-b border-border/30" : ""}`
            : `${fieldLayoutCls.item} rounded-lg border border-border/30 bg-background/40 px-2.5 py-2`}>
            <span className={`text-xs text-muted-foreground leading-relaxed ${fieldLayout === "stacked" ? "w-32 flex-shrink-0 pt-0.5" : "block mb-0.5 truncate"}`}>{field.name}</span>
            <div className="text-xs text-foreground flex-1 leading-relaxed break-words min-w-0">
              {field.field_type === "boolean"
                ? (values[field.id] === "true" ? "Yes" : "No")
                : field.field_type === "list" && typeof values[field.id] === "string"
                  ? (
                    <span className="inline-flex flex-wrap gap-1">
                      {values[field.id].split(/[,;|]/).map((s) => s.trim()).filter(Boolean).map((item, j) => (
                        <span key={`${item}-${j}`} className="text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{item}</span>
                      ))}
                    </span>
                  )
                  : (field.field_type === "text" || field.field_type === "richtext")
                    ? <MarkdownText>{String(values[field.id])}</MarkdownText>
                    : <span className="whitespace-pre-wrap break-words">{values[field.id]}</span>}
            </div>
          </div>
        ))}
        {bodyAdhoc.map((field, idx) => (
          <div key={idx} className={fieldLayout === "stacked"
            ? `flex gap-3 px-3 py-2.5 ${idx < bodyAdhoc.length - 1 ? "border-b border-border/30" : ""}`
            : `${fieldLayoutCls.item} rounded-lg border border-border/30 bg-background/40 px-2.5 py-2`}>
            <span className={`text-xs text-muted-foreground leading-relaxed ${fieldLayout === "stacked" ? "w-32 flex-shrink-0 pt-0.5" : "block mb-0.5 truncate"}`}>{field.name}</span>
            <div className="text-xs text-foreground flex-1 leading-relaxed break-words min-w-0">
              <MarkdownText>{String(field.value)}</MarkdownText>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The Profile page's sections, top to bottom — the order the seeded
// profile board uses too (profileBoard.js ALTER_PROFILE_PAGES).
export const PROFILE_SECTIONS = [
  ["profile_header", ProfileHeaderSection],
  ["profile_preferences", ProfilePreferencesSection],
  ["profile_bio", ProfileBioSection],
  ["profile_groups", ProfileGroupsSection],
  ["profile_subsystems", ProfileSubsystemsSection],
  ["profile_answers", ProfileAnswersSection],
  ["profile_tags", ProfileTagsSection],
  ["profile_fields", ProfileFieldsSection],
];
