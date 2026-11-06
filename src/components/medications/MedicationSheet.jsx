// Everything about one medication, in one place (v0.367.0) — the garden's
// "one door": every widget, the Medications page and search open this same
// sheet. A half-height, non-modal sheet like Page info. Pages:
// Info · Schedule · Supply · History. Rare actions (stop taking, delete)
// sit under ⋯. Fields save as they're changed through src/lib/medications.js;
// the notes save on their own Save, through the app's text grammar.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Info, Clock, Package, History, MoreHorizontal, X, Plus, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { Group, Row, ChoiceRow, SwitchRow, SliderRow, TabBar } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { inputBase } from "@/components/alters/info/entryEditors";
import AuthoredTextField from "@/components/shared/AuthoredTextField";
import RowMenu from "@/components/shared/RowMenu";
import { deleteWithUndo } from "@/lib/undoDelete";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { clockOpts } from "@/lib/timeFormat";
import {
  useMedications, useMedicationDoses, refreshMedications, updateMedication, recordRefill, deleteMedication,
  unmarkDose, medTimes, supplyOf, supplyLabel, courseLabel, countBy, remindDaysOf, medicationPath,
  DEFAULT_REMIND_DAYS,
} from "@/lib/medications";
import { ensureMedicationReminderPermission } from "@/lib/medicationReminderScheduler";

const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() });
};
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const dayLabel = (key) => {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return format(new Date(y, m - 1, d), "d MMM yyyy");
};

function DateInput({ value, onChange, label }) {
  return (
    <span className="flex items-center gap-1">
      <input type="date" value={value || ""} aria-label={label} onChange={(e) => onChange(e.target.value || null)}
        className={`${inputBase} w-[10.5rem]`} />
      {value && (
        <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange(null)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      )}
    </span>
  );
}

function InfoTab({ med, run, alters }) {
  return (
    <>
      <Group title="Medication" first>
        <Row label="Name">
          <DebouncedText value={med.name || ""} ariaLabel="Name" maxLength={120} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => { if (String(v).trim()) run(() => updateMedication(med.id, { name: v })); }} />
        </Row>
        <Row label="Dose" hint="Like 50 mg, or 2 puffs">
          <DebouncedText value={med.dose || ""} ariaLabel="Dose" maxLength={80} className={`${inputBase} w-[10rem]`}
            onCommit={(v) => run(() => updateMedication(med.id, { dose: v }))} />
        </Row>
        <Row label="What it's for">
          <DebouncedText value={med.purpose || ""} ariaLabel="What it's for" maxLength={160} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => run(() => updateMedication(med.id, { purpose: v }))} />
        </Row>
      </Group>
      <Group title="Notes">
        <AuthoredTextField value={med.notes} alters={alters} surfaceLabel="medication note" ariaLabel="Notes"
          placeholder="Add a note: side effects, how to take it…"
          editPlaceholder="Side effects, how to take it, what to ask next time…"
          onSave={(content) => updateMedication(med.id, { notes: content }).then(() => run(() => null))}
          source={{ sourceType: "medication", sourceId: med.id, sourceLabel: `Medication: ${med.name}`, navigatePath: medicationPath(med.id) }} />
      </Group>
      <Group title="Who prescribes it">
        <Row label="Prescriber">
          <DebouncedText value={med.prescriber || ""} ariaLabel="Prescriber" maxLength={120} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => run(() => updateMedication(med.id, { prescriber: v }))} />
        </Row>
        <Row label="Pharmacy">
          <DebouncedText value={med.pharmacy || ""} ariaLabel="Pharmacy" maxLength={160} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => run(() => updateMedication(med.id, { pharmacy: v }))} />
        </Row>
      </Group>
      <Group title="In an emergency">
        <SwitchRow label="Show on my emergency card" hint="Listed with its dose and what it's for"
          checked={med.share_in_emergency !== false} onChange={(v) => run(() => updateMedication(med.id, { share_in_emergency: v }))} />
      </Group>
      <div className="pt-4"><MedicalDisclaimerFooter /></div>
    </>
  );
}

