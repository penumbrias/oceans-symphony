import React, { useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Pencil, LifeBuoy, Phone, Mail, MessageSquare, MapPin, AtSign,
  Archive, ArchiveRestore, Trash2, Pin, PinOff, ExternalLink, Plus, UserCheck, Square, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { startEncounter, endEncounterForContact, lastSeenEncounter } from "@/lib/contactEncounters";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import ContactEditModal from "@/components/contacts/ContactEditModal";
import ContactRelationshipsTab from "@/components/contacts/ContactRelationshipsTab";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import {
  getSafetyMeta, getAwarenessMeta, contactDisplayName,
  contactMethodHref, getContactMethodMeta,
} from "@/lib/contacts";
import { TRASH_HINT } from "@/lib/trashSettings";

const TABS = [
  { id: "about", label: "About" },
  { id: "relationships", label: "Relationships" },
  { id: "boundaries", label: "Boundaries & Rules" },
  { id: "notes", label: "Notes" },
  { id: "options", label: "Options" },
];

const METHOD_ICON = { phone: Phone, sms: MessageSquare, email: Mail, address: MapPin };

export default function ContactProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [tab, setTab] = useState("about");
  const [editOpen, setEditOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });

  // Keep the shared ["systemSettings"] cache an ARRAY — see the note in
  // Contacts.jsx. Returning a single object here pollutes the cache and
  // crashes other components that .find()/[0] on it.
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;
  const { data: contacts = [], isLoading } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const contact = contacts.find((c) => c.id === id) || null;

  const { data: notes = [] } = useQuery({
    queryKey: ["contactNotes", id],
    queryFn: () => base44.entities.ContactNote.filter({ contact_id: id }),
    enabled: !!id,
  });
  const { data: fieldDefs = [] } = useQuery({ queryKey: ["contactCustomFields"], queryFn: () => base44.entities.ContactCustomField.list() });
  const { data: categories = [] } = useQuery({ queryKey: ["contactCategories"], queryFn: () => base44.entities.ContactCategory.list() });
  const { data: encounters = [] } = useQuery({ queryKey: ["contactEncounters"], queryFn: () => base44.entities.ContactEncounter.list() });
  const activeEncounter = encounters.find((e) => e.contact_id === id && e.is_active) || null;
  const lastSeen = lastSeenEncounter(encounters, id);
  const [togglingWith, setTogglingWith] = useState(false);

  const toggleWith = async () => {
    setTogglingWith(true);
    try {
      if (activeEncounter) {
        await endEncounterForContact(id);
      } else {
        await startEncounter(id);
      }
      queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
    } catch (err) {
      toast.error(err?.message || "Couldn't update");
    } finally {
      setTogglingWith(false);
    }
  };

  const avatar = useResolvedAvatarUrl(contact?.avatar_url);

  if (isLoading) return <div className="max-w-2xl mx-auto px-2 py-10 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!contact) {
    return (
      <div className="max-w-2xl mx-auto px-2 py-10 text-center">
        <p className="text-sm text-muted-foreground mb-3">This contact doesn't exist (or was deleted).</p>
        <Button variant="outline" onClick={() => navigate("/contacts")}>Back to Contacts</Button>
      </div>
    );
  }

  const safety = getSafetyMeta(contact.safety, settings);
  const awareness = getAwarenessMeta(contact.awareness);
  const name = contactDisplayName(contact);
  const initial = name.trim()[0]?.toUpperCase() || "?";
  const methods = (contact.contact_methods || []).filter((m) => m.value);

  const patch = async (fields, msg) => {
    try {
      await base44.entities.Contact.update(contact.id, fields);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      if (msg) toast.success(msg);
    } catch (err) { toast.error(err?.message || "Couldn't update"); }
  };

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    // Notes render as plain text, so ~commands become "icon label" tokens.
    let prepared;
    try {
      prepared = await prepareAuthoredText(text, { alters, terms, surfaceLabel: "contact note", chips: false });
    } catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
    if (prepared === null) return; // user backed out of the whisper warning
    try {
      const row = await base44.entities.ContactNote.create({ contact_id: id, content: prepared.content, author_alter_ids: prepared.authorIds, timestamp: new Date().toISOString() });
      await recordAuthoredText({ ...prepared, alters, sourceType: "contact", sourceId: row.id, sourceLabel: "Contact note", navigatePath: `/contacts/${id}` });
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["contactNotes", id] });
    } catch (err) { toast.error(err?.message || "Couldn't save note"); }
  };

  const deleteNote = async (noteId) => {
    if (!(await confirm({ title: "Delete this note?", body: TRASH_HINT, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await base44.entities.ContactNote.delete(noteId);
      queryClient.invalidateQueries({ queryKey: ["contactNotes", id] });
    } catch (err) { toast.error(err?.message || "Couldn't delete note"); }
  };

  const saveNote = async (noteId, text, timestamp) => {
    let prepared;
    try {
      prepared = await prepareAuthoredText(text, { alters, terms, surfaceLabel: "contact note", chips: false });
    } catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return false; } throw e; }
    if (prepared === null) return false; // user backed out of the whisper warning
    try {
      await base44.entities.ContactNote.update(noteId, { content: prepared.content, author_alter_ids: prepared.authorIds, timestamp });
      await recordAuthoredText({ ...prepared, alters, sourceType: "contact", sourceId: noteId, sourceLabel: "Contact note", navigatePath: `/contacts/${id}` });
      queryClient.invalidateQueries({ queryKey: ["contactNotes", id] });
      toast.success("Note updated");
      return true;
    } catch (err) { toast.error(err?.message || "Couldn't update note"); return false; }
  };

  const handleDelete = async () => {
    if (!(await confirm(`Delete ${name}? ${TRASH_HINT} (Tip: "Archive" hides them without deleting.)`))) return;
    try {
      await base44.entities.Contact.delete(contact.id);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
      navigate("/contacts");
    } catch (err) { toast.error(err?.message || "Couldn't delete"); }
  };

  const sortedNotes = [...notes].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  return (
    <div className="max-w-2xl mx-auto px-1 pb-12">
      <div className="flex items-center justify-between pt-1 mb-3">
        <button type="button" onClick={() => navigate("/contacts")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Contacts
        </button>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} aria-label="Edit" title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl text-white flex-shrink-0 relative" style={{ backgroundColor: contact.color || "#8b5cf6" }}>
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initial}
          <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background" style={{ backgroundColor: safety.color }} title={safety.label} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold truncate">{name}</h1>
            {contact.is_emergency_support && <LifeBuoy className="w-4 h-4 text-rose-500 flex-shrink-0" />}
          </div>
          {contact.relationship_label && <p className="text-sm text-muted-foreground truncate">{contact.relationship_label}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[0.6875rem] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: safety.color }}>{safety.label}</span>
            <span className="text-[0.6875rem] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{awareness.label} we're a system</span>
            {(contact.category_ids || [])
              .map((cid) => categories.find((c) => c.id === cid))
              .filter(Boolean)
              .map((cat) => (
                <span key={cat.id} className="text-[0.6875rem] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cat.color || "#8b5cf6" }}>
                  {cat.name}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Contact methods */}
      {methods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {methods.map((m, i) => {
            const meta = getContactMethodMeta(m.type);
            const Icon = METHOD_ICON[m.type] || AtSign;
            const href = contactMethodHref(m);
            const inner = (
              <>
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{m.label || m.value}</span>
                {href && <ExternalLink className="w-3 h-3 opacity-60" />}
              </>
            );
            const cls = "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border/60 bg-card";
            return href ? (
              <a key={i} href={href} className={`${cls} hover:bg-muted/40`} title={`${meta.label}: ${m.value}`}>{inner}</a>
            ) : (
              <span key={i} className={cls} title={`${meta.label}: ${m.value}`}>{inner}</span>
            );
          })}
        </div>
      )}

      {/* I'm with them — active encounter toggle */}
      <div className="mb-4">
        <button
          type="button"
          onClick={toggleWith}
          disabled={togglingWith}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            activeEncounter
              ? "border-sky-400/50 bg-sky-500/10 text-sky-600 dark:text-sky-400"
              : "border-border/60 hover:bg-muted/40"
          }`}
        >
          {activeEncounter ? (
            <>
              <Square className="w-4 h-4" /> End — with them since {formatDistanceToNow(new Date(activeEncounter.start_time))}
            </>
          ) : (
            <>
              <UserCheck className="w-4 h-4" /> I'm with them
            </>
          )}
        </button>
        {!activeEncounter && lastSeen && (
          <p className="text-[0.6875rem] text-muted-foreground text-center mt-1.5">
            Last together {formatDistanceToNow(new Date(lastSeen.end_time))} ago
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50 mb-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "about" && (
        <div className="space-y-4">
          <Field label="About" value={contact.about} empty="No description yet." />
          <Field label="Safe to share" value={contact.safe_to_share} empty="Nothing noted about what's safe to share." />
          {[...fieldDefs]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""))
            .filter((def) => contact.custom_fields && String(contact.custom_fields[def.id] ?? "").trim() !== "")
            .map((def) => (
              <Field key={def.id} label={def.name} value={contact.custom_fields[def.id]} empty="" />
            ))}
        </div>
      )}

      {tab === "relationships" && <ContactRelationshipsTab contact={contact} />}

      {tab === "boundaries" && (
        <div className="space-y-4">
          <Field label="Boundaries" value={contact.boundaries} empty="No boundaries noted." />
          <Field label="System rules" value={contact.system_rules} empty="No system-wide rules noted." />
          <p className="text-xs text-muted-foreground italic">Per-alter and per-group boundaries are coming in a later update.</p>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <MentionTextarea
              value={newNote}
              onChange={setNewNote}
              alters={alters}
              signposts
              placeholder="Add a note (what happened, something to remember)…"
              rows={2}
              className="flex-1 bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm resize-y outline-none"
            />
            <Button size="sm" onClick={addNote} disabled={!newNote.trim()} className="gap-1 mt-0.5"><Plus className="w-4 h-4" /></Button>
          </div>
          {sortedNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedNotes.map((n) => (
                <NoteRow key={n.id} note={n} alters={alters} onDelete={deleteNote} onSave={saveNote} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "options" && (
        <div className="space-y-2">
          <OptionRow
            icon={contact.is_pinned ? PinOff : Pin}
            label={contact.is_pinned ? "Unpin from top" : "Pin to top"}
            onClick={() => patch({ is_pinned: !contact.is_pinned }, contact.is_pinned ? "Unpinned" : "Pinned")}
          />
          <OptionRow
            icon={contact.is_archived ? ArchiveRestore : Archive}
            label={contact.is_archived ? "Unarchive" : "Archive (hide without deleting)"}
            onClick={() => patch({ is_archived: !contact.is_archived }, contact.is_archived ? "Unarchived" : "Archived")}
          />
          <OptionRow icon={Trash2} label="Delete" danger onClick={handleDelete} />
        </div>
      )}

      <ContactEditModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
    </div>
  );
}

// ISO string -> value for <input type="datetime-local"> (local time).
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// One contact note: view, or edit text + date/time in place.
function NoteRow({ note, alters, onDelete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content || "");
  const [when, setWhen] = useState(toLocalInput(note.timestamp));
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setText(note.content || ""); setWhen(toLocalInput(note.timestamp)); setEditing(true); };
  const save = async () => {
    const content = text.trim();
    const d = new Date(when);
    if (!content) { toast.error("A note can't be empty"); return; }
    if (!when || isNaN(d.getTime())) { toast.error("Pick a valid date and time"); return; }
    setSaving(true);
    const ok = await onSave(note.id, content, d.toISOString());
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/40 bg-card p-2.5 space-y-2">
        <MentionTextarea value={text} onChange={setText} alters={alters} signposts rows={3} autoFocus
          className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm resize-y outline-none" />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
          aria-label="Note date and time"
          className="bg-background border border-input rounded-lg px-2 py-1 text-xs outline-none" />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="gap-1"><X className="w-3.5 h-3.5" />Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !text.trim()} className="gap-1"><Check className="w-3.5 h-3.5" />Save</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/50 bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap flex-1">{note.content}</p>
        <button type="button" onClick={startEdit} aria-label="Edit note" className="text-muted-foreground hover:text-foreground flex-shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => onDelete(note.id)} aria-label="Delete note" className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-[0.625rem] text-muted-foreground mt-1">{note.timestamp ? new Date(note.timestamp).toLocaleString() : ""}</p>
    </div>
  );
}

function Field({ label, value, empty }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</h3>
      {value ? (
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground/70 italic">{empty}</p>
      )}
    </div>
  );
}

function OptionRow({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/50 text-sm text-left hover:bg-muted/30 transition-colors ${danger ? "text-destructive" : ""}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" /> {label}
    </button>
  );
}
