// A contact's profile page. Since v0.291.0 the page is a widget board
// (ContactSections.jsx + src/v2/profileWidgets.jsx on the home-screen
// canvas): one page per tab, every section a widget. The record's own
// fields are still edited in ContactEditModal (the pencil).
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, LayoutGrid, Info, Link2, Shield, FileText, SlidersHorizontal } from "lucide-react";
import ContactEditModal from "@/components/contacts/ContactEditModal";
import ProfileBoardCanvas, { useProfilePageState, openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import { CONTACT_PROFILE_PAGES, profilePageId } from "@/lib/profileBoard";
import { contactDisplayName } from "@/lib/contacts";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const PAGE_ICONS = {
  [profilePageId("about")]: Info,
  [profilePageId("relationships")]: Link2,
  [profilePageId("boundaries")]: Shield,
  [profilePageId("notes")]: FileText,
  [profilePageId("options")]: SlidersHorizontal,
};

export default function ContactProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const page = useProfilePageState(CONTACT_PROFILE_PAGES);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: contacts = [], isLoading } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const contact = contacts.find((c) => c.id === id) || null;
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

  const name = contactDisplayName(contact);
  const initial = name.trim()[0]?.toUpperCase() || "?";

  return (
    <div className="max-w-2xl mx-auto px-1 pb-12">
      <div className="flex items-center justify-between pt-1 mb-3">
        <button type="button" onClick={() => navigate("/contacts")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Contacts
        </button>
        {!page.layoutEditing && (
          <div className="flex items-center gap-2">
            <Button
              data-tour="contact-profile-layout-btn"
              size="sm" variant="outline"
              onClick={openProfileLayoutEditor}
              aria-label="Edit layout" title="Edit layout — move, resize and add widgets on this page"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} aria-label="Edit" title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
          </div>
        )}
      </div>

      {/* Off the About page, the person's name stays in view. */}
      {!page.onFirstPage && (
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-base text-white flex-shrink-0" style={{ backgroundColor: contact.color || "#8b5cf6" }}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initial}
          </span>
          <span className="text-lg font-semibold truncate">{name}</span>
        </div>
      )}

      <ProfileBoardCanvas ownerType="contact" record={contact} pageIcons={PAGE_ICONS} page={page} tourId="contact-profile-tabs" api={{ alters }} />

      <ContactEditModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
    </div>
  );
}
