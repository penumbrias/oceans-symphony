// The garden's profile widgets: Identity, Belongs to, Tags, Preferences and
// Get to know me (v0.301.0); Fronting stats, Fronting sessions and Notes
// (v0.302.0); Inbox and Board feed (v0.303.0).
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, Archive, Users, Tag, HeartHandshake, Sparkles, IdCard, BarChart3, History, FileText, Pencil, Trash2, Mail, Pin, Check, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { renderBulletinContent } from "@/lib/renderBulletinContent";
import { mentionPreview, mentionPreviewText } from "@/lib/whisperRedact";
import { inboxKey, refreshInbox, refreshBoard, sendInboxMessage, editInboxMessage, setInboxMessagePinned, setInboxMessageRead, postBoardMessage, deleteAlterMessage } from "@/lib/alterMessages";
import { useAlterBoardFeed, BOARD_KINDS, boardKindMatches, boardItemMatchesSearch } from "@/hooks/useAlterBoardFeed";
import { base44 } from "@/api/base44Client";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useAlterFrontSessions } from "@/hooks/useAlterFrontSessions";
import { parseSessionNote } from "@/lib/perAlterSessionEntries";
import SessionActionPopover from "@/components/fronting/SessionActionPopover";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { confirm } from "@/components/shared/ConfirmDialog";
import { isLogCommandError } from "@/lib/authoredText";
import { saveAlterNote, deleteAlterNote, alterNotesKey } from "@/lib/alterNotes";
import { boxStyle, valignBoxStyle } from "@/v2/primitives";
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
export function GardenBox({ empty, name, children, ...rest }) {
  return (
    <section className="h-full min-h-0 overflow-y-auto text-[0.875em] leading-relaxed" style={{ ...flush(), ...valignBoxStyle() }} {...rest}>
      {empty ? (
        <div className="pf-widget-empty h-full items-center justify-center rounded-xl border border-dashed border-current opacity-50 text-[0.8125em] px-3 text-center" aria-hidden="true">
          {name} — nothing to show yet
        </div>
      ) : <div className="min-w-0">{children}</div>}
    </section>
  );
}

export const Heading = ({ children }) => (
  <h3 className="text-[0.75em] font-semibold uppercase tracking-wide opacity-70 mb-1">{children}</h3>
);

// A chip in the person's accent, or in a record's own colour.
export function chipStyle(color) {
  return color
    ? { borderColor: `${color}66`, backgroundColor: `${color}1f` }
    : { borderColor: "color-mix(in srgb, var(--v2-accent) 40%, transparent)", backgroundColor: "color-mix(in srgb, var(--v2-accent) 10%, transparent)" };
}
export const chipCls = "inline-flex items-center gap-1 px-[0.7em] min-h-[2em] rounded-full text-[0.8125em] border max-w-full";

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


// ── Fronting stats ───────────────────────────────────────────────────

const DAY = 86400000;
export const RANGE_DAYS = { "7": 7, "30": 30, "90": 90, "365": 365 };

