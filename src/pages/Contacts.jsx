import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Search, LifeBuoy, Phone, Mail, MessageSquare, Users, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import ContactEditModal from "@/components/contacts/ContactEditModal";
import ContactSafetyLabelsModal from "@/components/contacts/ContactSafetyLabelsModal";
import ContactCategoriesModal from "@/components/contacts/ContactCategoriesModal";
import { FolderOpen } from "lucide-react";
import {
  getSafetyMeta,
  getSafetyLevels,
  safetyRank,
  contactDisplayName,
  contactMethodHref,
  emergencySupportContacts,
} from "@/lib/contacts";

// Contacts — the directory of people OUTSIDE the system. Search, filter by
// safety, an emergency-support header for quick "who can I ask for help?",
// and tap-through to each contact's profile. See contacts-feature-plan (memory).
export default function Contacts() {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [safetyFilter, setSafetyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortMode, setSortMode] = useState("name"); // "name" | "safety" | "recent"

  // IMPORTANT: keep the ["systemSettings"] cache an ARRAY — many other
  // components share this exact query key and call .find()/[0] on it. A
  // queryFn that returns a single object here pollutes the shared cache and
  // crashes those components ("t.find is not a function"). Fetch the list and
  // derive [0] locally instead.
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });
  const { data: categories = [] } = useQuery({ queryKey: ["contactCategories"], queryFn: () => base44.entities.ContactCategory.list() });
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "")),
    [categories]
  );

  const active = useMemo(() => contacts.filter((c) => !c.is_archived), [contacts]);
  const safetyLevels = getSafetyLevels(settings);
  const emergency = useMemo(() => emergencySupportContacts(active), [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = active;
    if (safetyFilter !== "all") list = list.filter((c) => (c.safety || "unknown") === safetyFilter);
    if (categoryFilter !== "all") list = list.filter((c) => Array.isArray(c.category_ids) && c.category_ids.includes(categoryFilter));
    if (q) {
      list = list.filter((c) => {
        const hay = [
          c.name, c.nickname, c.relationship_label,
          ...(c.contact_methods || []).map((m) => m.value),
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    const sorted = [...list];
    if (sortMode === "name") sorted.sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)));
    else if (sortMode === "safety") sorted.sort((a, b) => safetyRank(a.safety) - safetyRank(b.safety) || contactDisplayName(a).localeCompare(contactDisplayName(b)));
    else if (sortMode === "recent") sorted.sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));
    // Pinned float to top within the chosen sort.
    sorted.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    return sorted;
  }, [active, search, safetyFilter, categoryFilter, sortMode]);

  return (
    <div className="max-w-3xl mx-auto px-1 pb-10">
      <div className="flex items-center justify-between gap-2 mb-3 pt-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Contacts
        </h1>
        <Button size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 rounded-full">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {/* Emergency support — quick "who can I ask for help?" */}
      {emergency.length > 0 && (
        <div className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 mb-2">
            <LifeBuoy className="w-4 h-4" /> Emergency support
          </div>
          <div className="space-y-1.5">
            {emergency.map((c) => (
              <EmergencyRow key={c.id} contact={c} onOpen={() => navigate(`/contacts/${c.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Search + sort */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1 bg-card border border-border/60 rounded-full px-3 h-9">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent outline-none text-sm min-w-0"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortMode((m) => (m === "name" ? "safety" : m === "safety" ? "recent" : "name"))}
          className="h-9 px-2.5 rounded-full border border-border/60 text-xs text-muted-foreground inline-flex items-center gap-1 flex-shrink-0"
          title="Change sort"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortMode === "name" ? "A–Z" : sortMode === "safety" ? "Safety" : "Newest"}
        </button>
      </div>

      {/* Safety filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip active={safetyFilter === "all"} onClick={() => setSafetyFilter("all")}>All</FilterChip>
        {safetyLevels.map((lvl) => (
          <FilterChip key={lvl.key} active={safetyFilter === lvl.key} color={lvl.color} onClick={() => setSafetyFilter(lvl.key)}>
            {lvl.label}
          </FilterChip>
        ))}
        <button
          type="button"
          onClick={() => setLabelsOpen(true)}
          className="text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50 inline-flex items-center gap-1 ml-auto"
          title="Rename / recolour safety labels"
        >
          <SlidersHorizontal className="w-3 h-3" /> Labels
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>All</FilterChip>
        {sortedCategories.map((cat) => (
          <FilterChip key={cat.id} active={categoryFilter === cat.id} color={cat.color} onClick={() => setCategoryFilter(cat.id)}>
            {cat.name}
          </FilterChip>
        ))}
        <button
          type="button"
          onClick={() => setCategoriesOpen(true)}
          className="text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50 inline-flex items-center gap-1 ml-auto"
          title="Manage categories"
        >
          <FolderOpen className="w-3 h-3" /> {sortedCategories.length ? "Categories" : "Add categories"}
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {active.length === 0 ? (
            <>
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No contacts yet.</p>
              <p className="text-xs mt-1">Add the people you know outside the system — keep track of who's safe, your boundaries, and who to reach in a crisis.</p>
              <Button size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 mt-3 rounded-full"><Plus className="w-4 h-4" /> Add your first contact</Button>
            </>
          ) : (
            <p className="text-sm">No contacts match.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((c) => (
            <ContactCard key={c.id} contact={c} settings={settings} onClick={() => navigate(`/contacts/${c.id}`)} />
          ))}
        </div>
      )}

      <ContactEditModal open={editOpen} onClose={() => setEditOpen(false)} />
      <ContactSafetyLabelsModal open={labelsOpen} onClose={() => setLabelsOpen(false)} settings={settings} />
      <ContactCategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}

function FilterChip({ active, color, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1.5 ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

function ContactCard({ contact, settings, onClick }) {
  const avatar = useResolvedAvatarUrl(contact.avatar_url);
  const safety = getSafetyMeta(contact.safety, settings);
  const name = contactDisplayName(contact);
  const initial = name.trim()[0]?.toUpperCase() || "?";
  return (
    <button
      type="button"
      onClick={onClick}
      data-highlight-id={contact.id}
      className="flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors text-left w-full"
    >
      <span
        className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white text-base flex-shrink-0 relative"
        style={{ backgroundColor: contact.color || "#8b5cf6" }}
      >
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initial}
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card" style={{ backgroundColor: safety.color }} title={safety.label} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-medium truncate">{name}</span>
          {contact.is_emergency_support && <LifeBuoy className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {contact.relationship_label || safety.label}
        </span>
      </span>
    </button>
  );
}

// One emergency-support row with up to one quick call/text/email action.
function EmergencyRow({ contact, onOpen }) {
  const name = contactDisplayName(contact);
  const methods = contact.contact_methods || [];
  const phone = methods.find((m) => m.type === "phone" && m.value);
  const sms = methods.find((m) => m.type === "sms" && m.value) || phone;
  const email = methods.find((m) => m.type === "email" && m.value);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onOpen} className="flex-1 text-left text-sm font-medium truncate hover:underline">
        {name}
        {contact.relationship_label && <span className="text-xs text-muted-foreground font-normal"> · {contact.relationship_label}</span>}
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        {phone && <QuickAction href={contactMethodHref(phone)} icon={Phone} label="Call" />}
        {sms && sms !== phone && <QuickAction href={contactMethodHref({ ...sms, type: "sms" })} icon={MessageSquare} label="Text" />}
        {sms && sms === phone && phone && <QuickAction href={contactMethodHref({ ...phone, type: "sms" })} icon={MessageSquare} label="Text" />}
        {email && <QuickAction href={contactMethodHref(email)} icon={Mail} label="Email" />}
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }) {
  if (!href) return null;
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center hover:bg-rose-500/20"
    >
      <Icon className="w-4 h-4" />
    </a>
  );
}
