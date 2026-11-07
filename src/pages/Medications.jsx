// Medications (v0.367.0): a widget board, like Needs and Notes & lists
// (PageBoardCanvas, docs/garden.md). The records live in
// src/lib/medications.js; every medication opens its one sheet
// (MedicationSheet). Standard layout, until the person's first edit:
//   • Today — today's doses (Took it / Skip) and anything taken as needed.
//   • Medications — every medication, expanded (stopped ones folded away).
//   • Refills — when each runs out, soonest first.
//
// ?tab=today|list|refills picks the page; ?open=<id> opens a medication's
// sheet (search results and links use it).

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pill, ListChecks, Package } from "lucide-react";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";
import { profilePageId } from "@/lib/profileBoard";
import MedicationSheet from "@/components/medications/MedicationSheet";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";

export const MEDICATIONS_PAGES = [
  { tab: "today", label: "Today", widgets: [{ widgetId: "meds_today", mode: "expanded" }] },
  { tab: "list", label: "Medications", widgets: [{ widgetId: "medications", mode: "expanded" }] },
  { tab: "refills", label: "Refills", widgets: [{ widgetId: "med_refills", mode: "expanded" }] },
];
const PAGE_ICONS = {
  [profilePageId("today")]: Pill,
  [profilePageId("list")]: ListChecks,
  [profilePageId("refills")]: Package,
};

export default function Medications() {
  const page = useProfilePageState(MEDICATIONS_PAGES);
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  // ?open=<id> → that medication's sheet, then drop the param so a refresh
  // or Back doesn't open it again.
  useEffect(() => {
    const id = params.get("open");
    if (!id) return;
    setOpenId(id);
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="min-h-screen px-4 pt-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto" data-tour="medications-page">
        <div className="mb-3">
          <BoardPageHeader title="Medications" layoutEditing={page.layoutEditing}
            onEditLayout={openPageLayoutEditor} tourId="medications-layout-btn" />
        </div>
        <PageBoardCanvas pageId="medications" pages={MEDICATIONS_PAGES} page={page} pageIcons={PAGE_ICONS} tourId="medications-tabs" />
        {!page.layoutEditing && <div className="mt-6"><MedicalDisclaimerFooter /></div>}
      </div>
      <MedicationSheet open={!!openId} medicationId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
