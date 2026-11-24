// Contacts in the pixel look — the "Contacts" desktop board: the people
// list down the left (search, safety chips, category, sort, "who can I ask
// for help?") and the chosen person's profile board on the right, under a
// header panel. On a phone the list comes first and a person opens on their
// own page. Rendering only: the filters are Contacts.jsx's state, the
// profile is ContactProfile (embedded), and every edit goes through the
// existing modals.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Tag, FolderOpen, Phone, MessageSquare } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { usePixelDesk } from "@/lib/uiLook";
import { getSafetyMeta, contactDisplayName, contactMethodHref } from "@/lib/contacts";
import { pictureStyle } from "@/lib/imageFraming";
import EmergencyCardLink from "@/components/emergency/EmergencyCardLink";
import ContactProfile from "@/pages/ContactProfile";
import { PxPanel, useDeskHeight } from "@/components/pixel/PxDesk";
import "@/styles/pixel/groups.css";

const SORT_LABEL = { name: "Name", safety: "Safety", recent: "Newest" };

function PersonRow({ contact, settings, selected, onClick }) {
  const avatar = useResolvedAvatarUrl(contact.avatar_url);
  const safety = getSafetyMeta(contact.safety, settings);
  const name = contactDisplayName(contact);
  return (
    <button type="button" className={`pg-person${selected ? " sel" : ""}`} onClick={onClick}
      data-highlight-id={contact.id} aria-current={selected ? "true" : undefined}>
      <span className="pg-av" style={{ backgroundColor: contact.color || undefined }}>
        {avatar ? <img src={avatar} alt="" style={pictureStyle(contact, contact.avatar_url)} /> : (name.trim()[0]?.toUpperCase() || "?")}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{name}</span>
        <span className="sub truncate">{contact.relationship_label || safety.label}</span>
      </span>
      <span className="pg-safe" style={{ backgroundColor: safety.color }} title={safety.label} aria-label={safety.label} />
    </button>
  );
}

// "Who can I ask for help?" — the emergency-support people, each a tap to
// open, with a call / text link where they have one.
function AskForHelp({ people, settings, onOpen }) {
  if (!people.length) return null;
  return (
    <div className="pg-ask pg-sunk">
      <span className="q">Who can I ask for help?</span>
      {people.map((c, i) => {
        const methods = c.contact_methods || [];
        const phone = methods.find((m) => m.type === "phone" && m.value);
        const sms = methods.find((m) => m.type === "sms" && m.value) || phone;
        return (
          <span key={c.id} className="inline-flex items-center gap-1 mr-1">
            <button type="button" onClick={() => onOpen(c.id)}>{contactDisplayName(c)} ({getSafetyMeta(c.safety, settings).label.toLowerCase()})</button>
            {phone && <a href={contactMethodHref(phone)} aria-label={`Call ${contactDisplayName(c)}`} title="Call" className="inline-flex p-0.5"><Phone className="w-3 h-3" /></a>}
            {sms && <a href={contactMethodHref({ ...sms, type: "sms" })} aria-label={`Text ${contactDisplayName(c)}`} title="Text" className="inline-flex p-0.5"><MessageSquare className="w-3 h-3" /></a>}
            {i < people.length - 1 && <span aria-hidden="true">·</span>}
          </span>
        );
      })}
    </div>
  );
}

