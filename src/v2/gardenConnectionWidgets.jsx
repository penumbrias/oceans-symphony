// The garden's connection widgets (v0.304.0): Relationships, Lineage and
// Activity links. Same rules as gardenProfileWidgets.jsx — one flush box,
// Minimal / Normal / Expanded, labelled 44px controls, every write through
// the shared helper (alterRelationships.js, lineageEvents.js) and every
// edit in the one shared editor (CreateRelationshipModal,
// LineageEventEditForm, RecordSystemChangeModal).

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Link2, GitMerge, Zap, Pencil, Trash2, ArrowRight } from "lucide-react";
import { base44, localEntities } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { confirm } from "@/components/shared/ConfirmDialog";
import { TRASH_HINT } from "@/lib/trashSettings";
import { isLogCommandError } from "@/lib/authoredText";
import { useInfoAlter } from "@/v2/infoWidgets";
import { GardenBox, Heading, chipStyle, chipCls, iconBtnCls, textBtnCls, MODES, base } from "@/v2/gardenProfileWidgets";
import CreateRelationshipModal from "@/components/systemmap/CreateRelationshipModal";
import { AlterAvatar } from "@/components/systemmap/RelationshipsPanel";
import RecordSystemChangeModal from "@/components/alters/RecordSystemChangeModal";
import LineageEventEditForm from "@/components/alters/LineageEventEditForm";
import {
  RELATIONSHIPS_KEY, relationshipsOf, relativeArrow, relationshipTypeLabel, saveRelationship, deleteRelationship,
} from "@/lib/alterRelationships";
import {
  LINEAGE_KEY, LINEAGE_TYPE_LABELS, lineageOf, lineageDateLabel, isLineageTransition, editLineageEvent, deleteLineageEvent,
} from "@/lib/lineageEvents";
import { ALTER_RELATIONS, allRelations, clampStrength, LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";

const outlineBtn = { borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" };
const rowCls = "py-[0.45em] border-b border-current/10 last:border-b-0";
const useAlters = () => useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() }).data || [];

function AlterChip({ alter, emphasis = false }) {
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  if (!alter) return null;
  return (
    <button type="button" onClick={() => navigate(`/alter/${alter.id}`)} className={`${chipCls} ${emphasis ? "font-semibold" : ""}`}
      style={{ ...chipStyle(alter.color), ...(emphasis ? { outline: `2px solid ${alter.color || "var(--v2-accent)"}`, outlineOffset: "1px" } : {}) }}
      aria-label={`Open ${formatAlter(alter)}'s profile`}>
      <span className="w-[0.7em] h-[0.7em] rounded-full flex-shrink-0" style={{ background: alter.color || "var(--v2-accent)" }} aria-hidden="true" />
      <span className="truncate">{formatAlter(alter)}</span>
    </button>
  );
}

// ── Relationships ────────────────────────────────────────────────────

