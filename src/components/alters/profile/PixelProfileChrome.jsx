// The alter profile's own chrome in the pixel look (the "AlterProfilePhone"
// mockup): a title bar — back, the name, Front, Info and a ⋯ menu — and an
// action bar along the bottom — Edit page, Profile style, Write note.
//
// Only a layout. Every button runs the handler the page already had
// (AlterProfile passes them in): Info is the same Info/Done/Save door, the
// ⋯ menu holds previous / next {alter}, pin and Message, Edit page opens the
// layout editor and Profile style the profile look sheet.

import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { FrontingToggleButton } from "@/components/alters/AlterCard";
import "@/styles/pixel/alters.css";

export function PixelProfileTopBar({
  alter, prevAlter, nextAlter, activeSessions, isFronting, layoutEditing, editMode, onProfilePage,
  infoLabel, infoTitle, infoPressed, onInfo, onTogglePin, onMessage, onEditPage,
}) {
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const back = () => {
    // Back to wherever the person came from; the alters directory when the
    // profile was opened straight from a link.
    if (window.history.length > 1) navigate(-1); else navigate("/Home");
  };
  return (
    <div className="pxp-bar" data-pf-chrome data-profile-header-actions="">
      <button type="button" className="pxa-btn pxp-sq" onClick={back} aria-label="Back" title="Back">
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="pxp-bar-name" title={formatAlter(alter)}>{formatAlter(alter)}</span>
      {!layoutEditing && (
        <FrontingToggleButton alter={alter} activeSessions={activeSessions} label={isFronting ? `In ${t.front}` : t.Front} />
      )}
      <button type="button" className={`pxa-btn${infoPressed ? " on" : ""}`} data-tour="alter-profile-edit-btn"
        aria-pressed={infoPressed} title={infoTitle} onClick={onInfo}>
        {infoLabel}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="pxa-btn pxp-sq" aria-label="Page menu">
            <MoreHorizontal aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem disabled={!prevAlter} onSelect={() => prevAlter && navigate(`/alter/${prevAlter.id}`)}>
            Previous {t.alter}{prevAlter ? `: ${formatAlter(prevAlter)}` : ""}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!nextAlter} onSelect={() => nextAlter && navigate(`/alter/${nextAlter.id}`)}>
            Next {t.alter}{nextAlter ? `: ${formatAlter(nextAlter)}` : ""}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onTogglePin}>
            {alter.is_pinned ? `Unpin from the top of the ${t.alters} page` : `Pin to the top of the ${t.alters} page`}
          </DropdownMenuItem>
          {!onProfilePage && !layoutEditing && !editMode && (
            <DropdownMenuItem onSelect={onMessage}>Message {formatAlter(alter)}</DropdownMenuItem>
          )}
          {!editMode && !layoutEditing && (
            <DropdownMenuItem onSelect={onEditPage}>Edit page</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function PixelProfileActionBar({ onEditPage, onStyle, onWriteNote }) {
  return (
    <div className="pxp-actions" role="toolbar" aria-label="Page actions">
      <button type="button" className="pxa-btn" onClick={onEditPage} data-tour="alter-profile-layout-btn">Edit page</button>
      <button type="button" className="pxa-btn" onClick={onStyle}>Profile style</button>
      <button type="button" className="pxa-btn on" onClick={onWriteNote}>Write note</button>
    </div>
  );
}
