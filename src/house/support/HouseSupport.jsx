// The house's Support rooms (plan step 3.1, "the fire exit"): Support
// (/grounding, board 15), Help me unblend (/unblend, board 38), the safety
// plan (/safety-plan, board 39) and Emergency info (/emergency, boards 40
// and 41). Both frames draw this on those routes while the new house is on
// (houseSupportRoom in src/lib/houseSwitch.js); the old pages are not
// mounted then (HouseRoomGate), and run unchanged with the switch off.
//
// The frame keeps Support one tap away (the rail's Support button, the
// phone bar's last place), and its header names the page, so the rooms
// draw no heading of their own. Each room is its own chunk.

import React, { Suspense } from "react";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { LoadingBlock } from "@/house/kit/States";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/support/support.css";

const ROOMS = {
  support: React.lazy(() => import("@/house/support/SupportRoom")),
  unblend: React.lazy(() => import("@/house/support/HouseUnblend")),
  safety: React.lazy(() => import("@/house/support/HouseSafetyPlan")),
  emergency: React.lazy(() => import("@/house/support/HouseEmergency")),
};

export default function HouseSupport({ room, size = "full", tokens }) {
  const Room = ROOMS[room];
  if (!Room) return null;
  return (
    <HouseScope tokens={tokens} className="hs" data-house-size={size} data-support-room={room}>
      <Suspense fallback={<LoadingBlock label="Opening" />}>
        <Room key={room} size={size} />
      </Suspense>
    </HouseScope>
  );
}
