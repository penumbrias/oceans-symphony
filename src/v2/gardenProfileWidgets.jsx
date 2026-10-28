// The garden's profile widgets, part 2 (v0.301.0): Identity, Belongs to,
// Tags, Preferences and Get to know me.
//
// Purpose-built for a board, not copies of the classic Profile tab's
// sections (those stay as profile_header, profile_groups… so a classic
// layout keeps looking exactly as it did). Each one:
//   • shows part of the alter's info and never owns data — its Content tab
//     edits the info through the same sections as Alter info;
//   • has Minimal / Normal / Expanded where that means something;
//   • has ONE box (flush until the person gives it a look), em text sizes,
//     labelled controls and 44px targets;
//   • renders nothing on the page when there's nothing to show, and names
//     itself while the layout is being edited.

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { User, Archive, Users, Tag, HeartHandshake, Sparkles, IdCard } from "lucide-react";
import { boxStyle } from "@/v2/primitives";
import { useTerms } from "@/lib/useTerms";
import { useInfoAlter, EditableValue } from "@/v2/infoWidgets";
import { infoEditorField } from "@/components/v2/profileInfoEditors";
import { useAlterGroups, presetAnswerRowsOf } from "@/components/alters/profile/ProfileSections";
import GroupIcon from "@/components/shared/GroupIcon";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { parsePreferences, PREF_LEVELS, PREF_CATEGORIES } from "@/lib/alterPreferences";
import { PrefLevelIcon } from "@/components/alters/AlterPreferencesEditor";
import { indexGroups, ancestorIds } from "@/lib/groupTree";
import { firstAppearanceOf } from "@/lib/alterEntry";
import { BASIC_ENTRIES } from "@/lib/alterInfoEntries";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";

const flush = () => boxStyle({ borderFallback: false, padFallback: false });

// The one box. With nothing to show it's empty on the page and names
// itself while the layout is edited (.pf-widget-empty, index.css).
function GardenBox({ empty, name, children, ...rest }) {
  return (
    <section className="h-full min-h-0 overflow-y-auto text-[0.875em] leading-relaxed" style={flush()} {...rest}>
      {empty ? (
        <div className="pf-widget-empty h-full items-center justify-center rounded-xl border border-dashed border-current opacity-50 text-[0.8125em] px-3 text-center" aria-hidden="true">
          {name} — nothing to show yet
        </div>
      ) : children}
    </section>
  );
}

const Heading = ({ children }) => (
  <h3 className="text-[0.75em] font-semibold uppercase tracking-wide opacity-70 mb-1">{children}</h3>
);

// A chip in the person's accent, or in a record's own colour.
function chipStyle(color) {
  return color
    ? { borderColor: `${color}66`, backgroundColor: `${color}1f` }
    : { borderColor: "color-mix(in srgb, var(--v2-accent) 40%, transparent)", backgroundColor: "color-mix(in srgb, var(--v2-accent) 10%, transparent)" };
}
const chipCls = "inline-flex items-center gap-1 px-[0.7em] min-h-[2em] rounded-full text-[0.8125em] border max-w-full";

const basic = (key) => BASIC_ENTRIES.find((b) => b.key === key);

// ── Identity ─────────────────────────────────────────────────────────

const AVATAR_RADIUS = { circle: "9999px", rounded: "22%", square: "6%" };

