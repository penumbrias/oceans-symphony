// The header panel of a contact on the pixel Contacts desk: picture, name,
// what they are to you and how safe they are, then Info · Edit page · ⋯.
// Only rendered in the pixel look (ContactProfile's `embedded` mode).
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, ExternalLink, IdCard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import { getSafetyMeta } from "@/lib/contacts";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { pictureStyle } from "@/lib/imageFraming";
import { PxPanel } from "@/components/pixel/PxDesk";

export default function ContactPixelHead({ contact, avatar, initial, name, layoutEditing, onInfo, onOpenPage }) {
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const safety = getSafetyMeta(contact.safety, pickPrimarySystemSettings(settingsList) || null);
  return (
    <PxPanel className="pg-head" as="header">
      <span className="pg-head-av" style={{ backgroundColor: contact.color || undefined }}>
        {avatar ? <img src={avatar} alt="" style={pictureStyle(contact, contact.avatar_url)} /> : initial}
      </span>
      <div className="pg-head-text">
        <h2 className="pg-head-name">{name}</h2>
        <p className="pg-head-sub">
          {contact.relationship_label ? `${contact.relationship_label}  ·  ` : ""}
          <span style={{ color: safety.color }}>{safety.label}</span>
        </p>
      </div>
      {!layoutEditing && (
        <div className="pg-head-btns">
          <button type="button" className="pg-btn tall" onClick={onInfo} title="Everything about this person">Info</button>
          <button type="button" className="pg-btn tall" data-tour="contact-profile-layout-btn" onClick={openProfileLayoutEditor}
            title="Edit page — move, resize and add widgets, and change what's shown">Edit page</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pg-btn tall" aria-label={`More for ${name}`}><MoreHorizontal className="w-4 h-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-[60]">
              <DropdownMenuItem onSelect={onInfo} className="gap-2 cursor-pointer"><IdCard className="w-4 h-4" /> Info</DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenPage} className="gap-2 cursor-pointer"><ExternalLink className="w-4 h-4" /> Open as its own page</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </PxPanel>
  );
}
