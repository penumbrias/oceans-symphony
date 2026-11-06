// Everything on the emergency card, in one place (v0.368.0) — the record's
// one door (docs/garden.md). A half-height, non-modal sheet like the
// medication sheet. Pages: About me · Medical · Card · Lock screen. Short
// fields save as they're typed; longer ones save on their own Save, through
// the app's text grammar (src/lib/emergencyInfo.js is the write path).

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UserRound, Stethoscope, IdCard, Lock, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { Group, Row, SwitchRow, LinkRow, TabBar } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { inputBase } from "@/components/alters/info/entryEditors";
import AuthoredTextField from "@/components/shared/AuthoredTextField";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { useMedications } from "@/lib/medications";
import { emergencySupportContacts } from "@/lib/contacts";
import { useEmergencyInfo, saveEmergencyInfo, flagOf, CARD_SECTIONS, EMERGENCY_INFO_KEY } from "@/lib/emergencyInfo";
import { latestSafetyPlan } from "@/lib/useEmergencyCard";

function useSave() {
  const qc = useQueryClient();
  return async (patch) => {
    try {
      await saveEmergencyInfo(patch);
      qc.invalidateQueries({ queryKey: EMERGENCY_INFO_KEY });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
      throw e;
    }
  };
}

function Short({ info, field, label, hint, placeholder, width = "w-[13rem]", type }) {
  const save = useSave();
  return (
    <Row label={label} hint={hint}>
      <DebouncedText value={info?.[field] || ""} ariaLabel={label} maxLength={300} placeholder={placeholder} type={type}
        className={`${inputBase} ${width}`} onCommit={(v) => save({ [field]: v }).catch(() => {})} />
    </Row>
  );
}

function Long({ info, field, title, placeholder, alters }) {
  const save = useSave();
  return (
    <Group title={title}>
      <AuthoredTextField value={info?.[field] || ""} alters={alters} surfaceLabel="emergency info" ariaLabel={title}
        placeholder={placeholder} onSave={(content) => save({ [field]: content })} />
    </Group>
  );
}

function AboutTab({ info, alters }) {
  return (
    <>
      <Long info={info} field="communication" title="How to talk with me" alters={alters}
        placeholder="For example: I can't speak right now, but I can hear and understand you. I can nod yes or no, or write." />
      <Group title="About me">
        <Short info={info} field="preferred_name" label="Call me" />
        <Short info={info} field="pronouns" label="Pronouns" width="w-[9rem]" />
        <Short info={info} field="date_of_birth" label="Date of birth" width="w-[10.5rem]" type="date" />
        <Short info={info} field="language" label="Language" hint="If it isn't the local one" width="w-[10rem]" />
        <Short info={info} field="address" label="Address" hint="Where to take me home" />
      </Group>
      <Long info={info} field="other_info" title="Anything else a helper should know" alters={alters}
        placeholder="For example: I have DID. I may seem confused, act younger, or not recognise you. That's expected." />
    </>
  );
}

function MedicalTab({ info, alters }) {
  const save = useSave();
  const navigate = useNavigate();
  const { medications } = useMedications();
  const shared = medications.filter((m) => !m.is_archived && m.share_in_emergency !== false).length;
  return (
    <>
      <Long info={info} field="allergies" title="Allergies" alters={alters} placeholder="Medicines, foods, anything else — or “None known”" />
      <Long info={info} field="conditions" title="Conditions" alters={alters} placeholder="Diagnoses or conditions a helper should know about" />
      <Group title="Medications">
        <SwitchRow label="Show my medications" hint={`${shared} marked “Show on my emergency card”`}
          checked={flagOf(info, "show_medications")} onChange={(v) => save({ show_medications: v }).catch(() => {})} />
        <LinkRow label="Medications" hint="Choose which ones on each medication's Info" onClick={() => navigate("/medications?tab=list")} />
      </Group>
      <Group title="Other medical">
        <Short info={info} field="blood_type" label="Blood type" width="w-[6rem]" />
        <AuthoredTextField value={info?.medical_notes || ""} alters={alters} surfaceLabel="emergency info" ariaLabel="Medical notes"
          placeholder="Medical notes: devices, doctor, hospital, insurance…" onSave={(content) => save({ medical_notes: content })} />
      </Group>
      <div className="pt-4"><MedicalDisclaimerFooter /></div>
    </>
  );
}