function ScheduleTab({ med, run }) {
  const times = medTimes(med);
  const setTimes = (next) => run(() => updateMedication(med.id, { times: next }));
  const course = courseLabel(med);
  return (
    <>
      <Group title="When" first>
        <SwitchRow label="Taken as needed" hint="No set times. Mark each dose when you take one."
          checked={!!med.as_needed} onChange={(v) => run(() => updateMedication(med.id, { as_needed: v }))} />
        {!med.as_needed && (
          <>
            {times.map((time, i) => (
              <Row key={time} label={`Dose ${i + 1}`}>
                <input type="time" value={time} aria-label="Dose time"
                  onChange={(e) => { if (e.target.value) setTimes(times.map((x) => (x === time ? e.target.value : x))); }}
                  className={`${inputBase} w-[8rem]`} />
                <button type="button" aria-label={`Remove ${fmtTime(time)}`} onClick={() => setTimes(times.filter((x) => x !== time))}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </Row>
            ))}
            <Row label={times.length ? "Another dose" : "Dose time"} hint={times.length ? null : "Add a time for each dose in the day"}>
              <button type="button" onClick={() => {
                const used = new Set(times);
                const next = ["08:00", "12:00", "18:00", "21:00", "06:00", "15:00"].find((x) => !used.has(x)) || "09:00";
                setTimes([...times, next]);
              }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 text-sm"><Plus className="w-4 h-4" /> Add a time</button>
            </Row>
          </>
        )}
      </Group>
      <Group title="Course">
        <Row label="Started">
          <DateInput label="Started" value={med.start_date} onChange={(v) => run(() => updateMedication(med.id, { start_date: v }))} />
        </Row>
        <Row label="Ends" hint={course || "For a course that stops, like antibiotics"}>
          <DateInput label="Ends" value={med.end_date} onChange={(v) => run(() => updateMedication(med.id, { end_date: v }))} />
        </Row>
      </Group>
    </>
  );
}

function RefillForm({ med, supply, onDone, run }) {
  const lastQty = (Array.isArray(med.refills) && med.refills.length ? med.refills[med.refills.length - 1].quantity : null) || med.refill_quantity || "";
  const [qty, setQty] = useState(String(lastQty || ""));
  const left = supply?.remaining > 0 ? supply.remaining : 0;
  const [carry, setCarry] = useState(left > 0);
  return (
    <div className="rounded-lg border border-border/60 p-2 mt-2 space-y-1">
      <Row label="How many did you get?">
        <input type="number" min={0} inputMode="decimal" value={qty} aria-label="How many did you get?"
          onChange={(e) => setQty(e.target.value)} className={`${inputBase} w-[7rem] text-right tabular-nums`} />
      </Row>
      {left > 0 && (
        <SwitchRow label={`Add the ${fmtNum(left)} still left`} hint="Keeps the count right if you refill early"
          checked={carry} onChange={setCarry} />
      )}
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!(Number(qty) > 0)} onClick={() => run(async () => {
          await recordRefill(med, { quantity: qty, carried: carry ? left : 0 });
          onDone();
        }, "Refill saved")}><Check className="w-3.5 h-3.5 mr-1" /> Save refill</Button>
      </div>
    </div>
  );
}

