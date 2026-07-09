import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { contactDisplayName } from "@/lib/contacts";

// Contact thumb — mirrors GroupMembersModal's MemberThumb pattern
// (src/components/groups/GroupMembersModal.jsx) adapted for Contact
// (avatar_url + color, no alter-specific fields).
function ContactThumb({ contact }) {
  const resolved = useResolvedAvatarUrl(contact?.avatar_url);
  if (resolved) {
    return <img src={resolved} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div
      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
      style={{ backgroundColor: contact?.color || "#0ea5e9" }}
    >
      {contactDisplayName(contact).charAt(0).toUpperCase()}
    </div>
  );
}

// Reusable "who are you with?" picker-guts — search box + scrollable
// checkbox rows, per CLAUDE.md's multi-select convention (not the fronting
// gesture model, which implies a primary/solo concept contacts don't have).
// Purely a controlled selection component: reports the next array of
// contact ids via onChange, staged by the caller — it never writes to
// ContactEncounter itself, so it fits both an inline "commit on Save"
// caller (Quick Check-In) and an immediate-write caller (Activity Tracker
// toolbar / ContactProfile-style toggles).
export function ContactMultiSelectList({ selectedContactIds = [], onChange, excludeArchived = true }) {
  const [search, setSearch] = useState("");
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => !excludeArchived || !c.is_archived)
      .filter((c) => !q || contactDisplayName(c).toLowerCase().includes(q))
      .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)));
  }, [contacts, search, excludeArchived]);

  const toggle = (id) => {
    const next = selectedContactIds.includes(id)
      ? selectedContactIds.filter((x) => x !== id)
      : [...selectedContactIds, id];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="pl-8 h-9 text-sm"
        />
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain space-y-1 pr-1">
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {contacts.length === 0 ? "No contacts yet — add one from the Contacts page." : "No contacts match your search."}
          </p>
        ) : (
          visible.map((c) => {
            const checked = selectedContactIds.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors text-left ${
                  checked ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"
                }`}
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <ContactThumb contact={c} />
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{contactDisplayName(c)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// Dialog wrapper around the list above, for callers that want a standalone
// modal-over-page picker (Activity Tracker toolbar) rather than embedding
// the list inline (Quick Check-In's "Who are you with?" pill body).
export default function ContactMultiSelect({ isOpen, onClose, selectedContactIds = [], onChange, title = "Who are you with?" }) {
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ContactMultiSelectList selectedContactIds={selectedContactIds} onChange={onChange} />
        <Button onClick={onClose} className="w-full mt-1">Done</Button>
      </DialogContent>
    </Dialog>
  );
}
