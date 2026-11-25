// Do: the quick tools (the capture place), shared by the phone frame's ⋯
// menu and the studio frame's rail "+" (boards 01-Main and 08-Phone). Each
// tool opens the door it opens today: no new capture logic here.

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PenLine, Heart, Users, StickyNote, CalendarPlus, MessageSquare, LifeBuoy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { pageLabel } from "@/utils/navigationConfig";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Sheet } from "@/house/kit/Sheet";
import { Row } from "@/house/kit/Content";
import QuickActionsMenu from "@/components/dashboard/QuickActionsMenu";
import { useRunQuickAction } from "@/components/dashboard/QuickActionsHost";
// The list and subhead looks are the phone frame's (generic house classes).
import "@/house/phone/phone.css";

export default function DoSheet({ open, onClose, onSetFront, onNote }) {
  const t = useTerms();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const run = useRunQuickAction({});
  const { data: raw = [] } = useQuery({
    queryKey: ["quickActions"],
    queryFn: () => base44.entities.QuickAction.list("order"),
    enabled: open,
  });
  const actions = [...raw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const go = (path) => { onClose(); navigate(path); };
  // Write first (plan decision 1). Each tool opens the door it opens today:
  // no new capture logic here.
  const tools = [
    { id: "write", label: "Write", sub: "A new journal entry", icon: PenLine, run: () => go("/journals?compose=1") },
    { id: "checkin", label: "Check in", sub: "How it feels right now", icon: Heart, run: () => {
      onClose();
      if (pathname === "/") window.dispatchEvent(new CustomEvent("open-quick-checkin"));
      else navigate("/?action=quick-checkin");
    } },
    { id: "front", label: `Set ${t.front}`, sub: `Who is ${t.fronting} now`, icon: Users, run: () => { onClose(); onSetFront(); } },
    { id: "status", label: "Status or note", sub: "A status, a journal or a post", icon: StickyNote, run: () => { onClose(); onNote(); } },
    { id: "plan", label: "Plan or to-do", sub: "Something to do, with or without a time", icon: CalendarPlus, run: () => go("/?action=quick-thing") },
    { id: "chat", label: pageLabel("chat", t), sub: `Talk with each other`, icon: MessageSquare, run: () => go("/chat") },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Do" size="half" label="Quick tools">
      <ul className="hp-list" aria-label="Quick tools">
        {tools.map((x) => (
          <li key={x.id}><Row title={x.label} subtitle={x.sub} lead={<HouseIconLite icon={x.icon} />} onClick={x.run} /></li>
        ))}
        <li><Row title="Not OK?" subtitle="Support, right now" lead={<HouseIconLite icon={LifeBuoy} />} onClick={() => go("/grounding")} /></li>
      </ul>
      <h3 className="house-label hp-subhead">Your quick actions</h3>
      <div className="hp-old-room">
        <QuickActionsMenu docked actions={actions} onClose={() => {}}
          onAction={async (action, extra) => { onClose(); await run(action, extra); }} />
      </div>
    </Sheet>
  );
}

// A small icon for a row's lead (decorative; the row's words name it).
export function HouseIconLite({ icon, page }) {
  return <HouseIcon icon={icon} page={page} className="hp-lead" />;
}

