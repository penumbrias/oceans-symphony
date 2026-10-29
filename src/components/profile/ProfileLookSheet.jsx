// Profile style (v0.312.1) — the profile's own look sheet.
//
// The same half-height, non-modal inspector as Display options (V2Frame's
// OptionsSheet: peek handle, dock flip, undo/redo), but its own surface
// with its own name, so a person editing a profile sees "Profile display
// options" and not a scope row inside the app-wide one (owner's call,
// 2026-10-29). The tabs are ProfileLookTabs (Content · Text · Colour ·
// Styles); the profile it edits is the one on screen (lookSubject.js).
//
// Mounted ONCE by AppLayout (ProfileLookHost) and opened from anywhere on a
// profile page with the "os-open-profile-look" event — the cog menu's
// "Profile style" and the forms' PageLookRow.

import React, { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { useT } from "@/lib/i18n";
import UndoRedoButtons from "@/components/v2/UndoRedoHistory";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";
import { DOCK_KEY } from "@/components/v2/V2Frame";
import { useLookSubject } from "@/lib/lookSubject";
import ProfileLookTabs from "@/components/profile/ProfileLookTabs";

export const OPEN_PROFILE_LOOK_EVENT = "os-open-profile-look";

function ProfileLookSheet({ open, onClose, subject }) {
  const t = useT();
  // Docked the same way as Display options (one preference for both).
  const [dock, setDock] = useState(() => {
    try { return localStorage.getItem(DOCK_KEY) === "top" ? "top" : "bottom"; } catch { return "bottom"; }
  });
  const flipDock = () => {
    const next = dock === "top" ? "bottom" : "top";
    setDock(next);
    try { localStorage.setItem(DOCK_KEY, next); } catch { /* storage off */ }
  };
  const peekResize = usePeekHeight("symphony_profile_look_peek_h", 85);
  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open]);

  const [tab, setTab] = useState("colour");
  const panelRef = useRef(null);
  const pickTab = (id) => {
    setTab(id);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  };
  useEdgeSafeSliders(open, [tab]);

  const openAppOptions = () => {
    onClose();
    window.dispatchEvent(new CustomEvent("os-open-display-options"));
  };

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent direction={dock} hideHandle data-profile-look-sheet=""
        style={{ maxHeight: `${peekResize.peekH}vh`, height: `${peekResize.peekH}vh` }} {...sheetPortalGuards}>
        <PeekHandle resize={peekResize} dock={dock} />
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <button type="button" onClick={onClose} aria-label="Close"
                className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
                {dock === "top" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <span className="min-w-0">
                <DrawerTitle className="text-base truncate">{t("profileLook.title")}</DrawerTitle>
                <DrawerDescription className="text-xs truncate">
                  {subject?.label ? t("profileLook.subtitle", { name: subject.label }) : t("profileLook.noProfile")}
                </DrawerDescription>
              </span>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <UndoRedoButtons />
              <button type="button" onClick={flipDock}
                aria-label={t("options.dockFlip")} title={t("options.dockFlip")}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
                {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
              </button>
            </span>
          </div>
        </DrawerHeader>
        <div ref={panelRef} className="px-4 overflow-y-auto overscroll-contain space-y-2 flex-1 min-h-0"
          style={{ paddingBottom: "calc(var(--os-sab) + 24px)" }}>
          {open && subject && <ProfileLookTabs subject={subject} tab={tab} onTab={pickTab} />}
          {open && !subject && (
            <p className="text-xs text-muted-foreground py-4">{t("profileLook.noProfile")}</p>
          )}
          <button type="button" onClick={openAppOptions}
            className="w-full h-9 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground">
            {t("profileLook.appOptions")}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ONE Profile style sheet for the whole app, mounted once by
// AppLayout. It closes by itself when the profile leaves the screen.
export function ProfileLookHost() {
  const subject = useLookSubject();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const on = () => { setNonce((n) => n + 1); setOpen(true); };
    window.addEventListener(OPEN_PROFILE_LOOK_EVENT, on);
    return () => window.removeEventListener(OPEN_PROFILE_LOOK_EVENT, on);
  }, []);
  const subjectKey = subject ? `${subject.type}:${subject.id}` : null;
  useEffect(() => { if (!subjectKey) setOpen(false); }, [subjectKey]);
  return <ProfileLookSheet key={nonce} open={open} subject={subject} onClose={() => setOpen(false)} />;
}

export default ProfileLookSheet;
