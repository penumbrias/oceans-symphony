// The new group profile's widgets (v0.307.0): Identity, About, Members,
// Nested groups, Fronting and Notes for a group or sub-system page.
//
// Built the same way as the alter profile's widgets (gardenProfileWidgets):
//   • they show the group and never own its data — the group's own fields
//     are edited on the pencil form, membership through GroupMembersModal,
//     notes through src/lib/groupNotes.js;
//   • Minimal / Normal / Expanded where that means something;
//   • ONE box (GardenBox, flush until the person gives it a look), em text,
//     labelled controls and 44px targets;
//   • nothing on the page when there's nothing to show, and a name while
//     the layout is being edited.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Folder, FolderTree, Crown, Users, IdCard, AlignLeft, BarChart3, FileText, Archive, User } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useBoardSubject } from "@/lib/boardSubject";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import GroupIcon from "@/components/shared/GroupIcon";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import { useGroupContext, useSubTerm } from "@/components/groups/GroupSections";
import { getMemberAlters, getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import { childGroups as childGroupsOf, byGroupOrder } from "@/lib/groupTree";
import { groupNotesKey, listGroupNotes, saveGroupNote, deleteGroupNote } from "@/lib/groupNotes";
import {
  GardenBox, Heading, chipCls, chipStyle, MODES, NotesList, Sparkline,
  frontingStats, dailyMinutes, formatSpan, RANGE_DAYS, textBtnCls,
} from "@/v2/gardenProfileWidgets";

// The group whose page this is (by id or an imported sp_id — alter.groups
// stores either). Same ["groups"] query every group surface reads.
export function useSubjectGroup() {
  const subject = useBoardSubject();
  const id = subject?.type === "group" ? subject.id : null;
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: !!id });
  if (!id) return null;
  return groups.find((g) => String(g.id) === String(id) || (g.sp_id && String(g.sp_id) === String(id))) || null;
}

const AVATAR_RADIUS = { circle: "9999px", rounded: "22%", square: "6%" };

function GroupPicture({ group, size, shape }) {
  const url = useResolvedAvatarUrl(group.avatar_url);
  return (
    <div className="overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: AVATAR_RADIUS[shape] || AVATAR_RADIUS.rounded, backgroundColor: group.color || "color-mix(in srgb, var(--v2-accent) 20%, transparent)" }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" />
        : group.emoji ? <span style={{ fontSize: size * 0.45 }} aria-hidden="true">{group.emoji}</span>
        : <Folder className="w-1/2 h-1/2 opacity-70" aria-hidden="true" />}
    </div>
  );
}

function AlterFace({ alter, size = "2.25em" }) {
  const url = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <span className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, backgroundColor: alter.color || "color-mix(in srgb, var(--v2-accent) 20%, transparent)" }} aria-hidden="true">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-1/2 h-1/2 opacity-70" />}
    </span>
  );
}

// ── Identity ─────────────────────────────────────────────────────────