// "3 h 20 min", "2 d 4 h", "12 min".
export function formatSpan(ms) {
  const mins = Math.round(Math.max(0, ms) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return mins % 60 ? `${h} h ${mins % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const startOf = (s) => new Date(s.start_time).getTime();
const endOf = (s, now) => (s.end_time ? new Date(s.end_time).getTime() : (s.is_active ? now : startOf(s)));
const dayLabel = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeLabel = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function frontingStats(sessions, { days = 30, now = Date.now() } = {}) {
  const from = days ? now - days * DAY : -Infinity;
  let total = 0; let count = 0; let last = null; let live = false;
  for (const s of sessions) {
    const a = startOf(s); const b = endOf(s, now);
    if (!Number.isFinite(a) || b < from) continue;
    count += 1;
    total += Math.max(0, b - Math.max(a, from));
    if (!s.end_time && s.is_active) live = true;
    if (last === null || a > last) last = a;
  }
  return { total, count, average: count ? total / count : 0, last, live };
}

// Minutes in front per day for the last `days` days, oldest first.
export function dailyMinutes(sessions, { days = 30, now = Date.now() } = {}) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const first = today.getTime() - (days - 1) * DAY;
  const out = Array.from({ length: days }, () => 0);
  for (const s of sessions) {
    let a = Math.max(startOf(s), first); const b = Math.min(endOf(s, now), now);
    while (a < b) {
      const i = Math.floor((a - first) / DAY);
      const dayEnd = first + (i + 1) * DAY;
      if (i >= 0 && i < days) out[i] += (Math.min(b, dayEnd) - a) / 60000;
      a = dayEnd;
    }
  }
  return out;
}

export function Sparkline({ values, label }) {
  const max = Math.max(1, ...values);
  const w = 100; const h = 24; const bw = w / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[2.5em] block" role="img" aria-label={label}>
      {values.map((v, i) => (
        <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={h - Math.max(1, (v / max) * h)} height={Math.max(1, (v / max) * h)}
          rx={0.6} fill="var(--v2-accent)" opacity={v ? 0.85 : 0.15} />
      ))}
    </svg>
  );
}

export function FrontingStatsWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const { alter, alterId } = useInfoAlter(settings);
  const { sessions } = useAlterFrontSessions(alterId, { includeInherited: !!settings?.includeInherited });
  const days = RANGE_DAYS[settings?.range] ?? (settings?.range === "all" ? 0 : 30);
  const stats = useMemo(() => frontingStats(sessions, { days }), [sessions, days]);
  const spark = useMemo(() => (mode === "expanded" ? dailyMinutes(sessions, { days: 30 }) : []), [sessions, mode]);
  if (!alter) return null;
  const rangeText = days ? `in the last ${days} days` : "in total";
  const stat = (label, value) => (
    <div className="min-w-0">
      <dt className="text-[0.75em] uppercase tracking-wide opacity-70">{label}</dt>
      <dd className="text-[1.15em] font-semibold tabular-nums">{value}</dd>
    </div>
  );
  return (
    <GardenBox empty={!stats.count} name={`${t.Fronting} stats`} data-fronting-stats-widget="">
      {mode === "minimal" ? (
        <p><span className="text-[1.5em] font-semibold tabular-nums">{formatSpan(stats.total)}</span> <span className="opacity-70">{t.fronting} {rangeText}</span></p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-[1em] gap-y-[0.5em]">
            {stat(`Time ${t.fronting}`, formatSpan(stats.total))}
            {stat("Sessions", stats.count)}
            {stat("Average", formatSpan(stats.average))}
            {stat(`Last in ${t.front}`, stats.live ? "Now" : stats.last ? dayLabel(stats.last) : "—")}
          </dl>
          <p className="text-[0.75em] opacity-60 mt-[0.4em]">{days ? `Last ${days} days` : "All time"}</p>
          {mode === "expanded" && (
            <div className="mt-[0.6em]">
              <Heading>Last 30 days</Heading>
              <Sparkline values={spark} label={`Minutes ${t.fronting} each day for the last 30 days. Most in one day: ${formatSpan(Math.max(0, ...spark) * 60000)}.`} />
            </div>
          )}
        </>
      )}
    </GardenBox>
  );
}

// ── Fronting sessions ────────────────────────────────────────────────

export function FrontingSessionsWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { alter, alterId } = useInfoAlter(settings);
  const { sessions, recent } = useAlterFrontSessions(alterId, { includeInherited: !!settings?.includeInherited });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [shown, setShown] = useState(null);
  const [actionFor, setActionFor] = useState(null);
  if (!alter) return null;
  const now = Date.now();
  const step = Math.max(1, Number(settings?.count) || 5);
  const limit = mode === "minimal" ? 1 : (shown ?? step);
  const list = sessions.slice(0, limit);
  const byId = Object.fromEntries(alters.map((a) => [a.id, a]));
  const coFrontersOf = (s) => {
    const a = startOf(s); const b = endOf(s, now);
    const ids = new Set();
    for (const o of recent) {
      const who = o.alter_id;
      if (!who || who === alterId || o.id === s.id) continue;
      if (startOf(o) < b && endOf(o, now) > a) ids.add(who);
    }
    return [...ids].map((id) => byId[id]).filter(Boolean);
  };
  const row = (s) => {
    const a = startOf(s); const live = !s.end_time && s.is_active; const b = endOf(s, now);
    const source = s._sourceAlterId ? byId[s._sourceAlterId] : null;
    const when = `${dayLabel(a)}, ${timeLabel(a)}${live ? "" : `–${timeLabel(b)}`}`;
    const co = mode === "expanded" ? coFrontersOf(s) : [];
    const notes = mode === "expanded" && s.alter_id === alterId ? parseSessionNote(s.note).map((n) => n?.text).filter(Boolean) : [];
    return (
      <li key={`${s.id}-${s._sourceAlterId || ""}`} className="flex items-start gap-[0.6em] py-[0.4em] border-b border-current/10 last:border-b-0">
        <div className="flex-1 min-w-0">
          <p className="font-medium">{live ? `${t.Fronting} now · since ${timeLabel(a)}` : formatSpan(b - a)}</p>
          <p className="text-[0.8125em] opacity-70">{when}</p>
          {source && <p className="text-[0.75em] opacity-60 italic">as {formatAlter(source)}</p>}
          {co.length > 0 && <p className="text-[0.8125em] opacity-80">With {co.map(formatAlter).join(", ")}</p>}
          {notes.map((n, i) => <p key={i} className="text-[0.8125em] whitespace-pre-wrap break-words mt-[0.2em]">{n}</p>)}
        </div>
        <button type="button" onClick={() => setActionFor({ session: s, alter: source || alter })}
          className="h-11 px-3 rounded-lg border text-[0.8125em] font-medium flex-shrink-0" style={{ borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" }}
          aria-label={`Open the session from ${when}`}>
          Open
        </button>
      </li>
    );
  };
  return (
    <GardenBox empty={!sessions.length} name={`${t.Fronting} sessions`} data-fronting-sessions-widget="">
      <ul>{list.map(row)}</ul>
      {mode !== "minimal" && sessions.length > limit && (
        <button type="button" onClick={() => setShown(limit + step)} className="mt-[0.4em] h-11 px-3 rounded-lg text-[0.8125em] font-medium underline">
          Show more
        </button>
      )}
      <SessionActionPopover open={!!actionFor} onClose={() => setActionFor(null)}
        session={actionFor?.session} alter={actionFor?.alter} startTime={actionFor?.session?.start_time} />
    </GardenBox>
  );
}

// ── Notes ────────────────────────────────────────────────────────────

// Where a Notes widget's notes live. The alter's (AlterNote) is here; the
// group's (GroupNote) is in gardenGroupWidgets.jsx. Each saves through its
// own one save path, so the widget never writes a note itself.
export const ALTER_NOTES_SOURCE = {
  key: alterNotesKey,
  list: (id) => base44.entities.AlterNote.filter({ alter_id: id }, "-created_date"),
  save: ({ ownerId, noteId, text, alters, terms }) => saveAlterNote({ alterId: ownerId, noteId, text, alters, terms }),
  remove: deleteAlterNote,
};

function NoteComposer({ source, ownerId, alters, note = null, onDone }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [text, setText] = useState(note?.content || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const out = await source.save({ ownerId, noteId: note?.id || null, text, alters, terms: t });
      if (out === null) return;
      qc.invalidateQueries({ queryKey: source.key(ownerId) });
      qc.invalidateQueries({ queryKey: ["mentionLogs"] });
      setText("");
      onDone?.();
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : "Couldn't save the note");
    } finally { setSaving(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.4em]">
      <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts
        placeholder={note ? "Edit the note…" : "Write a note… @ to mention, /w @name [secret] to whisper"}
        className="min-h-[80px] text-sm" autoFocus={!!note} />
      <div className="flex justify-end gap-2">
        {onDone && note && <button type="button" onClick={onDone} className="h-11 px-3 rounded-lg text-[0.8125em]">Cancel</button>}
        <button type="button" onClick={save} disabled={saving || !text.trim()}
          className="h-11 px-4 rounded-lg text-[0.8125em] font-medium disabled:opacity-40"
          style={{ background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" }}>
          {note ? "Save" : "Add note"}
        </button>
      </div>
    </div>
  );
}

// The list + composer every Notes widget shows, for any source.
export function NotesList({ source, ownerId, settings, mode = "normal" }) {
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: source.key(ownerId),
    queryFn: () => source.list(ownerId),
    enabled: !!ownerId,
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [editing, setEditing] = useState(null);
  const [shown, setShown] = useState(null);
  const sorted = settings?.sort === "oldest" ? [...notes].reverse() : notes;
  const step = Math.max(1, Number(settings?.count) || 5);
  const limit = mode === "minimal" ? 1 : (shown ?? step);
  const list = sorted.slice(0, limit);
  const remove = async (note) => {
    if (!(await confirm("Delete this note? It goes to the trash, where it can be restored for a while."))) return;
    await source.remove(note.id);
    qc.invalidateQueries({ queryKey: source.key(ownerId) });
  };
  // A source can date its notes by another field (contact notes keep a
  // `timestamp` the person can change).
  const dateOf = source.dateOf || ((n) => n.created_date);
  const when = (n) => (dateOf(n) ? new Date(dateOf(n)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
  const iconBtn = "w-11 h-11 flex items-center justify-center rounded-lg opacity-70 hover:opacity-100";
  return (
    <GardenBox empty={!notes.length && mode !== "expanded"} name="Notes" data-notes-widget="">
      {mode === "expanded" && <div className="mb-[0.6em]"><NoteComposer source={source} ownerId={ownerId} alters={alters} /></div>}
      <ul>
        {list.map((n) => (
          <li key={n.id} data-highlight-id={n.id} className="py-[0.4em] border-b border-current/10 last:border-b-0">
            {editing === n.id ? (
              <NoteComposer source={source} ownerId={ownerId} alters={alters} note={n} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex items-start gap-[0.4em]">
                <div className="flex-1 min-w-0">
                  <div className="break-words"><RichText content={n.content} alters={alters} /></div>
                  {mode !== "minimal" && <p className="text-[0.75em] opacity-60 mt-[0.2em]">{when(n)}</p>}
                </div>
                {mode !== "minimal" && (
                  <>
                    <button type="button" onClick={() => setEditing(n.id)} className={iconBtn} aria-label={`Edit the note from ${when(n)}`}><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(n)} className={iconBtn} aria-label={`Delete the note from ${when(n)}`}><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {mode !== "minimal" && sorted.length > limit && (
        <button type="button" onClick={() => setShown(limit + step)} className="mt-[0.4em] h-11 px-3 rounded-lg text-[0.8125em] font-medium underline">Show more</button>
      )}
    </GardenBox>
  );
}

export function NotesWidget({ settings, mode = "normal" }) {
  const { alter, alterId } = useInfoAlter(settings);
  if (!alter) return null;
  return <NotesList source={ALTER_NOTES_SOURCE} ownerId={alterId} settings={settings} mode={mode} />;
}

// ── Inbox ────────────────────────────────────────────────────────────

export const iconBtnCls = "w-11 h-11 flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 flex-shrink-0";
export const textBtnCls = "h-11 px-3 rounded-lg text-[0.8125em] font-medium";
const accentBtn = { background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" };
const fieldStyle = { borderColor: "color-mix(in srgb, currentColor 20%, transparent)", background: "transparent" };
const sinceLabel = (iso) => { try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; } };

function InboxComposer({ alterId, alters, onDone }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [fromId, setFromId] = useState(null);
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  // Who's in front right now (a fresh read, not a cached list) signs it by
  // default, preferring anyone but the recipient.
  useEffect(() => {
    let live = true;
    base44.entities.FrontingSession.filter({ is_active: true }).then((rows) => {
      if (!live) return;
      const pick = (rows || []).find((r) => r.alter_id && r.alter_id !== alterId) || (rows || []).find((r) => r.alter_id);
      if (pick) setFromId((cur) => cur || pick.alter_id);
    }).catch(() => {});
    return () => { live = false; };
  }, [alterId]);
  const send = async () => {
    if (!text.trim() || !fromId) return;
    setSaving(true);
    try {
      const msg = await sendInboxMessage({ toAlterId: alterId, fromAlterId: fromId, text, pinned, alters, terms: t });
      if (msg === null) return;
      refreshInbox(qc, alterId);
      qc.invalidateQueries({ queryKey: ["mentionLogs"] });
      setText(""); setPinned(false);
      onDone?.();
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : "Couldn't send the message");
    } finally { setSaving(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.5em]">
      <div>
        <p className="text-[0.75em] font-semibold uppercase tracking-wide opacity-70 mb-1">From</p>
        <AlterSearchSelect alters={alters.filter((a) => !a.is_archived)} value={fromId} onChange={setFromId}
          terms={t} showNone={false} placeholder="Choose who this is from…" zIndex={80} />
      </div>
      <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts
        placeholder={`Leave a message… @ to mention, /w @name [secret] to whisper`} className="min-h-[80px] text-sm" />
      <label className="flex items-center gap-2 min-h-[44px] text-[0.8125em] cursor-pointer">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-5 h-5" style={{ accentColor: "var(--v2-accent)" }} />
        Keep it on the home screen until it's dismissed
      </label>
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className={textBtnCls}>Cancel</button>}
        <button type="button" onClick={send} disabled={saving || !text.trim() || !fromId} className={`${textBtnCls} px-4 disabled:opacity-40`} style={accentBtn}>Send</button>
      </div>
    </div>
  );
}

function InboxEditor({ message, alters, onDone }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [text, setText] = useState(message.content || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const out = await editInboxMessage({ message, text, alters, terms: t });
      if (out === null) return;
      refreshInbox(qc, message.to_alter_id);
      qc.invalidateQueries({ queryKey: ["mentionLogs"] });
      onDone();
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : "Couldn't save the message");
    } finally { setSaving(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.4em]">
      <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts className="min-h-[60px] text-sm" autoFocus />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={textBtnCls}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || !text.trim()} className={`${textBtnCls} px-4 disabled:opacity-40`} style={accentBtn}>Save</button>
      </div>
    </div>
  );
}

export function InboxWidget({ settings, mode = "normal" }) {
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { alter, alterId, onProfile } = useInfoAlter(settings);
  const [searchParams] = useSearchParams();
  const { data: messages = [], isFetched: messagesFetched } = useQuery({
    queryKey: inboxKey(alterId),
    queryFn: () => base44.entities.AlterMessage.filter({ to_alter_id: alterId }, "-created_date"),
    enabled: !!alterId,
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [editing, setEditing] = useState(null);
  const [composing, setComposing] = useState(false);
  const [shown, setShown] = useState(null);
  const [haloId, setHaloId] = useState(null);
  const rootRef = useRef(null);
  // On the profile, the header's Message button (?compose=1) opens the box
  // to leave one, and a notification (?messageId=) lands on its message.
  const composeParam = onProfile && searchParams.get("compose") === "1";
  const messageParam = onProfile ? searchParams.get("messageId") : null;
  const handled = useRef({ compose: false, message: null });
  useEffect(() => {
    if (composeParam && mode !== "minimal" && !handled.current.compose) {
      handled.current.compose = true;
      setComposing(true);
    }
    if (!composeParam) handled.current.compose = false;
  }, [composeParam, mode]);
  useEffect(() => {
    if (!messageParam || !messagesFetched || handled.current.message === messageParam || mode === "minimal") return;
    handled.current.message = messageParam;
    const pool0 = settings?.pinnedOnly ? messages.filter((m) => m.pinned) : messages;
    const i = pool0.findIndex((m) => String(m.id) === String(messageParam));
    if (i < 0) return;
    setShown((cur) => Math.max(cur ?? (Math.max(1, Number(settings?.count) || 5)), i + 1));
    setHaloId(String(messageParam));
    setTimeout(() => {
      const el = rootRef.current?.querySelector(`[data-highlight-id="${CSS.escape(String(messageParam))}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, [messageParam, messagesFetched, messages, mode, settings?.pinnedOnly, settings?.count]);
  useEffect(() => {
    if (!haloId) return;
    const timer = setTimeout(() => setHaloId(null), 3500);
    return () => clearTimeout(timer);
  }, [haloId]);
  if (!alter) return null;
  const byId = Object.fromEntries(alters.map((a) => [a.id, a]));
  const unread = messages.filter((m) => !m.is_read).length;
  const pool = settings?.pinnedOnly ? messages.filter((m) => m.pinned) : messages;
  const step = Math.max(1, Number(settings?.count) || 5);
  const limit = shown ?? step;
  const list = pool.slice(0, limit);
  const unreadText = unread ? `${unread} unread ${unread === 1 ? "message" : "messages"}` : "No unread messages";
  const act = (fn) => async () => { await fn(); refreshInbox(qc, alterId); };
  const remove = async (m) => {
    if (!(await confirm("Delete this message? It goes to the trash, where it can be restored for a while."))) return;
    await deleteAlterMessage(m.id);
    refreshInbox(qc, alterId);
  };
  if (mode === "minimal") {
    return (
      <GardenBox empty={false} name="Inbox" data-inbox-widget="">
        <p className="flex items-center gap-[0.5em]"><Mail className="w-[1.2em] h-[1.2em] flex-shrink-0" style={{ color: "var(--v2-accent)" }} aria-hidden="true" />
          <span className={unread ? "font-semibold" : "opacity-70"}>{unreadText}</span></p>
      </GardenBox>
    );
  }
  const row = (m) => {
    const from = byId[m.from_alter_id];
    const fromName = from ? formatAlter(from) : "Unknown";
    if (editing === m.id) return <li key={m.id} className="py-[0.4em]"><InboxEditor message={m} alters={alters} onDone={() => setEditing(null)} /></li>;
    return (
      <li key={m.id} data-highlight-id={m.id} className={`pt-[0.4em] border-b border-current/10 last:border-b-0 rounded-md ${haloId === String(m.id) ? "scroll-highlight-halo" : ""}`}>
        <div className="min-w-0">
          <p className="text-[0.8125em] flex items-center gap-[0.4em] flex-wrap">
            {!m.is_read && <span className="w-[0.55em] h-[0.55em] rounded-full flex-shrink-0" style={{ background: from?.color || "var(--v2-accent)" }} aria-hidden="true" />}
            <span className="font-semibold">From {fromName}</span>
            {!m.is_read && <span className="sr-only">(unread)</span>}
            {m.pinned && <span className="opacity-70">· pinned</span>}
          </p>
          <div className={`break-words ${m.is_read ? "opacity-80" : ""}`}><RichText content={m.content} alters={alters} /></div>
          <p className="text-[0.75em] opacity-60 mt-[0.2em]">{sinceLabel(m.created_date)}{m.edited_date ? " · edited" : ""}</p>
        </div>
        <div className="flex justify-end -mr-[0.5em]">
          {!m.is_read && (
            <button type="button" onClick={act(() => setInboxMessageRead(m.id, true))} className={iconBtnCls} aria-label={`Mark the message from ${fromName} as read`}><Check className="w-4 h-4" /></button>
          )}
          <button type="button" onClick={act(() => setInboxMessagePinned(m.id, !m.pinned))} className={iconBtnCls} aria-pressed={!!m.pinned}
            aria-label={m.pinned ? `Unpin the message from ${fromName}` : `Pin the message from ${fromName}`}
            style={m.pinned ? { color: "var(--v2-accent)", opacity: 1 } : undefined}><Pin className="w-4 h-4" /></button>
          <button type="button" onClick={() => setEditing(m.id)} className={iconBtnCls} aria-label={`Edit the message from ${fromName}`}><Pencil className="w-4 h-4" /></button>
          <button type="button" onClick={() => remove(m)} className={iconBtnCls} aria-label={`Delete the message from ${fromName}`}><Trash2 className="w-4 h-4" /></button>
        </div>
      </li>
    );
  };
  return (
    <GardenBox empty={!pool.length && mode !== "expanded"} name="Inbox" data-inbox-widget="">
      <div ref={rootRef}>
      {unread > 0 && <p className="text-[0.8125em] font-semibold mb-[0.3em]" style={{ color: "var(--v2-accent)" }}>{unreadText}</p>}
      <ul>{list.map(row)}</ul>
      {pool.length > limit && (
        <button type="button" onClick={() => setShown(limit + step)} className={`${textBtnCls} underline mt-[0.4em]`}>Show more</button>
      )}
      {mode === "expanded" && (
        <div className="mt-[0.6em]">
          {composing
            ? <InboxComposer alterId={alterId} alters={alters} onDone={() => setComposing(false)} />
            : <button type="button" onClick={() => setComposing(true)} className={`${textBtnCls} w-full border`} style={{ borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" }}>Leave a message</button>}
        </div>
      )}
      {mode !== "expanded" && composing && (
        <div className="mt-[0.6em]"><InboxComposer alterId={alterId} alters={alters} onDone={() => setComposing(false)} /></div>
      )}
      </div>
    </GardenBox>
  );
}

// ── Board feed ───────────────────────────────────────────────────────

const SOURCE_LABELS = {
  bulletin: "Bulletin", comment: "Comment", reply: "Reply", journal: "Journal", checkin: "Check-in",
  task: "Task", message: "Message", mention: "Mention", note: "Note",
  session_note: "Session note", session_emotion: "Session feeling", session_symptom: "Session symptom",
};
const sourceLabel = (type) => SOURCE_LABELS[type] || String(type || "Item").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function boardKindText(item) {
  const what = sourceLabel(item.source_type);
  if (item.log_type === "session") return what;
  if (item._is_message) return "Board message";
  return item.log_type === "authored" ? `Wrote a ${what.toLowerCase()}` : `Mentioned in a ${what.toLowerCase()}`;
}

function BoardComposer({ alterId, alters }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const post = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const msg = await postBoardMessage({ alterId, text, alters, terms: t });
      if (msg === null) return;
      refreshBoard(qc, alterId);
      setText("");
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : "Couldn't post the message");
    } finally { setSaving(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.4em]">
      <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts
        placeholder="Post to this board… @ to mention, /w @name [secret] to whisper" className="min-h-[70px] text-sm" />
      <div className="flex justify-end">
        <button type="button" onClick={post} disabled={saving || !text.trim()} className={`${textBtnCls} px-4 disabled:opacity-40`} style={accentBtn}>Post</button>
      </div>
    </div>
  );
}

export function BoardFeedWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { alter, alterId } = useInfoAlter(settings);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { items } = useAlterBoardFeed(alterId, { alters, sessionLabel: `${t.Alter} session`, systemLabel: t.System });
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(null);
  if (!alter) return null;
  const kinds = Array.isArray(settings?.kinds) ? settings.kinds : [];
  const pool = items.filter((i) => (!kinds.length || kinds.some((k) => boardKindMatches(k, i))) && (mode !== "expanded" || boardItemMatchesSearch(i, query)));
  const step = Math.max(1, Number(settings?.count) || 5);
  const limit = mode === "minimal" ? 1 : (shown ?? step);
  const list = pool.slice(0, limit);
  const remove = async (item) => {
    if (!(await confirm("Delete this message? It goes to the trash, where it can be restored for a while."))) return;
    await deleteAlterMessage(item._raw_id);
    refreshBoard(qc, alterId);
  };
  const dateOf = (i) => { const d = i.source_date || i.created_date; return d ? dayLabel(new Date(d).getTime()) : ""; };
  const row = (item) => {
    const kind = boardKindText(item);
    return (
      <li key={item.id} className="flex items-start gap-[0.4em] py-[0.45em] border-b border-current/10 last:border-b-0">
        <div className="flex-1 min-w-0">
          <p className="text-[0.75em] flex flex-wrap gap-x-[0.4em]">
            <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--v2-accent)" }}>{kind}</span>
            {item.source_label && <span className="opacity-70">· {item.source_label}</span>}
            <span className="opacity-60 ml-auto">{dateOf(item)}</span>
          </p>
          {mode === "minimal" ? (
            <p className="line-clamp-2 break-words">{mentionPreviewText(item)}</p>
          ) : (
            <div className="break-words wysiwyg-content max-h-[12em] overflow-hidden [&_img]:max-h-[10em] [&_img]:rounded-lg">
              {renderBulletinContent(mentionPreview(item), alters, t)}
            </div>
          )}
        </div>
        {mode !== "minimal" && item.navigate_path && (
          <button type="button" onClick={() => navigate(item.navigate_path)} className={`${textBtnCls} border`}
            style={{ borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" }} aria-label={`Open: ${kind}${item.source_label ? `, ${item.source_label}` : ""}`}>Open</button>
        )}
        {mode !== "minimal" && item._is_message && (
          <button type="button" onClick={() => remove(item)} className={iconBtnCls} aria-label="Delete this board message"><Trash2 className="w-4 h-4" /></button>
        )}
      </li>
    );
  };
  return (
    <GardenBox empty={!items.length && mode !== "expanded"} name="Board feed" data-board-feed-widget="">
      {mode === "expanded" && (
        <div className="mb-[0.5em] space-y-[0.5em]">
          <BoardComposer alterId={alterId} alters={alters} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the board…"
            aria-label="Search the board" data-own-hold="" className="w-full h-11 px-3 rounded-lg border text-[0.875em]" style={fieldStyle} />
        </div>
      )}
      {list.length ? <ul>{list.map(row)}</ul> : (mode === "expanded" && <p className="opacity-60 text-[0.8125em]">{query ? "Nothing matches." : "Nothing here yet."}</p>)}
      {mode !== "minimal" && pool.length > limit && (
        <button type="button" onClick={() => setShown(limit + step)} className={`${textBtnCls} underline mt-[0.4em]`}>Show more</button>
      )}
    </GardenBox>
  );
}

// ── Registry entries ─────────────────────────────────────────────────

export const MODES = ["minimal", "normal", "expanded"];
export const base = { category: "profile", subjects: ["alter"], supportsMultiInstance: true, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 40 } };

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
      { key: "editInPlace", type: "toggle", label: "Tap the text to edit it (home screen)", default: true },
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
  alter_fronting_stats: {
    ...base, label: "{{Fronting}} stats", icon: BarChart3,
    description: "How much this {{alter}} has been in {{front}}: total time; Normal adds sessions, average and when last; Expanded a 30-day chart.",
    render: ({ settings, mode }) => <FrontingStatsWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "range", type: "select", label: "Time range", default: "30",
        options: [{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "A year" }, { value: "all", label: "All time" }] },
      { key: "includeInherited", type: "toggle", label: "Include history from fusions and splits", default: false },
    ],
  },
  alter_fronting_sessions: {
    ...base, label: "{{Fronting}} sessions", icon: History,
    description: "This {{alter}}'s {{fronting}} sessions: the latest, or a list; Expanded adds who else was in {{front}} and session notes. Open one to edit it or find it on the timeline.",
    render: ({ settings, mode }) => <FrontingSessionsWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
      { key: "includeInherited", type: "toggle", label: "Include history from fusions and splits", default: false },
    ],
  },
  alter_notes: {
    ...base, label: "Notes", icon: FileText,
    description: "This {{alter}}'s notes: the latest, or a list you can edit; Expanded adds a box to write a new one.",
    render: ({ settings, mode }) => <NotesWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "sort", type: "select", label: "Order", default: "newest",
        options: [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }] },
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
    ],
  },
  alter_inbox: {
    ...base, label: "Inbox", icon: Mail,
    description: "Messages left for this {{alter}}: how many are unread, the list to read, pin, edit or delete; Expanded adds a box to leave one.",
    render: ({ settings, mode }) => <InboxWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "pinnedOnly", type: "toggle", label: "Pinned messages only", default: false },
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
    ],
  },
  alter_board_feed: {
    ...base, label: "Board feed", icon: Newspaper,
    description: "This {{alter}}'s board: what they wrote, where they're mentioned, messages left on it and their session notes. Minimal is the latest; Expanded adds search and a box to post.",
    render: ({ settings, mode }) => <BoardFeedWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 5 },
    configFields: [
      { key: "kinds", type: "multi", label: "Kinds shown", default: [],
        options: BOARD_KINDS.map((k) => ({ value: k.key, label: k.label })) },
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
    ],
  },
};
