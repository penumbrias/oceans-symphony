// The new contact profile's widgets (v0.308.0): Identity, Time together,
// Ways to reach them, Details and Notes for a contact's page.
//
// Built the same way as the alter and group widgets: they show the contact
// and never own its data (the record is edited in ContactEditModal, time
// together through src/lib/contactEncounters.js, notes through
// src/lib/contactNotes.js); Minimal / Normal / Expanded where that means
// something; ONE box (GardenBox); em text; 44px targets; nothing on the
// page when there's nothing to show.

import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { LifeBuoy, Phone, Mail, MessageSquare, MapPin, AtSign, ExternalLink, UserCheck, Square, IdCard, Clock, Contact as ContactIcon, AlignLeft, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useBoardSubject } from "@/lib/boardSubject";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { startEncounter, endEncounterForContact, lastSeenEncounter } from "@/lib/contactEncounters";
import { getSafetyMeta, getAwarenessMeta, contactDisplayName, contactMethodHref, getContactMethodMeta } from "@/lib/contacts";
import { contactNotesKey, listContactNotes, saveContactNote, deleteContactNote } from "@/lib/contactNotes";
import {
  GardenBox, Heading, chipCls, chipStyle, MODES, NotesList, formatSpan, RANGE_DAYS,
} from "@/v2/gardenProfileWidgets";

// The contact whose page this is. Same ["contacts"] query every contact
// surface reads.
export function useSubjectContact() {
  const subject = useBoardSubject();
  const id = subject?.type === "contact" ? subject.id : null;
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled: !!id });
  if (!id) return null;
  return contacts.find((c) => String(c.id) === String(id)) || null;
}

const useSettings = () => (useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() }).data || [])[0] || null;
const useEncounters = () => useQuery({ queryKey: ["contactEncounters"], queryFn: () => base44.entities.ContactEncounter.list() }).data || [];

const AVATAR_RADIUS = { circle: "9999px", rounded: "22%", square: "6%" };
const METHOD_ICON = { phone: Phone, sms: MessageSquare, email: Mail, address: MapPin };

// ── Identity ─────────────────────────────────────────────────────────