export function GroupIdentityWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const navigate = useNavigate();
  const subTerm = useSubTerm();
  const group = useSubjectGroup();
  const { ownerAlter, parentGroup, members, childGroups, frontingAlterIds } = useGroupContext(group);
  const formatAlter = useAlterLabel();
  if (!group) return null;
  const minimal = mode === "minimal";
  const expanded = mode === "expanded";
  const center = settings?.align === "center";
  const size = Math.max(32, Math.min(200, Number(settings?.avatarSize) || 88));
  const inFront = members.filter((m) => frontingAlterIds.includes(m.id)).length;
  const linkCls = "inline-flex items-center gap-[0.3em] min-h-[2.75em] hover:underline text-left";
  return (
    <GardenBox data-group-identity-widget="" data-mode={mode}>
      <div className={`flex gap-[0.9em] ${center ? "flex-col items-center text-center" : "items-start"}`}>
        {settings?.showAvatar !== false && <GroupPicture group={group} size={size} shape={settings?.avatarShape} />}
        <div className="min-w-0 flex-1 space-y-[0.15em]">
          <h2 className="font-display text-[1.5em] font-semibold leading-tight break-words">
            {group.emoji ? <span className="mr-[0.3em]" aria-hidden="true">{group.emoji}</span> : null}{group.name}
          </h2>
          {!minimal && (
            <div className={`flex flex-col ${center ? "items-center" : "items-start"}`}>
              {ownerAlter && (
                <button type="button" onClick={() => navigate(`/alter/${ownerAlter.id}`)} className={linkCls}>
                  <Crown className="w-[1em] h-[1em] flex-shrink-0" aria-hidden="true" /> {formatAlter(ownerAlter)}'s {subTerm}
                </button>
              )}
              {parentGroup && (
                <button type="button" onClick={() => navigate(`/group/${parentGroup.id}`)} className={`${linkCls} opacity-80`}>
                  <Folder className="w-[1em] h-[1em] flex-shrink-0" aria-hidden="true" /> Inside {parentGroup.name}
                </button>
              )}
              <p className="text-[0.875em] opacity-70">
                {members.length} {members.length === 1 ? t.alter : t.alters}
                {expanded && childGroups.length > 0 ? ` · ${childGroups.length} nested` : ""}
                {expanded && inFront > 0 ? ` · ${inFront} in ${t.front} now` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </GardenBox>
  );
}

// ── About ────────────────────────────────────────────────────────────

const plain = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function GroupAboutWidget({ mode = "normal" }) {
  const group = useSubjectGroup();
  if (!group) return null;
  const html = group.description || "";
  const text = plain(html);
  return (
    <GardenBox empty={!text} name="About" data-group-about-widget="">
      {mode === "minimal"
        ? <p className="line-clamp-3 break-words">{text}</p>
        : <SimplePreview blocks={htmlToBlocks(html)} onBlockChange={() => {}} readOnly scopeId={group.id} />}
    </GardenBox>
  );
}

// ── Members ──────────────────────────────────────────────────────────

export function GroupMembersWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const navigate = useNavigate();
  const subTerm = useSubTerm();
  const formatAlter = useAlterLabel();
  const group = useSubjectGroup();
  const { allGroups, members, frontingAlterIds } = useGroupContext(group);
  const [manage, setManage] = useState(false);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const list = [...members];
    const sort = settings?.sort || "order";
    if (sort === "name") list.sort((a, b) => formatAlter(a).localeCompare(formatAlter(b)));
    if (sort === "front") list.sort((a, b) => Number(frontingAlterIds.includes(b.id)) - Number(frontingAlterIds.includes(a.id)));
    return list;
  }, [members, settings?.sort, frontingAlterIds, formatAlter]);
  if (!group) return null;
  const minimal = mode === "minimal";
  const expanded = mode === "expanded";
  const step = Math.max(1, Number(settings?.count) || 12);
  const shown = all ? sorted : sorted.slice(0, step);
  const showManage = settings?.showManage !== false && !minimal;
  const open = (a) => navigate(`/alter/${a.id}`);
  return (
    <GardenBox data-group-members-widget="" data-mode={mode}>
      {(showManage || settings?.showHeading !== false) && (
        <div className="flex items-center justify-between gap-2 mb-[0.3em]">
          {settings?.showHeading !== false ? <Heading>{`${t.Alters} (${members.length})`}</Heading> : <span />}
          {showManage && (
            <button type="button" onClick={() => setManage(true)} className={`${textBtnCls} inline-flex items-center gap-1`}>
              <Users className="w-4 h-4" aria-hidden="true" /> Manage
            </button>
          )}
        </div>
      )}
      {members.length === 0 ? (
        <p className="opacity-70 text-[0.875em]">No {t.alters} in this group yet.{showManage ? " Manage adds some." : ""}</p>
      ) : minimal ? (
        <ul className="flex flex-wrap gap-[0.4em]" aria-label={t.Alters}>
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => open(a)} className="rounded-full min-w-[2.75em] min-h-[2.75em] flex items-center justify-center"
                aria-label={`${formatAlter(a)}${frontingAlterIds.includes(a.id) ? `, in ${t.front}` : ""}`} title={formatAlter(a)}>
                <span className="relative">
                  <AlterFace alter={a} />
                  {frontingAlterIds.includes(a.id) && <span className="absolute -bottom-0.5 -right-0.5 w-[0.7em] h-[0.7em] rounded-full" style={{ background: "var(--v2-accent)", boxShadow: "0 0 0 2px hsl(var(--background))" }} aria-hidden="true" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label={t.Alters}>
          {shown.map((a) => {
            const subs = expanded ? getSubsystemsOwnedBy(allGroups, a.id) : [];
            const front = frontingAlterIds.includes(a.id);
            return (
              <li key={a.id} className="flex items-center gap-[0.4em] border-b border-current/10 last:border-b-0">
                <button type="button" onClick={() => open(a)} className="flex-1 min-w-0 flex items-center gap-[0.6em] min-h-[2.75em] py-[0.25em] text-left">
                  <AlterFace alter={a} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{formatAlter(a)}</span>
                    {(a.pronouns || (expanded && a.role)) && (
                      <span className="block truncate text-[0.75em] opacity-70">{[a.pronouns, expanded ? a.role : null].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  {front && <span className={chipCls} style={chipStyle(null)}>In {t.front}</span>}
                  {expanded && a.is_archived && (
                    <span className="inline-flex items-center gap-1 text-[0.6875em] font-semibold uppercase tracking-wide opacity-80">
                      <Archive className="w-[1em] h-[1em]" aria-hidden="true" /> Archived
                    </span>
                  )}
                </button>
                {subs.length > 0 && (
                  <button type="button" onClick={() => navigate(`/group/${subs[0].id}`)}
                    className="w-11 h-11 flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 flex-shrink-0"
                    aria-label={`Open ${subs[0].name}${subs.length > 1 ? ` (one of ${subs.length} ${subTerm}s)` : ""}`}>
                    <FolderTree className="w-4 h-4" style={{ color: subs[0].color || undefined }} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className={`${textBtnCls} mt-[0.3em] underline`}>Show all {sorted.length}</button>
      )}
      {manage && <GroupMembersModal group={group} allGroups={allGroups} isOpen={manage} onClose={() => setManage(false)} />}
    </GardenBox>
  );
}

// ── Nested groups ────────────────────────────────────────────────────

export function GroupNestedWidget({ mode = "normal" }) {
  const navigate = useNavigate();
  const t = useTerms();
  const group = useSubjectGroup();
  const { allGroups, alters, childGroups } = useGroupContext(group);
  if (!group) return null;
  const count = (g) => getMemberAlters(g, alters).filter((m) => !m.is_archived).length;
  const row = (g, depth = 0) => (
    <li key={g.id}>
      <button type="button" onClick={() => navigate(`/group/${g.id}`)}
        className="w-full flex items-center gap-[0.5em] min-h-[2.75em] text-left hover:underline"
        style={{ paddingLeft: `${depth * 1.2}em` }}>
        {depth > 0 && <span className="opacity-50" aria-hidden="true">↳</span>}
        <GroupIcon group={g} className="w-[1.1em] h-[1.1em] flex-shrink-0" />
        <span className="flex-1 truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
        {mode !== "minimal" && <span className="text-[0.75em] opacity-60 flex-shrink-0">{count(g)} {count(g) === 1 ? t.alter : t.alters}</span>}
      </button>
    </li>
  );
  // Expanded walks every level below, through the one group tree — never
  // visiting a group twice and stopping at MAX_DEPTH, so a loop can't hang.
  const rows = [];
  if (mode === "expanded") {
    const seen = new Set([group.id]);
    const walk = (parent, depth) => {
      if (depth > MAX_DEPTH) return;
      for (const g of childGroupsOf(allGroups, parent.id).sort(byGroupOrder)) {
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        rows.push(row(g, depth));
        walk(g, depth + 1);
      }
    };
    walk(group, 0);
  }
  return (
    <GardenBox empty={!childGroups.length} name="Nested groups" data-group-nested-widget="">
      {mode === "minimal" ? (
        <div className="flex flex-wrap gap-[0.4em]">
          {childGroups.map((g) => (
            <button key={g.id} type="button" onClick={() => navigate(`/group/${g.id}`)} className={`${chipCls} min-h-[2.75em]`} style={chipStyle(g.color)}>
              <span className="truncate">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <ul aria-label="Nested groups">{mode === "expanded" ? rows : childGroups.map((g) => row(g))}</ul>
      )}
    </GardenBox>
  );
}
const MAX_DEPTH = 8;

// ── Fronting ─────────────────────────────────────────────────────────

// Who a stored session belongs to (own rows, or the legacy grouped shape).
const sessionAlterIds = (s) => (s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean));
const t0 = (s) => new Date(s.start_time).getTime();
const t1 = (s, now) => (s.end_time ? new Date(s.end_time).getTime() : (s.is_active ? now : t0(s)));

// Time anyone from the group was in front: the members' sessions merged,
// so two members fronting together count once.
export function mergeSessionSpans(sessions, now = Date.now()) {
  const spans = sessions
    .map((s) => [t0(s), t1(s, now), !s.end_time && s.is_active])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b, live] of spans) {
    const last = out[out.length - 1];
    if (last && a <= last.b) { last.b = Math.max(last.b, b); last.live = last.live || live; }
    else out.push({ a, b, live });
  }
  return out.map((m) => ({
    start_time: new Date(m.a).toISOString(),
    end_time: m.live ? null : new Date(m.b).toISOString(),
    is_active: m.live,
  }));
}

export function GroupFrontingWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const group = useSubjectGroup();
  const { members, frontingAlterIds } = useGroupContext(group);
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const { data: rows = [] } = useQuery({
    queryKey: ["frontHistory", "recent"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 5000),
    enabled: !!group && mode !== "minimal",
  });
  const days = RANGE_DAYS[settings?.range] ?? (settings?.range === "all" ? 0 : 30);
  const now = Date.now();
  const perMember = useMemo(() => {
    const by = new Map();
    for (const s of rows) {
      for (const id of sessionAlterIds(s)) {
        if (!memberIds.has(id)) continue;
        if (!by.has(id)) by.set(id, []);
        by.get(id).push(s);
      }
    }
    return by;
  }, [rows, memberIds]);
  const merged = useMemo(() => mergeSessionSpans([...new Set([...perMember.values()].flat())]), [perMember]);
  if (!group) return null;
  const nowIn = members.filter((m) => frontingAlterIds.includes(m.id));
  const rangeText = days ? `the last ${days} days` : "all time";
  const stats = frontingStats(merged, { days, now });
  const ranked = members
    .map((m) => ({ alter: m, total: frontingStats(perMember.get(m.id) || [], { days, now }).total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(1, Number(settings?.count) || 5));
  const max = ranked[0]?.total || 1;
  return (
    <GardenBox empty={!members.length} name={`${t.Fronting}`} data-group-fronting-widget="" data-mode={mode}>
      <div className="space-y-[0.7em]">
        <div>
          <Heading>{`In ${t.front} now`}</Heading>
          {nowIn.length ? (
            <div className="flex flex-wrap gap-[0.4em]">
              {nowIn.map((a) => (
                <button key={a.id} type="button" onClick={() => navigate(`/alter/${a.id}`)} className={`${chipCls} min-h-[2.75em]`} style={chipStyle(a.color)}>
                  <AlterFace alter={a} size="1.5em" /><span className="truncate">{formatAlter(a)}</span>
                </button>
              ))}
            </div>
          ) : <p className="opacity-70 text-[0.875em]">No one from this group right now.</p>}
        </div>
        {mode !== "minimal" && (
          <div>
            <Heading>{`Time in ${t.front}, ${rangeText}`}</Heading>
            <p className="text-[1.25em] font-semibold tabular-nums">{formatSpan(stats.total)}</p>
            {ranked.length > 0 && (
              <ul className="mt-[0.4em] space-y-[0.3em]" aria-label={`${t.Alters} by time in ${t.front}`}>
                {ranked.map(({ alter, total }) => (
                  <li key={alter.id}>
                    <button type="button" onClick={() => navigate(`/alter/${alter.id}?tab=fronting`)} className="w-full text-left min-h-[2.75em]">
                      <span className="flex items-center justify-between gap-2 text-[0.875em]">
                        <span className="truncate">{formatAlter(alter)}</span>
                        <span className="tabular-nums opacity-70 flex-shrink-0">{formatSpan(total)}</span>
                      </span>
                      <span className="block h-[0.4em] rounded-full mt-[0.2em]" style={{ background: "color-mix(in srgb, var(--v2-accent) 15%, transparent)" }} aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (total / max) * 100)}%`, background: alter.color || "var(--v2-accent)" }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {mode === "expanded" && (
          <div>
            <Heading>Last 30 days</Heading>
            <Sparkline values={dailyMinutes(merged, { days: 30, now })} label={`Minutes in ${t.front} per day from this group, last 30 days`} />
          </div>
        )}
      </div>
    </GardenBox>
  );
}

// ── Notes ────────────────────────────────────────────────────────────

export const GROUP_NOTES_SOURCE = {
  key: groupNotesKey,
  list: listGroupNotes,
  save: ({ ownerId, noteId, text, alters, terms }) => saveGroupNote({ groupId: ownerId, noteId, text, alters, terms }),
  remove: deleteGroupNote,
};

export function GroupNotesWidget({ settings, mode = "normal" }) {
  const group = useSubjectGroup();
  if (!group) return null;
  return <NotesList source={GROUP_NOTES_SOURCE} ownerId={group.id} settings={settings} mode={mode} />;
}

// ── Registry ─────────────────────────────────────────────────────────

const base = { category: "profile", subjects: ["group"], supportsMultiInstance: true, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 40 } };

export const GARDEN_GROUP_WIDGETS = {
  group_identity: {
    ...base, label: "Group identity", icon: IdCard,
    description: "The group's picture and name; Normal adds who it belongs to, where it sits and how many {{alters}}, Expanded who's in {{front}}.",
    render: ({ settings, mode }) => <GroupIdentityWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "showAvatar", type: "toggle", label: "Show the picture", default: true },
      { key: "avatarShape", type: "select", label: "Picture shape", default: "rounded",
        options: [{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
      { key: "avatarSize", type: "number", label: "Picture size", min: 32, max: 200, default: 88, unit: "px" },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Beside" }, { value: "center", label: "Centred" }] },
    ],
  },
  group_about: {
    ...base, label: "About the group", icon: AlignLeft,
    description: "The group's description. Minimal is the first few lines as plain text.",
    render: ({ mode }) => <GroupAboutWidget mode={mode} />,
    supportsModes: ["minimal", "normal"], defaultSpan: { cols: 12, rows: 2 },
  },
  group_members: {
    ...base, label: "Group {{alters}}", icon: Users,
    description: "Who is in the group, with Manage. Minimal is their pictures, Normal a list, Expanded adds roles and their own sub{{system}}s.",
    render: ({ settings, mode }) => <GroupMembersWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 3 },
    configFields: [
      { key: "sort", type: "select", label: "Order", default: "order",
        options: [{ value: "order", label: "The group's order" }, { value: "name", label: "By name" }, { value: "front", label: "In {{front}} first" }] },
      { key: "count", type: "number", label: "How many before Show all", min: 1, max: 200, default: 12 },
      { key: "showHeading", type: "toggle", label: "Show the heading", default: true },
      { key: "showManage", type: "toggle", label: "Show Manage", default: true },
    ],
  },
  group_nested: {
    ...base, label: "Nested groups", icon: FolderTree,
    description: "The groups inside this one. Minimal is chips, Normal a list with counts, Expanded every level below.",
    render: ({ mode }) => <GroupNestedWidget mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
  },
  group_fronting: {
    ...base, label: "Group {{fronting}}", icon: BarChart3,
    description: "Who from the group is in {{front}} now; Normal adds the group's time in {{front}} and who fronted most, Expanded a 30-day chart.",
    render: ({ settings, mode }) => <GroupFrontingWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 3 },
    configFields: [
      { key: "range", type: "select", label: "Time range", default: "30",
        options: [{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "A year" }, { value: "all", label: "All time" }] },
      { key: "count", type: "number", label: "How many {{alters}} to rank", min: 1, max: 50, default: 5 },
    ],
  },
  group_notes: {
    ...base, label: "Group notes", icon: FileText,
    description: "The group's private notes: the latest, or a list you can edit; Expanded adds a box to write a new one.",
    render: ({ settings, mode }) => <GroupNotesWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "sort", type: "select", label: "Order", default: "newest",
        options: [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }] },
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
    ],
  },
};