function SupplyTab({ med, doses, run }) {
  const supply = supplyOf(med, doses);
  const [refilling, setRefilling] = useState(false);
  const by = countBy(med);
  const refills = Array.isArray(med.refills) ? [...med.refills].reverse() : [];
  return (
    <>
      <Group title="Right now" first>
        <Row label={supply ? supplyLabel(supply) : "Fill in the refill below to see what's left"}
          hint={supply?.runOut && supply.remaining > 0 ? (supply.courseEndsFirst ? "The course ends before it runs out" : `Runs out around ${format(supply.runOut, "d MMM")}`) : null}>
          <button type="button" onClick={() => setRefilling((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/60 text-sm">Refilled</button>
        </Row>
        {refilling && <RefillForm med={med} supply={supply} run={run} onDone={() => setRefilling(false)} />}
      </Group>
      <Group title="Last refill">
        <Row label="Date">
          <DateInput label="Last refill date" value={med.last_refill_date}
            onChange={(v) => run(() => updateMedication(med.id, { last_refill_date: v }))} />
        </Row>
        <Row label="How many" hint="Tablets, ml, puffs… whatever one dose is counted in">
          <DebouncedText value={med.refill_quantity ? String(med.refill_quantity) : ""} ariaLabel="How many" inputMode="decimal"
            className={`${inputBase} w-[6rem] text-right tabular-nums`}
            onCommit={(v) => run(() => updateMedication(med.id, { refill_quantity: v }))} />
        </Row>
        <Row label="One dose uses">
          <DebouncedText value={med.units_per_dose ? String(med.units_per_dose) : ""} ariaLabel="One dose uses" inputMode="decimal" placeholder="1"
            className={`${inputBase} w-[6rem] text-right tabular-nums`}
            onCommit={(v) => run(() => updateMedication(med.id, { units_per_dose: v }))} />
        </Row>
        <ChoiceRow label="Count what's left from" value={by}
          options={[{ value: "schedule", label: "The times" }, { value: "doses", label: "Doses marked" }]}
          onChange={(v) => run(() => updateMedication(med.id, { count_by: v }))} />
      </Group>
      <Group title="Reminder">
        <SwitchRow label="Remind me before it runs out"
          hint="The notification says a medication is running low, never which one"
          checked={!!med.refill_reminder}
          onChange={(v) => run(async () => { if (v) await ensureMedicationReminderPermission(); await updateMedication(med.id, { refill_reminder: v }); })} />
        {med.refill_reminder && (
          <SliderRow label="Days before" value={med.refill_remind_days ?? null} fallback={DEFAULT_REMIND_DAYS}
            min={1} max={30} unit=" days" hint={supply?.remindAt ? `Next: ${format(supply.remindAt, "d MMM")}` : null}
            onChange={(v) => run(() => updateMedication(med.id, { refill_remind_days: v }))}
            onClear={() => run(() => updateMedication(med.id, { refill_remind_days: null }))} />
        )}
        {med.refill_reminder && remindDaysOf(med) >= 0 && !supply && (
          <p className="text-xs text-muted-foreground py-1">Fill in the last refill above so the reminder knows when.</p>
        )}
      </Group>
      {refills.length > 0 && (
        <Group title="Refills">
          {refills.slice(0, 12).map((r) => (
            <Row key={r.timestamp} label={dayLabel(r.date)}
              hint={r.carried ? `${fmtNum(r.quantity)} new + ${fmtNum(r.carried)} left over` : null}>
              <span className="text-sm tabular-nums">{fmtNum(r.quantity + (r.carried || 0))}</span>
            </Row>
          ))}
        </Group>
      )}
    </>
  );
}

function HistoryTab({ med, doses, alters }) {
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const byId = useMemo(() => new Map(alters.map((a) => [a.id, a])), [alters]);
  const rows = useMemo(() => doses
    .filter((d) => d.medication_id === med.id)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 40), [doses, med.id]);
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">No doses marked yet. Mark them from the Today widget.</p>;
  return (
    <Group title="Doses marked" first>
      {rows.map((d) => {
        const who = (d.fronting_alter_ids || []).map((id) => byId.get(id)).filter(Boolean).map(formatAlter).join(", ");
        const when = new Date(d.timestamp);
        const label = `${d.status === "skipped" ? "Skipped" : "Taken"} · ${format(when, "d MMM")} ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() })}`;
        return (
          <Row key={d.id} label={label} hint={[d.slot ? `the ${fmtTime(d.slot.split("T")[1])} dose` : "as needed", who].filter(Boolean).join(" · ")}>
            <RowMenu label="Dose actions" items={[
              { label: "Remove this mark", onSelect: () => deleteWithUndo({ label: "Mark removed", run: () => unmarkDose(d), refresh: () => refreshMedications(qc) }) },
            ]} />
          </Row>
        );
      })}
    </Group>
  );
}

export default function MedicationSheet({ medicationId, open, onClose, initialTab = "info" }) {
  const qc = useQueryClient();
  const { medications } = useMedications({ enabled: open });
  const { doses } = useMedicationDoses({ enabled: open });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: open });
  const med = medications.find((m) => m.id === medicationId) || null;
  const peek = usePeekHeight("symphony_medication_sheet_peek_h", 60);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const run = async (fn, done = null) => {
    try {
      await fn();
      refreshMedications(qc);
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    }
  };

  const tabs = [
    { id: "info", label: "Info", icon: Info },
    { id: "schedule", label: "Schedule", icon: Clock },
    { id: "supply", label: "Supply", icon: Package },
    { id: "history", label: "History", icon: History },
  ];

  // Goes to the trash with its dose log (one batch), so no "are you
  // sure?": Undo on the toast brings both back.
  const remove = async () => {
    const gone = med;
    onClose();
    await deleteWithUndo({ label: `${gone.name} deleted`, run: () => deleteMedication(gone), refresh: () => refreshMedications(qc) });
  };

  return (
    <Drawer open={open && !!med} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards} data-medication-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">{med?.name || "Medication"}</DrawerTitle>
        <DrawerDescription className="sr-only">Everything about this medication. Changes save as you make them.</DrawerDescription>
        {med && (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
            <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
              <div className="py-2 flex items-center gap-2">
                <p className="flex-1 min-w-0 text-sm font-semibold truncate">
                  💊 {med.name}{med.is_archived ? " · stopped" : ""}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More" title="More"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><MoreHorizontal className="w-4 h-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => run(() => updateMedication(med.id, { is_archived: !med.is_archived }),
                      med.is_archived ? "Back on your list" : "Moved to Stopped")}>
                      {med.is_archived ? "Taking it again" : "Stop taking (keep its history)"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onSelect={remove}>Delete…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" aria-label="Close" onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><X className="w-4 h-4" /></button>
              </div>
              <TabBar tabs={tabs} value={tab} onChange={setTab} />
            </div>
            <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
              {tab === "info" && <InfoTab med={med} run={run} alters={alters} />}
              {tab === "schedule" && <ScheduleTab med={med} run={run} />}
              {tab === "supply" && <SupplyTab med={med} doses={doses} run={run} />}
              {tab === "history" && <HistoryTab med={med} doses={doses} alters={alters} />}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
