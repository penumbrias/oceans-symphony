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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { useUiLook } from "@/lib/uiLook";
import { createMedication, refreshMedications } from "@/lib/medications";
import "@/styles/pixel/phone3.css";

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
  const pixel = useUiLook() === "pixel";
  const qc = useQueryClient();
  // Pixel header "+": the same add as the Medications widget's Add row
  // (createMedication), then that medication's sheet opens to fill it in.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const addMedication = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      const made = await createMedication({ name: n });
      refreshMedications(qc);
      setNewName("");
      setAdding(false);
      if (made?.id) setOpenId(made.id);
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    }
  };
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
    <div className={`min-h-screen px-4 pt-4${pixel ? " px-meds" : ""}`}
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto" data-tour="medications-page">
        {pixel ? (
          <div className="px-meds-head">
            <div className="px-meds-bar">
              <h1 className="px-meds-title">Medications</h1>
              {!page.layoutEditing && (
                <>
                  <button type="button" className="px-p3-btn px-meds-icon" aria-label="Add a medication" title="Add a medication"
                    aria-expanded={adding} onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4" /></button>
                  <button type="button" className="px-p3-btn px-meds-icon" aria-label="Edit page" data-tour="medications-layout-btn"
                    title="Edit page — move, resize and add widgets" onClick={openPageLayoutEditor}><Pencil className="w-4 h-4" /></button>
                </>
              )}
            </div>
            {adding && (
              <form className="px-meds-add" onSubmit={(e) => { e.preventDefault(); addMedication(); }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Medication name"
                  aria-label="Medication name" autoFocus className="px-meds-input" />
                <button type="submit" className="px-p3-btn on" disabled={!newName.trim()}>Add</button>
                <button type="button" className="px-p3-btn" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</button>
              </form>
            )}
          </div>
        ) : (
        <div className="mb-3">
          <BoardPageHeader title="Medications" layoutEditing={page.layoutEditing}
            onEditLayout={openPageLayoutEditor} tourId="medications-layout-btn" />
        </div>
        )}
        <PageBoardCanvas pageId="medications" pages={MEDICATIONS_PAGES} page={page} pageIcons={PAGE_ICONS} tourId="medications-tabs" />
        {!page.layoutEditing && <div className="mt-6"><MedicalDisclaimerFooter /></div>}
      </div>
      <MedicationSheet open={!!openId} medicationId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