// A small star map: this alter in the middle, the others around it, each
// line in the relationship's colour and as thick as its strength.
function RelationshipMap({ self, rels, formatAlter }) {
  const n = rels.length;
  const W = 220; const H = 170; const cx = W / 2; const cy = H / 2; const R = 62;
  const pts = rels.map((r, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { r, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const label = `${formatAlter(self)}: ${rels.map((r) => `${relationshipTypeLabel(r)} ${relativeArrow(r.direction, r._selfIsA) === "↔" ? "with" : relativeArrow(r.direction, r._selfIsA) === "→" ? "to" : "from"} ${formatAlter(r.other)}`).join("; ")}.`;
  const node = (alter, x, y, size) => (
    <g key={alter.id}>
      <circle cx={x} cy={y} r={size} fill={alter.color || "var(--v2-accent)"} opacity={0.9} />
      <text x={x} y={y + 3.2} textAnchor="middle" fontSize={size * 0.95} fontWeight="700" fill="#fff">{(alter.name || "?").charAt(0).toUpperCase()}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[22em] mx-auto block" role="img" aria-label={label}>
      {pts.map(({ r, x, y }) => (
        <line key={`l-${r.id}`} x1={cx} y1={cy} x2={x} y2={y} stroke={r.color || "currentColor"} strokeOpacity={0.75} strokeWidth={0.8 + clampStrength(r.strength) * 0.6} />
      ))}
      {node(self, cx, cy, 13)}
      {pts.map(({ r, x, y }) => (
        <g key={`n-${r.id}`}>
          {node(r.other, x, y, 9)}
          <text x={x} y={y + (y >= cy ? 19 : -13)} textAnchor="middle" fontSize="8" fill="currentColor">{formatAlter(r.other).slice(0, 14)}</text>
        </g>
      ))}
    </svg>
  );
}

export function RelationshipsWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const { alter, alterId } = useInfoAlter(settings);
  const alters = useAlters();
  const show = settings?.show || "both";
  const { data: relationships = [] } = useQuery({ queryKey: RELATIONSHIPS_KEY, queryFn: () => base44.entities.AlterRelationship.list() });
  const { data: contactRels = [] } = useQuery({
    queryKey: ["contactRelationshipsForAlter", alterId],
    queryFn: () => base44.entities.ContactRelationship.filter({ target_type: "alter", target_id: alterId }),
    enabled: !!alterId && show !== "alters",
  });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled: show !== "alters" });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const alterMap = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const mine = useMemo(() => (show === "contacts" ? [] : relationshipsOf(relationships, alterId, alterMap)), [relationships, alterId, alterMap, show]);
  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const myContacts = show === "alters" ? [] : contactRels.filter((r) => contactById[r.contact_id]);
  if (!alter) return null;
  const navigatePath = `/alter/${alterId}?tab=relationships`;
  const save = async (id, data) => {
    try {
      const row = await saveRelationship({ id, data, alters, terms: t, navigatePath });
      if (row === null) return;
      qc.invalidateQueries({ queryKey: RELATIONSHIPS_KEY });
      setEditing(null); setCreating(false);
    } catch (e) { toast.error(isLogCommandError(e) ? e.message : "Couldn't save the relationship"); }
  };
  const remove = async (r) => {
    if (!(await confirm(`Delete the relationship with ${formatAlter(r.other)}? ${TRASH_HINT}`))) return;
    await deleteRelationship(r.id);
    qc.invalidateQueries({ queryKey: RELATIONSHIPS_KEY });
  };
  const contactName = (c) => (c.nickname && c.nickname.trim()) || (c.name && c.name.trim()) || "Unnamed";
  const empty = !mine.length && !myContacts.length;
  const editors = (
    <>
      {creating && (
        <CreateRelationshipModal allAlters={alters.filter((a) => !a.is_archived || a.id === alterId)} alterA={alter} alterB={null}
          onSave={(data) => save(null, data)} onClose={() => setCreating(false)} />
      )}
      {editing && <CreateRelationshipModal rel={editing} allAlters={alters} onSave={(data) => save(editing.id, data)} onClose={() => setEditing(null)} />}
    </>
  );
  if (mode === "minimal") {
    return (
      <GardenBox empty={empty} name="Relationships" data-relationships-widget="">
        <div className="flex flex-wrap gap-[0.35em]">
          {mine.map((r) => (
            <span key={r.id} className={chipCls} style={chipStyle(r.color)} title={relationshipTypeLabel(r)}>
              <span aria-hidden="true">{relativeArrow(r.direction, r._selfIsA)}</span>
              <span className="truncate">{formatAlter(r.other)}</span>
              <span className="sr-only">({relationshipTypeLabel(r)})</span>
            </span>
          ))}
          {myContacts.map((r) => (
            <span key={r.id} className={chipCls} style={chipStyle(contactById[r.contact_id]?.color)}>{contactName(contactById[r.contact_id])}</span>
          ))}
        </div>
      </GardenBox>
    );
  }
  return (
    <GardenBox empty={false} name="Relationships" data-relationships-widget="">
      {mode === "expanded" && mine.length > 0 && <RelationshipMap self={alter} rels={mine} formatAlter={formatAlter} />}
      {mine.length > 0 && (
        <ul>
          {mine.map((r) => (
            <li key={r.id} className={`${rowCls} flex items-start gap-[0.5em]`}>
              <span className="w-[1em] text-center mt-[0.6em] opacity-70" aria-hidden="true">{relativeArrow(r.direction, r._selfIsA)}</span>
              <button type="button" onClick={() => navigate(`/alter/${r.other.id}`)} className="flex items-center gap-[0.5em] min-w-0 min-h-[44px] text-left flex-1"
                aria-label={`${relationshipTypeLabel(r)}: ${formatAlter(r.other)}. Open their profile`}>
                <AlterAvatar alter={r.other} size={28} />
                <span className="min-w-0">
                  <span className="block font-medium truncate">{formatAlter(r.other)}</span>
                  <span className="flex items-center gap-[0.35em] text-[0.8125em] opacity-75">
                    <span className="w-[0.6em] h-[0.6em] rounded-full flex-shrink-0" style={{ background: r.color || "currentColor" }} aria-hidden="true" />
                    {relationshipTypeLabel(r)}
                  </span>
                  {mode === "expanded" && r.notes && <span className="block text-[0.8125em] opacity-80 whitespace-pre-wrap break-words mt-[0.2em]">{r.notes}</span>}
                </span>
              </button>
              <button type="button" onClick={() => setEditing(r)} className={iconBtnCls} aria-label={`Edit the relationship with ${formatAlter(r.other)}`}><Pencil className="w-4 h-4" /></button>
              <button type="button" onClick={() => remove(r)} className={iconBtnCls} aria-label={`Delete the relationship with ${formatAlter(r.other)}`}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {myContacts.length > 0 && (
        <div className="mt-[0.5em]">
          <Heading>Outside the {t.system}</Heading>
          <ul>
            {myContacts.map((r) => {
              const c = contactById[r.contact_id];
              return (
                <li key={r.id} className={rowCls}>
                  <button type="button" onClick={() => navigate(`/contacts/${c.id}`)} className="w-full flex items-center gap-[0.5em] min-h-[44px] text-left"
                    aria-label={`${contactName(c)}, ${r.relationship_type || "contact"}. Open their profile`}>
                    <span className="w-[1.75em] h-[1.75em] rounded-full flex items-center justify-center text-[0.75em] font-bold flex-shrink-0" style={{ background: c.color || "var(--v2-accent)", color: "#fff" }} aria-hidden="true">{contactName(c)[0]?.toUpperCase()}</span>{/* contract-ok: initial on the contact's colour */}
                    <span className="font-medium truncate flex-1">{contactName(c)}</span>
                    <span className="text-[0.8125em] opacity-70 truncate max-w-[45%]">{r.relationship_type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[0.75em] opacity-60">Changed on the contact's profile.</p>
        </div>
      )}
      {show !== "contacts" && (
        <button type="button" onClick={() => setCreating(true)} className={`${textBtnCls} w-full border mt-[0.5em]`} style={outlineBtn}>Add relationship</button>
      )}
      {editors}
    </GardenBox>
  );
}

// ── Lineage ──────────────────────────────────────────────────────────

function LineageMap({ alter, alterMap, predecessorIds, successorIds, t }) {
  if (!predecessorIds.length && !successorIds.length) return null;
  const group = (label, ids) => (
    <div className="flex flex-col gap-[0.25em] min-w-0">
      <span className="text-[0.75em] opacity-70">{label}</span>
      <div className="flex flex-wrap gap-[0.3em]">{ids.map((id) => <AlterChip key={id} alter={alterMap[id]} />)}</div>
    </div>
  );
  const arrow = <ArrowRight className="w-[1em] h-[1em] self-end mb-[0.55em] opacity-60 flex-shrink-0" aria-hidden="true" />;
  return (
    <div className="flex items-start gap-[0.5em] flex-wrap" role="group" aria-label="Lineage">
      {predecessorIds.length > 0 && <>{group("From", predecessorIds)}{arrow}</>}
      <div className="flex flex-col gap-[0.25em]">
        <span className="text-[0.75em] opacity-70">This {t.alter}</span>
        <div><AlterChip alter={alter} emphasis /></div>
      </div>
      {successorIds.length > 0 && <>{arrow}{group("Became", successorIds)}</>}
    </div>
  );
}

function LineageEventRow({ event, alterMap, alters, detailed, onDelete }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const sources = (event.source_alter_ids || []).map((id) => alterMap[id]).filter(Boolean);
  const results = isLineageTransition(event) ? (event.result_alter_ids || []).map((id) => alterMap[id]).filter(Boolean) : [];
  const fusion = event.fusion_type === "absorption" ? "Absorption" : event.fusion_type === "new_formation" ? "New formation" : null;
  const label = LINEAGE_TYPE_LABELS[event.type] || "Event";
  const save = async (patch) => {
    try {
      const ok = await editLineageEvent(event.id, patch, { alters, terms: t });
      if (!ok) return false;
      qc.invalidateQueries({ queryKey: LINEAGE_KEY });
      return true;
    } catch (e) { toast.error(isLogCommandError(e) ? e.message : "Couldn't save the event"); return false; }
  };
  return (
    <li className={rowCls}>
      <div className="flex items-start gap-[0.4em]">
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-[0.4em]">
            <span className="font-semibold" style={{ color: "var(--v2-accent)" }}>{label}</span>
            {fusion && <span className="text-[0.8125em] opacity-70">· {fusion}</span>}
            <span className="text-[0.8125em] opacity-70 ml-auto">{lineageDateLabel(event)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-[0.3em] mt-[0.25em]">
            {sources.map((a) => <AlterChip key={a.id} alter={a} />)}
            {results.length > 0 && <ArrowRight className="w-[1em] h-[1em] opacity-60" aria-label="became" />}
            {results.map((a) => <AlterChip key={a.id} alter={a} />)}
          </div>
          {detailed && !editing && (
            <div className="text-[0.8125em] opacity-85 mt-[0.3em] space-y-[0.15em]">
              {event.what_changed && <p className="whitespace-pre-wrap"><span className="font-medium">What changed:</span> {event.what_changed}</p>}
              {event.new_name && <p><span className="font-medium">New name:</span> {event.previous_name ? `${event.previous_name} → ` : ""}{event.new_name}</p>}
              {event.cause && <p><span className="font-medium">{event.type === "reformation" ? "Trigger:" : "Cause:"}</span> {event.cause}</p>}
              {event.notes && <p className="whitespace-pre-wrap">{event.notes}</p>}
            </div>
          )}
        </div>
        {!editing && (
          <>
            <button type="button" onClick={() => setEditing(true)} className={iconBtnCls} aria-label={`Edit the ${label.toLowerCase()} from ${lineageDateLabel(event)}`}><Pencil className="w-4 h-4" /></button>
            <button type="button" onClick={() => onDelete(event)} className={iconBtnCls} aria-label={`Delete the ${label.toLowerCase()} from ${lineageDateLabel(event)}`}><Trash2 className="w-4 h-4" /></button>
          </>
        )}
      </div>
      {editing && <LineageEventEditForm event={event} alters={alters} onSave={save} onCancel={() => setEditing(false)} />}
    </li>
  );
}

export function LineageWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { alter, alterId } = useInfoAlter(settings);
  const alters = useAlters();
  const { data: events = [] } = useQuery({ queryKey: LINEAGE_KEY, queryFn: () => localEntities.SystemChangeEvent.list() });
  const [recording, setRecording] = useState(false);
  const alterMap = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const { related, predecessorIds, successorIds } = useMemo(() => lineageOf(events, alterId), [events, alterId]);
  if (!alter) return null;
  const show = settings?.show || "both";
  const showMap = mode === "minimal" || show !== "events";
  const showEvents = mode !== "minimal" && show !== "map";
  const remove = async (event) => {
    if (!(await confirm(`Delete this event? ${TRASH_HINT}`))) return;
    await deleteLineageEvent(event.id);
    qc.invalidateQueries({ queryKey: LINEAGE_KEY });
  };
  const hasMap = predecessorIds.length || successorIds.length;
  const empty = mode === "minimal" ? !hasMap : !related.length && !showEvents;
  return (
    <GardenBox empty={empty} name="Lineage" data-lineage-widget="">
      {showMap && <LineageMap alter={alter} alterMap={alterMap} predecessorIds={predecessorIds} successorIds={successorIds} t={t} />}
      {showEvents && (
        <>
          {related.length > 0 ? (
            <ul className={hasMap && showMap ? "mt-[0.5em]" : ""}>
              {related.map((e) => <LineageEventRow key={e.id} event={e} alterMap={alterMap} alters={alters} detailed={mode === "expanded"} onDelete={remove} />)}
            </ul>
          ) : <p className="text-[0.8125em] opacity-60">No lineage events yet.</p>}
          <button type="button" onClick={() => setRecording(true)} className={`${textBtnCls} w-full border mt-[0.5em]`} style={outlineBtn}>Record an event</button>
        </>
      )}
      {recording && <RecordSystemChangeModal open={recording} onClose={() => setRecording(false)} preselectedAlterIds={[alterId]} />}
    </GardenBox>
  );
}

// ── Activity links ───────────────────────────────────────────────────

export function ActivityLinksWidget({ settings, mode = "normal" }) {
  const navigate = useNavigate();
  const { alter, alterId } = useInfoAlter(settings);
  const { data: links = [] } = useQuery({ queryKey: ["alterActivityLinks"], queryFn: () => base44.entities.AlterActivityLink.list() });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: linkTypes = [] } = useQuery({ queryKey: LINK_TYPES_QUERY_KEY, queryFn: () => base44.entities.ActivityLinkType.list().catch(() => []) });
  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const wanted = Array.isArray(settings?.relations) ? settings.relations : [];
  const groups = useMemo(() => {
    const mine = links.filter((l) => l.alter_id === alterId);
    const relations = allRelations(linkTypes, { includeRemoved: true });
    const known = new Set(relations.map((r) => r.id));
    return [...relations, { id: "__other", label: "Other" }]
      .filter((r) => !wanted.length || wanted.includes(r.id) || (r.custom && wanted.includes("__custom")))
      .map((r) => ({ ...r, links: mine.filter((l) => (r.id === "__other" ? !known.has(l.relation) : l.relation === r.id))
        .sort((a, b) => clampStrength(b.strength) - clampStrength(a.strength)) }))
      .filter((r) => r.links.length);
  }, [links, linkTypes, alterId, wanted]);
  if (!alter) return null;
  const nameOf = (l) => catById[l.category_id]?.name || "Deleted activity";
  const open = (l) => navigate(`/activities?category=${encodeURIComponent(l.category_id)}`);
  return (
    <GardenBox empty={!groups.length} name="Activity links" data-activity-links-widget="">
      {groups.map((g) => (
        <div key={g.id} className="mb-[0.5em] last:mb-0">
          <Heading>{g.label}</Heading>
          {mode === "minimal" ? (
            <p>{g.links.map(nameOf).join(", ")}</p>
          ) : (
            <ul>
              {g.links.map((l) => {
                const c = catById[l.category_id];
                return (
                  <li key={l.id} className={rowCls}>
                    <button type="button" onClick={() => open(l)} className="w-full flex items-center gap-[0.5em] min-h-[44px] text-left"
                      aria-label={`${g.label}: ${nameOf(l)}, strength ${clampStrength(l.strength)} of 5. Open the activity`}>
                      <span className="w-[0.65em] h-[0.65em] rounded-full flex-shrink-0" style={{ background: c?.color || "var(--v2-accent)" }} aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{nameOf(l)}</span>
                        {mode === "expanded" && l.note && <span className="block text-[0.8125em] opacity-75 break-words">{l.note}</span>}
                      </span>
                      <span className="text-[0.8125em] opacity-70 tabular-nums" aria-hidden="true">{clampStrength(l.strength)}/5</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      {mode === "expanded" && (
        <button type="button" onClick={() => navigate("/activities")} className={`${textBtnCls} w-full border mt-[0.3em]`} style={outlineBtn}>Link an activity on the Activities page</button>
      )}
    </GardenBox>
  );
}

// ── Registry entries ─────────────────────────────────────────────────

export const GARDEN_CONNECTION_WIDGETS = {
  alter_relationships: {
    ...base, label: "Relationships", icon: Link2,
    description: "How this {{alter}} connects to other {{alters}} and to people outside. Minimal is names; Normal a list to add, edit or remove; Expanded adds a small map and notes.",
    render: ({ settings, mode }) => <RelationshipsWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "show", type: "select", label: "Shows", default: "both",
        options: [{ value: "both", label: "Both" }, { value: "alters", label: "{{Alters}}" }, { value: "contacts", label: "Contacts" }] },
    ],
  },
  alter_lineage: {
    ...base, label: "Lineage", icon: GitMerge,
    description: "Fusions, splits and other changes this {{alter}} was part of. Minimal is where they came from and what they became; Normal adds the events; Expanded their details.",
    render: ({ settings, mode }) => <LineageWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "show", type: "select", label: "Shows", default: "both",
        options: [{ value: "both", label: "Both" }, { value: "map", label: "Connections" }, { value: "events", label: "Events" }] },
    ],
  },
  alter_activity_links: {
    ...base, label: "Activity links", icon: Zap,
    description: "What this {{alter}} enjoys, needs, avoids and so on, from the Activities page. Expanded adds notes.",
    render: ({ settings, mode }) => <ActivityLinksWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 3 },
    configFields: [
      { key: "relations", type: "multi", label: "Kinds shown", default: [],
        options: [...ALTER_RELATIONS.map((r) => ({ value: r.id, label: r.label })), { value: "__custom", label: "Your own kinds" }, { value: "__other", label: "Other" }] },
    ],
  },
};
