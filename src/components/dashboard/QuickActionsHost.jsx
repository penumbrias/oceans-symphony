// THE host for the saved Quick Actions menu (Shortcuts) on every page.
//
// Holding a quick-actions bar key or the apps button, the OS launcher's
// "open quick actions" shortcut (?openQuickActions=1) and actions that need
// input before they can run all fire "open-quick-actions". The menu used to
// live on the home screen, so from any other page those navigated home
// first and the menu opened under the Quick Check-In button. Now it opens
// right where you are, docked to the edge of the bar you held: above the
// bottom bar when the hold was in the lower half of the screen, below the
// top bar otherwise. (The classic Quick Check-In button's own hold still
// opens its menu under that button — that one is anchored on purpose.)

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { markQuickActionUsedToday } from "@/lib/dailyTaskSystem";
import { runQuickAction } from "@/lib/quickActionRunner";
import QuickActionsMenu from "@/components/dashboard/QuickActionsMenu";

const GAP = 12;

function placementFor(y) {
  const vh = window.innerHeight || 800;
  if (typeof y === "number" && y > vh / 2) {
    // Bottom bar: sit just above where the finger was.
    const bottom = Math.max(GAP, vh - y + GAP + 16);
    return { bottom, maxHeight: Math.max(200, vh - bottom - 56) };
  }
  // Top bar (or no position known): just under the status bar / finger.
  const top = typeof y === "number" ? Math.max(48, y + GAP + 16) : null;
  return { top, maxHeight: Math.max(200, vh - (top ?? 64) - GAP - 72) };
}

export default function QuickActionsHost() {
  const [open, setOpen] = useState(null); // null | { top?, bottom?, maxHeight }
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const terms = useTerms();

  const { data: quickActionsRaw = [] } = useQuery({
    queryKey: ["quickActions"],
    queryFn: () => base44.entities.QuickAction.list("order"),
  });
  const actions = [...quickActionsRaw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  useEffect(() => {
    const onOpen = (e) => setOpen(placementFor(e?.detail?.y));
    window.addEventListener("open-quick-actions", onOpen);
    return () => window.removeEventListener("open-quick-actions", onOpen);
  }, []);

  // OS launcher shortcut: /?openQuickActions=1. Strip the param so a
  // refresh doesn't reopen it.
  useEffect(() => {
    let params;
    try { params = new URLSearchParams(location.search); } catch { return; }
    if (params.get("openQuickActions") !== "1") return;
    setOpen(placementFor(null));
    params.delete("openQuickActions");
    const qs = params.toString();
    navigate(location.pathname + (qs ? `?${qs}` : "") + location.hash, { replace: true });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setOpen(null);
  const atHome = location.pathname === "/";

  const onAction = async (action, extraData = {}) => {
    close();
    markQuickActionUsedToday();
    try {
      await runQuickAction(action, extraData, {
        queryClient,
        terms,
        navigate,
        // The check-in and Set fronters sheets are hosted on the home
        // screen; from elsewhere these two go there with a param.
        openCheckin: (section) => {
          if (atHome) window.dispatchEvent(new CustomEvent("open-quick-checkin", { detail: { section } }));
          else navigate(`/?action=quick-checkin${section ? `&section=${encodeURIComponent(section)}` : ""}`);
        },
        openSetFront: () => {
          if (atHome) window.dispatchEvent(new CustomEvent("open-set-front"));
          else navigate("/?action=set-front");
        },
        reopenMenu: () => setOpen(placementFor(null)),
      });
    } catch (err) {
      console.error("Quick action failed", err);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 z-[120] pointer-events-none flex justify-center px-3"
          style={open.bottom != null
            ? { bottom: open.bottom }
            : { top: open.top != null ? open.top : "calc(var(--v2-status-h, 40px) + env(safe-area-inset-top, 0px) + 8px)" }}>
          <div className="w-[min(20rem,100%)] pointer-events-auto">
            <QuickActionsMenu docked maxHeight={open.maxHeight}
              actions={actions} onAction={onAction} onClose={close} />
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