function CardTab({ info, alters }) {
  const save = useSave();
  const navigate = useNavigate();
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const { data: entries = [] } = useQuery({ queryKey: ["supportJournalEntries"], queryFn: () => base44.entities.SupportJournalEntry.list() });
  const people = emergencySupportContacts(contacts).length;
  const plan = latestSafetyPlan(entries);
  return (
    <>
      <Long info={info} field="what_helps" title="What helps" alters={alters} placeholder="For example: a quiet space, my headphones, talking slowly" />
      <Long info={info} field="what_doesnt" title="Please don't" alters={alters} placeholder="For example: touch me without asking, shout, crowd me" />
      <Group title="From elsewhere in the app">
        <SwitchRow label="Emergency contacts" hint={people ? `${people} marked as emergency support, with Call buttons` : "No one marked as emergency support yet"}
          checked={flagOf(info, "show_contacts")} onChange={(v) => save({ show_contacts: v }).catch(() => {})} />
        <LinkRow label="Contacts" hint="Mark someone as emergency support on their page" onClick={() => navigate("/contacts")} />
        <SwitchRow label="My safety plan" hint={plan?.emergency_response ? "What I will do to stay safe" : "Not filled in yet"}
          checked={flagOf(info, "show_safety_plan")} onChange={(v) => save({ show_safety_plan: v }).catch(() => {})} />
        <LinkRow label="Safety plan" onClick={() => navigate("/safety-plan")} />
      </Group>
    </>
  );
}

function LockTab({ info }) {
  const save = useSave();
  const on = flagOf(info, "lock_copy");
  const picked = new Set(Array.isArray(info?.lock_fields) ? info.lock_fields : []);
  const encrypted = isEncryptionEnabled();
  const toggle = (id, v) => {
    const next = new Set(picked);
    if (v) next.add(id); else next.delete(id);
    save({ lock_fields: [...next] }).catch(() => {});
  };
  return (
    <>
      <Group title="On the unlock screen" first>
        <p className="text-sm text-muted-foreground py-2">
          {encrypted
            ? "Your data needs your password to open. Turn this on to let a helper see the parts you pick below without it."
            : "Your data isn't password-protected, so the app opens without an unlock screen. This only matters if you turn on a password later."}
        </p>
        <SwitchRow label="Show chosen parts without my password"
          hint="Anyone holding your device can read what you pick. Everything else stays locked."
          checked={on} onChange={(v) => save({ lock_copy: v }).catch(() => {})} />
      </Group>
      {on && (
        <Group title="What shows there">
          {picked.size === 0 && <p className="text-sm text-muted-foreground py-2">Nothing is picked yet, so nothing shows.</p>}
          {CARD_SECTIONS.map((s) => (
            <SwitchRow key={s.id} label={s.label} hint={s.hint} checked={picked.has(s.id)} onChange={(v) => toggle(s.id, v)} />
          ))}
        </Group>
      )}
    </>
  );
}

export default function EmergencyInfoSheet({ open, onClose, initialTab = "about" }) {
  const { info, isFetched } = useEmergencyInfo({ enabled: open });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: open });
  const peek = usePeekHeight("symphony_emergency_sheet_peek_h", 60);
  const [tab, setTab] = useState(initialTab);
  const tabs = [
    { id: "about", label: "About me", icon: UserRound },
    { id: "medical", label: "Medical", icon: Stethoscope },
    { id: "card", label: "Card", icon: IdCard },
    { id: "lock", label: "Lock screen", icon: Lock },
  ];
  return (
    <Drawer open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards} data-emergency-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">Emergency info</DrawerTitle>
        <DrawerDescription className="sr-only">What a helper should know. Changes save as you make them.</DrawerDescription>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
          <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
            <div className="py-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 text-sm font-semibold truncate">Emergency info</p>
              <button type="button" aria-label="Close" onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><X className="w-4 h-4" /></button>
            </div>
            <TabBar tabs={tabs} value={tab} onChange={setTab} />
          </div>
          {/* Fields seed from the record once, so wait for it. */}
          {isFetched && <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === "about" && <AboutTab info={info} alters={alters} />}
            {tab === "medical" && <MedicalTab info={info} alters={alters} />}
            {tab === "card" && <CardTab info={info} alters={alters} />}
            {tab === "lock" && <LockTab info={info} />}
          </div>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