export function IdentityWidget({ settings, mode = "normal" }) {
  const { alter } = useInfoAlter(settings);
  const rotating = useRotatingImageUrl({ alterId: alter?.id, role: "avatar", mode: alter?.avatar_rotation_mode, fallbackUrl: alter?.avatar_url, alter });
  const avatar = useResolvedAvatarUrl(rotating);
  if (!alter) return null;
  const minimal = mode === "minimal";
  const expanded = mode === "expanded";
  const center = settings?.align === "center";
  const size = Math.max(32, Math.min(200, Number(settings?.avatarSize) || 88));
  const showAvatar = settings?.showAvatar !== false;
  const editable = settings?.editInPlace !== false;
  const line = (key, cls) => {
    const value = key === "birthday" ? firstAppearanceOf(alter).birthday : alter[key];
    if (!value) return null;
    return (
      <div className={cls}>
        <EditableValue alter={alter} entry={{ ...basic(key), id: `basic:${key}` }} value={value} editable={editable}>
          {key === "birthday" ? <><span className="sr-only">First appearance: </span>{value}</> : value}
        </EditableValue>
      </div>
    );
  };
  return (
    <GardenBox data-identity-widget="" data-mode={mode}>
      <div className={`flex gap-[0.9em] ${center ? "flex-col items-center text-center" : "items-start"}`}>
        {showAvatar && (
          <div className="overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ width: size, height: size, borderRadius: AVATAR_RADIUS[settings?.avatarShape] || AVATAR_RADIUS.rounded, backgroundColor: alter.color || "color-mix(in srgb, var(--v2-accent) 20%, transparent)" }}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-1/2 h-1/2 opacity-70" aria-hidden="true" />}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-[0.15em]">
          <h2 className="font-display text-[1.5em] font-semibold leading-tight break-words">
            {alter.emoji ? <span className="mr-[0.3em]" aria-hidden="true">{alter.emoji}</span> : null}
            <EditableValue inline alter={alter} entry={{ ...basic("name"), id: "basic:name" }} value={alter.name} editable={editable}>{alter.name}</EditableValue>
          </h2>
          {alter.is_archived && (
            <span className="inline-flex items-center gap-1 text-[0.75em] font-semibold uppercase tracking-wide opacity-80">
              <Archive className="w-[1em] h-[1em]" aria-hidden="true" /> Archived
            </span>
          )}
          {!minimal && line("alias", "opacity-80")}
          {!minimal && line("pronouns", "opacity-80")}
          {!minimal && alter.role && (
            <div>
              <EditableValue alter={alter} entry={{ ...basic("role"), id: "basic:role" }} value={alter.role} editable={editable}>
                <span className={chipCls} style={chipStyle(alter.color)}>{alter.role}</span>
              </EditableValue>
            </div>
          )}
          {expanded && line("birthday", "text-[0.875em] opacity-70")}
        </div>
      </div>
    </GardenBox>
  );
}

// ── Belongs to ───────────────────────────────────────────────────────

function GroupChip({ group, path, showIcon }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/group/${group.id}`)} className={`${chipCls} min-h-[2.75em] hover:brightness-110`}
      style={chipStyle(group.color)} aria-label={`Open ${[...path, group.name].join(", inside ")}`}>
      {showIcon && <GroupIcon group={group} className="w-[1.1em] h-[1.1em] flex-shrink-0" />}
      {path.length > 0 && <span className="opacity-60 truncate">{path.join(" › ")} ›</span>}
      <span className="truncate">{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
    </button>
  );
}

export function BelongsToWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const { alter } = useInfoAlter(settings);
  const { allGroups, resolvedGroups, ownedSubsystems } = useAlterGroups(alter);
  const byId = useMemo(() => indexGroups(allGroups), [allGroups]);
  if (!alter) return null;
  const show = settings?.show || "both";
  const groups = show === "subsystems" ? [] : resolvedGroups;
  const subs = show === "groups" ? [] : ownedSubsystems;
  const expanded = mode === "expanded";
  const pathOf = (g) => (expanded ? ancestorIds(g, byId).map((id) => byId[id]?.name).filter(Boolean).reverse() : []);
  const list = (items) => (
    <div className={`flex gap-[0.4em] ${expanded ? "flex-col items-start" : "flex-wrap"}`}>
      {items.map((g) => <GroupChip key={g.id} group={g} path={pathOf(g)} showIcon={mode !== "minimal"} />)}
    </div>
  );
  const both = groups.length > 0 && subs.length > 0;
  return (
    <GardenBox empty={!groups.length && !subs.length} name="Belongs to" data-belongs-widget="">
      <div className="space-y-[0.6em]">
        {groups.length > 0 && <div>{(both || expanded) && <Heading>Groups</Heading>}{list(groups)}</div>}
        {subs.length > 0 && <div>{(both || expanded) && <Heading>{`Sub${t.system}s`}</Heading>}{list(subs)}</div>}
      </div>
    </GardenBox>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────

export function TagsWidget({ settings }) {
  const { alter } = useInfoAlter(settings);
  if (!alter) return null;
  const tags = Array.isArray(alter.tags) ? alter.tags.filter((x) => typeof x === "string" && x.trim()) : [];
  return (
    <GardenBox empty={!tags.length} name="Tags" data-tags-widget="">
      <ul className="flex flex-wrap gap-[0.4em]" aria-label="Tags">
        {tags.map((tag) => <li key={tag} className={chipCls} style={chipStyle(null)}>{tag}</li>)}
      </ul>
    </GardenBox>
  );
}

// ── Preferences & boundaries ─────────────────────────────────────────

const LEVEL_ORDER = [5, 4, 3, 2, 1];

function PrefChip({ pref }) {
  const level = PREF_LEVELS[pref.level] || PREF_LEVELS[3];
  return (
    <li className={chipCls} style={chipStyle(level.color)}>
      <PrefLevelIcon level={pref.level} className="w-[1em] h-[1em]" filled />
      <span className="sr-only">{level.label}: </span>
      <span>{pref.label}</span>
    </li>
  );
}

export function PreferencesWidget({ settings, mode = "normal" }) {
  const { alter } = useInfoAlter(settings);
  if (!alter) return null;
  const levels = Array.isArray(settings?.levels) && settings.levels.length ? settings.levels.map(Number) : LEVEL_ORDER;
  const prefs = parsePreferences(alter).filter((p) => levels.includes(p.level)).sort((a, b) => b.level - a.level);
  const chips = (rows) => <ul className="flex flex-wrap gap-[0.4em]">{rows.map((p) => <PrefChip key={p.id} pref={p} />)}</ul>;
  let body;
  if (mode === "minimal") body = chips(prefs);
  else if (mode === "expanded") {
    // By comfort level: what they love first, boundaries last.
    body = LEVEL_ORDER.filter((l) => levels.includes(l)).map((l) => {
      const rows = prefs.filter((p) => p.level === l);
      return rows.length ? <div key={l}><Heading>{PREF_LEVELS[l].label}</Heading>{chips(rows)}</div> : null;
    });
  } else {
    body = PREF_CATEGORIES.map((c) => {
      const rows = prefs.filter((p) => p.category === c.id);
      return rows.length ? <div key={c.id}><Heading>{c.label}</Heading>{chips(rows)}</div> : null;
    });
  }
  return (
    <GardenBox empty={!prefs.length} name="Preferences" data-preferences-widget="">
      <div className="space-y-[0.6em]">{body}</div>
    </GardenBox>
  );
}

// ── Get to know me ───────────────────────────────────────────────────

export function AnswersWidget({ settings, mode = "normal" }) {
  const { alter } = useInfoAlter(settings);
  if (!alter) return null;
  const wanted = Array.isArray(settings?.questions) && settings.questions.length ? settings.questions : null;
  const rows = presetAnswerRowsOf(alter).filter((r) => !wanted || wanted.includes(r.key));
  const chips = (values) => <ul className="flex flex-wrap gap-[0.4em]">{values.map((v) => <li key={v} className={chipCls} style={chipStyle(null)}>{v}</li>)}</ul>;
  return (
    <GardenBox empty={!rows.length} name="Get to know me" data-answers-widget="">
      {mode === "minimal" ? chips([...new Set(rows.flatMap((r) => r.values))]) : (
        <div className="space-y-[0.6em]">
          {rows.map((r) => <div key={r.key}><Heading>{r.label}</Heading>{chips(r.values)}</div>)}
        </div>
      )}
    </GardenBox>
  );
}

// ── Registry entries ─────────────────────────────────────────────────

const MODES = ["minimal", "normal", "expanded"];
const base = { category: "profile", subjects: ["alter"], supportsMultiInstance: true, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 40 } };

export const GARDEN_ALTER_WIDGETS = {
  alter_identity: {
    ...base, label: "Identity", icon: IdCard,
    description: "The {{alter}}'s picture and name; Normal adds alias, pronouns and role, Expanded their first appearance. Tap any of it to edit.",
    render: ({ settings, mode }) => <IdentityWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      infoEditorField("basics"),
      { key: "showAvatar", type: "toggle", label: "Show the picture", default: true },
      { key: "avatarShape", type: "select", label: "Picture shape", default: "rounded",
        options: [{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
      { key: "avatarSize", type: "number", label: "Picture size", min: 32, max: 200, default: 88, unit: "px" },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Beside" }, { value: "center", label: "Centred" }] },
      { key: "editInPlace", type: "toggle", label: "Tap the text to edit it", default: true },
    ],
  },
  alter_belongs: {
    ...base, label: "Belongs to", icon: Users,
    description: "The groups and sub{{system}}s this {{alter}} is in, as chips; Expanded shows where each group sits.",
    render: ({ settings, mode }) => <BelongsToWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 1 },
    configFields: [
      { key: "show", type: "select", label: "Shows", default: "both",
        options: [{ value: "both", label: "Both" }, { value: "groups", label: "Groups" }, { value: "subsystems", label: "Sub{{system}}s" }] },
      infoEditorField("belongs"),
    ],
  },
  alter_tags: {
    ...base, label: "Tags", icon: Tag,
    description: "This {{alter}}'s tags, as chips.",
    render: ({ settings }) => <TagsWidget settings={settings} />,
    supportsModes: ["normal"], defaultSpan: { cols: 12, rows: 1 },
    configFields: [infoEditorField("tags")],
  },
  alter_preferences: {
    ...base, label: "Preferences", icon: HeartHandshake,
    description: "Names, pronouns and terms with how the {{alter}} feels about them. Minimal is one row of chips, Normal groups them by kind, Expanded by comfort level.",
    render: ({ settings, mode }) => <PreferencesWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "levels", type: "multi", label: "Comfort levels shown", default: [],
        options: LEVEL_ORDER.map((l) => ({ value: l, label: PREF_LEVELS[l].label })) },
      infoEditorField("preferences"),
    ],
  },
  alter_answers: {
    ...base, label: "Get to know me", icon: Sparkles,
    description: "What this {{alter}} answered in Get to know me. Minimal shows just the answers, Normal groups them by question.",
    render: ({ settings, mode }) => <AnswersWidget settings={settings} mode={mode} />,
    supportsModes: ["minimal", "normal"], defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "questions", type: "multi", label: "Questions shown", default: [],
        options: Object.entries(PRESET_ANSWER_LABELS).map(([value, label]) => ({ value, label })) },
      infoEditorField("answers"),
    ],
  },
};