export default function ContactsPixelDesk({
  list, total, emergency, settings, safetyLevels, categories, isLoading,
  search, setSearch, safetyFilter, setSafetyFilter, categoryFilter, setCategoryFilter, sortMode, setSortMode,
  onAdd, onLabels, onCategories,
}) {
  const navigate = useNavigate();
  const desk = usePixelDesk();
  const [deskRef, height] = useDeskHeight();
  const [selId, setSelId] = useState(null);
  const selected = list.find((c) => c.id === selId) || null;
  useEffect(() => {
    if (desk && !selected && list.length) setSelId(list[0].id);
  }, [desk, selected, list]);

  const open = (id) => (desk ? setSelId(id) : navigate(`/contacts/${id}`));
  const catName = categoryFilter === "all" ? "All" : (categories.find((c) => c.id === categoryFilter)?.name || "All");

  const side = (
    <PxPanel as="aside" className="pg-side" title="Contacts"
      actions={<>
        <button type="button" className="pg-btn sm" onClick={onAdd}>+ contact</button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="pg-btn sm" aria-label="More for contacts"><MoreHorizontal className="w-3.5 h-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 z-[60]">
            <DropdownMenuItem onSelect={onLabels} className="gap-2 cursor-pointer"><Tag className="w-4 h-4" /> Safety labels</DropdownMenuItem>
            <DropdownMenuItem onSelect={onCategories} className="gap-2 cursor-pointer"><FolderOpen className="w-4 h-4" /> {categories.length ? "Categories" : "Add categories"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>}>
      <div className="pg-pad">
        <label className="pg-input">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" aria-label="Search contacts" />
        </label>
      </div>
      <div className="pg-chips" style={{ padding: "0 6px 8px" }} role="group" aria-label="Safety">
        <button type="button" className={`pg-chip${safetyFilter === "all" ? " on" : ""}`} aria-pressed={safetyFilter === "all"} onClick={() => setSafetyFilter("all")}>
          <span className="pg-sq" style={{ width: 9, height: 9 }} /> All
        </button>
        {safetyLevels.map((lvl) => (
          <button key={lvl.key} type="button" className={`pg-chip${safetyFilter === lvl.key ? " on" : ""}`} aria-pressed={safetyFilter === lvl.key}
            onClick={() => setSafetyFilter(lvl.key)}>
            <span className="pg-sq" style={{ width: 9, height: 9, background: lvl.color }} /> {lvl.label}
          </button>
        ))}
      </div>
      <div className="pg-filterrow">
        <span>Category</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="pg-btn sm" aria-label={`Category: ${catName}`}>{catName}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 z-[60] max-h-[50vh] overflow-y-auto">
            <DropdownMenuItem onSelect={() => setCategoryFilter("all")} className="cursor-pointer">All</DropdownMenuItem>
            {categories.map((cat) => (
              <DropdownMenuItem key={cat.id} onSelect={() => setCategoryFilter(cat.id)} className="gap-2 cursor-pointer">
                <span className="w-2.5 h-2.5" style={{ backgroundColor: cat.color || undefined }} /> {cat.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCategories} className="gap-2 cursor-pointer"><FolderOpen className="w-4 h-4" /> {categories.length ? "Manage categories" : "Add categories"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <span>Sort</span>
        <button type="button" className="pg-btn sm" title="Change sort"
          onClick={() => setSortMode((m) => (m === "name" ? "safety" : m === "safety" ? "recent" : "name"))}>
          {SORT_LABEL[sortMode]}
        </button>
      </div>
      <AskForHelp people={emergency} settings={settings} onOpen={open} />
      <div className="pg-person-list">
        {isLoading ? <p className="pg-empty">Loading…</p>
          : list.length === 0 ? (
            <p className="pg-empty">
              {total === 0 ? "No contacts yet. Add the people you know outside — who's safe, your boundaries, and who to reach in a crisis." : "No contacts match."}
            </p>
          ) : list.map((c) => (
            <PersonRow key={c.id} contact={c} settings={settings} selected={desk && selected?.id === c.id} onClick={() => open(c.id)} />
          ))}
      </div>
      <div className="pg-pad" style={{ flex: "none" }}><EmergencyCardLink /></div>
    </PxPanel>
  );

  if (!desk) return <div className="pg-phone">{side}</div>;

  return (
    <div ref={deskRef} className="pg-desk contacts" style={height ? { height } : undefined}>
      {side}
      {selected ? (
        <ContactProfile key={selected.id} contactId={selected.id} embedded />
      ) : (
        <PxPanel className="pg-main" title="Contacts">
          <div className="pg-text mut">
            {total === 0 ? <button type="button" className="pg-btn" onClick={onAdd}>+ Add your first contact</button> : "Pick someone on the left."}
          </div>
        </PxPanel>
      )}
    </div>
  );
}