export function ContactIdentityWidget({ settings, mode = "normal" }) {
  const t = useTerms();
  const contact = useSubjectContact();
  const appSettings = useSettings();
  const { data: categories = [] } = useQuery({ queryKey: ["contactCategories"], queryFn: () => base44.entities.ContactCategory.list() });
  const avatar = useResolvedAvatarUrl(contact?.avatar_url);
  if (!contact) return null;
  const minimal = mode === "minimal";
  const expanded = mode === "expanded";
  const center = settings?.align === "center";
  const size = Math.max(32, Math.min(200, Number(settings?.avatarSize) || 72));
  const name = contactDisplayName(contact);
  const safety = getSafetyMeta(contact.safety, appSettings);
  const awareness = getAwarenessMeta(contact.awareness);
  const cats = (contact.category_ids || []).map((cid) => categories.find((c) => c.id === cid)).filter(Boolean);
  return (
    <GardenBox data-contact-identity-widget="" data-mode={mode}>
      <div className={`flex gap-[0.9em] ${center ? "flex-col items-center text-center" : "items-start"}`}>
        {settings?.showAvatar !== false && (
          <div className="overflow-hidden flex-shrink-0 flex items-center justify-center text-white" // contract-ok: initial on the contact's colour
            style={{ width: size, height: size, borderRadius: AVATAR_RADIUS[settings?.avatarShape] || AVATAR_RADIUS.circle, backgroundColor: contact.color || "#8b5cf6", fontSize: size * 0.4 }}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span aria-hidden="true">{name.trim()[0]?.toUpperCase() || "?"}</span>}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-[0.25em]">
          <h2 className="font-display text-[1.5em] font-semibold leading-tight break-words">
            {name}
            {contact.is_emergency_support && <LifeBuoy className="inline w-[0.7em] h-[0.7em] ml-[0.3em] align-baseline text-rose-500" aria-label="Emergency support" />}
          </h2>
          {!minimal && contact.relationship_label && <p className="opacity-80">{contact.relationship_label}</p>}
          {!minimal && (
            <div className={`flex flex-wrap gap-[0.4em] ${center ? "justify-center" : ""}`}>
              <span className={chipCls} style={chipStyle(safety.color)}>
                <span className="w-[0.6em] h-[0.6em] rounded-full flex-shrink-0" style={{ background: safety.color }} aria-hidden="true" />{safety.label}
              </span>
              {expanded && <span className={chipCls} style={chipStyle(null)}>{awareness.label} we're a {t.system}</span>}
              {cats.map((c) => <span key={c.id} className={chipCls} style={chipStyle(c.color || "#8b5cf6")}>{c.name}</span>)}
            </div>
          )}
        </div>
      </div>
    </GardenBox>
  );
}

// ── Time together ────────────────────────────────────────────────────

const spanOf = (e, now) => {
  const a = new Date(e.start_time).getTime();
  const b = e.end_time ? new Date(e.end_time).getTime() : (e.is_active ? now : a);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, Math.max(a, b)] : null;
};

export function ContactTogetherWidget({ settings, mode = "normal" }) {
  const qc = useQueryClient();
  const contact = useSubjectContact();
  const encounters = useEncounters();
  const [busy, setBusy] = React.useState(false);
  const mine = useMemo(() => (contact ? encounters.filter((e) => e.contact_id === contact.id) : []), [encounters, contact]);
  if (!contact) return null;
  const active = mine.find((e) => e.is_active) || null;
  const last = lastSeenEncounter(encounters, contact.id);
  const days = RANGE_DAYS[settings?.range] ?? (settings?.range === "all" ? 0 : 30);
  const now = Date.now();
  const from = days ? now - days * 86400000 : -Infinity;
  let total = 0; let times = 0;
  for (const e of mine) {
    const s = spanOf(e, now);
    if (!s || s[1] < from) continue;
    times += 1;
    total += s[1] - Math.max(s[0], from);
  }
  const recent = [...mine].sort((a, b) => (b.start_time || "").localeCompare(a.start_time || "")).slice(0, Math.max(1, Number(settings?.count) || 5));
  const toggle = async () => {
    setBusy(true);
    try {
      if (active) await endEncounterForContact(contact.id);
      else await startEncounter(contact.id);
      qc.invalidateQueries({ queryKey: ["contactEncounters"] });
    } catch (e) { toast.error(e?.message || "Couldn't update"); }
    finally { setBusy(false); }
  };
  const ago = (iso) => { try { return formatDistanceToNow(new Date(iso)); } catch { return ""; } };
  return (
    <GardenBox data-contact-together-widget="" data-mode={mode}>
      <div className="space-y-[0.6em]">
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={!!active}
          className="w-full min-h-[2.75em] flex items-center justify-center gap-[0.5em] rounded-xl border font-medium disabled:opacity-60"
          style={active
            ? { background: "color-mix(in srgb, var(--v2-accent) 15%, transparent)", borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" }
            : { borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
          {active
            ? <><Square className="w-[1em] h-[1em]" aria-hidden="true" /> End — with them since {ago(active.start_time)}</>
            : <><UserCheck className="w-[1em] h-[1em]" aria-hidden="true" /> I'm with them</>}
        </button>
        {!active && last && <p className="text-[0.8125em] opacity-70 text-center">Last together {ago(last.end_time)} ago</p>}
        {mode !== "minimal" && times > 0 && (
          <p className="text-[0.875em]">
            <span className="font-semibold tabular-nums">{formatSpan(total)}</span>
            <span className="opacity-70"> together over {times} {times === 1 ? "time" : "times"}, {days ? `the last ${days} days` : "all time"}</span>
          </p>
        )}
        {mode === "expanded" && recent.length > 0 && (
          <div>
            <Heading>Recently</Heading>
            <ul>
              {recent.map((e) => {
                const s = spanOf(e, now);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-[0.3em] border-b border-current/10 last:border-b-0 text-[0.875em]">
                    <span>{new Date(e.start_time).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                    <span className="opacity-70 tabular-nums">{e.is_active ? "now" : e.kind === "visit" || !s || s[1] === s[0] ? "saw them" : formatSpan(s[1] - s[0])}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </GardenBox>
  );
}

// ── Ways to reach them ───────────────────────────────────────────────

export function ContactReachWidget({ mode = "normal" }) {
  const contact = useSubjectContact();
  if (!contact) return null;
  const methods = (contact.contact_methods || []).filter((m) => m.value);
  return (
    <GardenBox empty={!methods.length} name="Ways to reach them" data-contact-reach-widget="">
      <ul className={mode === "expanded" ? "" : "flex flex-wrap gap-[0.4em]"} aria-label="Ways to reach them">
        {methods.map((m, i) => {
          const meta = getContactMethodMeta(m.type);
          const Icon = METHOD_ICON[m.type] || AtSign;
          const href = contactMethodHref(m);
          const label = `${meta.label}: ${m.label ? `${m.label}, ` : ""}${m.value}`;
          const body = mode === "minimal"
            ? <Icon className="w-[1.1em] h-[1.1em]" aria-hidden="true" />
            : mode === "expanded"
              ? <><Icon className="w-[1.1em] h-[1.1em] flex-shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-[0.75em] opacity-70">{m.label || meta.label}</span><span className="block break-all">{m.value}</span></span>{href && <ExternalLink className="w-[0.9em] h-[0.9em] opacity-60 flex-shrink-0" aria-hidden="true" />}</>
              : <><Icon className="w-[1em] h-[1em] flex-shrink-0" aria-hidden="true" /><span className="truncate max-w-[14em]">{m.label || m.value}</span>{href && <ExternalLink className="w-[0.8em] h-[0.8em] opacity-60" aria-hidden="true" />}</>;
          const cls = mode === "expanded"
            ? "flex items-center gap-[0.6em] min-h-[2.75em] py-[0.3em] w-full text-left"
            : mode === "minimal"
              ? "w-11 h-11 rounded-full flex items-center justify-center border"
              : `${chipCls} min-h-[2.75em]`;
          const style = mode === "expanded" ? undefined : mode === "minimal" ? { borderColor: "color-mix(in srgb, currentColor 25%, transparent)" } : chipStyle(null);
          return (
            <li key={i} className={mode === "expanded" ? "border-b border-current/10 last:border-b-0" : ""}>
              {href
                ? <a href={href} className={cls} style={style} aria-label={label} title={label}>{body}</a>
                : <span className={cls} style={style} aria-label={label} title={label}>{body}</span>}
            </li>
          );
        })}
      </ul>
    </GardenBox>
  );
}

// ── Details ──────────────────────────────────────────────────────────

const BUILT_IN = [
  { id: "about", label: () => "About" },
  { id: "safe_to_share", label: () => "Safe to share" },
  { id: "boundaries", label: () => "Boundaries" },
  { id: "system_rules", label: (t) => `${t.System} rules` },
];
export const CONTACT_DETAIL_DEFAULT = ["about", "safe_to_share", "*custom"];

export function ContactDetailsWidget({ settings }) {
  const t = useTerms();
  const contact = useSubjectContact();
  const { data: fieldDefs = [] } = useQuery({ queryKey: ["contactCustomFields"], queryFn: () => base44.entities.ContactCustomField.list() });
  if (!contact) return null;
  const ids = Array.isArray(settings?.entries) && settings.entries.length ? settings.entries : CONTACT_DETAIL_DEFAULT;
  const custom = [...fieldDefs]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""))
    .map((def) => ({ id: `field:${def.id}`, label: def.name, value: contact.custom_fields?.[def.id] }));
  const rows = [];
  for (const id of ids) {
    if (id === "*custom") rows.push(...custom.filter((c) => !ids.includes(c.id)));
    else if (id.startsWith("field:")) { const c = custom.find((x) => x.id === id); if (c) rows.push(c); }
    else { const b = BUILT_IN.find((x) => x.id === id); if (b) rows.push({ id, label: b.label(t), value: contact[id] }); }
  }
  const shown = rows.filter((r) => String(r.value ?? "").trim() !== "");
  const plain = settings?.layout === "plain";
  return (
    <GardenBox empty={!shown.length} name="Details" data-contact-details-widget="">
      <div className="space-y-[0.8em]">
        {shown.map((r) => (
          <section key={r.id} aria-label={plain ? r.label : undefined}>
            {!plain && <Heading>{r.label}</Heading>}
            <p className="whitespace-pre-wrap break-words">{String(r.value)}</p>
          </section>
        ))}
      </div>
    </GardenBox>
  );
}

// ── Notes ────────────────────────────────────────────────────────────

export const CONTACT_NOTES_SOURCE = {
  key: contactNotesKey,
  list: listContactNotes,
  save: ({ ownerId, noteId, text, alters, terms }) => saveContactNote({ contactId: ownerId, noteId, text, alters, terms }),
  remove: deleteContactNote,
  dateOf: (n) => n.timestamp || n.created_date,
};

export function ContactNotesWidget({ settings, mode = "normal" }) {
  const contact = useSubjectContact();
  if (!contact) return null;
  return <NotesList source={CONTACT_NOTES_SOURCE} ownerId={contact.id} settings={settings} mode={mode} />;
}

// ── Registry ─────────────────────────────────────────────────────────

const base = { category: "profile", subjects: ["contact"], supportsMultiInstance: true, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 40 } };

export const GARDEN_CONTACT_WIDGETS = {
  contact_identity: {
    ...base, label: "Contact identity", icon: IdCard,
    description: "Their picture and name; Normal adds how you know them, how safe they are and their categories, Expanded whether they know you're a {{system}}.",
    render: ({ settings, mode }) => <ContactIdentityWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "showAvatar", type: "toggle", label: "Show the picture", default: true },
      { key: "avatarShape", type: "select", label: "Picture shape", default: "circle",
        options: [{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
      { key: "avatarSize", type: "number", label: "Picture size", min: 32, max: 200, default: 72, unit: "px" },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Beside" }, { value: "center", label: "Centred" }] },
    ],
  },
  contact_together: {
    ...base, label: "Time together", icon: Clock,
    description: "\"I'm with them\" and when you were last together; Normal adds the time together, Expanded the recent times.",
    render: ({ settings, mode }) => <ContactTogetherWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "range", type: "select", label: "Time range", default: "30",
        options: [{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "A year" }, { value: "all", label: "All time" }] },
      { key: "count", type: "number", label: "How many recent times", min: 1, max: 50, default: 5 },
    ],
  },
  contact_reach: {
    ...base, label: "Ways to reach them", icon: ContactIcon,
    description: "Phone, text, email and address — tap one to use it. Minimal is just the icons, Expanded shows each in full.",
    render: ({ mode }) => <ContactReachWidget mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 1 },
  },
  contact_details: {
    ...base, label: "Contact details", icon: AlignLeft,
    description: "About them, what's safe to share, boundaries, {{system}} rules and your own contact fields — pick which.",
    render: ({ settings }) => <ContactDetailsWidget settings={settings} />,
    supportsModes: ["normal"], defaultSpan: { cols: 12, rows: 2 },
    configFields: [
      { key: "entries", type: "multi", label: "Shows", default: CONTACT_DETAIL_DEFAULT,
        options: [
          { value: "about", label: "About" }, { value: "safe_to_share", label: "Safe to share" },
          { value: "boundaries", label: "Boundaries" }, { value: "system_rules", label: "{{System}} rules" },
          { value: "*custom", label: "Your contact fields" },
        ] },
      { key: "layout", type: "select", label: "Labels", default: "labelled",
        options: [{ value: "labelled", label: "With labels" }, { value: "plain", label: "Just the text" }] },
    ],
  },
  contact_notes: {
    ...base, label: "Contact notes", icon: FileText,
    description: "Notes about this person: the latest, or a list you can edit; Expanded adds a box to write a new one.",
    render: ({ settings, mode }) => <ContactNotesWidget settings={settings} mode={mode} />,
    supportsModes: MODES, defaultSpan: { cols: 12, rows: 4 },
    configFields: [
      { key: "sort", type: "select", label: "Order", default: "newest",
        options: [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }] },
      { key: "count", type: "number", label: "How many to show", min: 1, max: 50, default: 5 },
    ],
  },
};
