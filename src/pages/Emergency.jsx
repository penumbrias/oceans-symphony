// Emergency info (v0.368.0): the emergency card, ready to show a helper.
//
// Unlike the other pages this is not a widget board on purpose: in an
// emergency the card must look the same every time, with nothing to move
// by accident. Its record has one door (EmergencyInfoSheet, the header's
// Info button), and the card is offered as a widget for any board.
//
// ?show=1 opens the card full screen straight away (the doors in Quick
// Support, Safety Plan, Contacts and the widget use it); ?edit=1 opens Info.

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Maximize2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import EmergencyCardView from "@/components/emergency/EmergencyCardView";
import EmergencyInfoSheet from "@/components/emergency/EmergencyInfoSheet";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import { useEmergencyCard } from "@/lib/useEmergencyCard";
import { flagOf } from "@/lib/emergencyInfo";

export default function Emergency() {
  const { info, sections, isFetched } = useEmergencyCard();
  const [params, setParams] = useSearchParams();
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const show = params.get("show"), edit = params.get("edit");
    if (!show && !edit) return;
    if (show) setFull(true);
    if (edit) setEditing(true);
    const next = new URLSearchParams(params);
    next.delete("show"); next.delete("edit");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const lockOn = flagOf(info, "lock_copy") && (info?.lock_fields || []).length > 0;
  return (
    <div className="min-h-screen px-4 pt-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto space-y-4" data-tour="emergency-page">
        <BoardPageHeader title="Emergency info"
          info={{ open: editing, onToggle: () => setEditing((v) => !v), title: "Everything on your emergency card", "data-tour": "emergency-info-btn" }} />
        {isFetched && sections.length === 0 && (
          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm">
              Fill in what a helper should know if you can't speak or need help: how to talk with you, allergies, medications and who to call. You choose everything that goes on it.
            </p>
            <Button onClick={() => setEditing(true)} className="gap-2"><Pencil className="w-4 h-4" /> Fill it in</Button>
          </div>
        )}
        {sections.length > 0 && (
          <>
            <Button size="lg" className="w-full gap-2 h-14 text-base" onClick={() => setFull(true)} data-tour="emergency-show-btn">
              <Maximize2 className="w-5 h-5" /> Show to someone
            </Button>
            <p className="text-xs text-muted-foreground">
              {lockOn ? "The parts you picked also show on the unlock screen, without your password." : "Only shows inside the app. To show parts of it on the unlock screen, open Info → Lock screen."}
            </p>
            <div className="rounded-xl border border-border p-4">
              <EmergencyCardView sections={sections} />
            </div>
          </>
        )}
        <MedicalDisclaimerFooter />
      </div>
      {full && sections.length > 0 && <EmergencyCardView sections={sections} fullScreen onClose={() => setFull(false)} />}
      <EmergencyInfoSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
