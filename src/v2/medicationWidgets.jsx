// Medication widgets (v0.367.0): today's doses, the medication list, and
// the refill outlook. Each is one Section (docs/widget-contract.md), reads
// the same helpers as the Medications page (src/lib/medications.js) and
// writes only through them. Tapping a medication opens its one sheet
// (MedicationSheet), the same from every door.
//
// They can go on any board — home, a profile, the Medications page.
// Medicines belong to the body, not to one alter, so there is no Whose
// picker; each dose marked records who was there.

import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { Section, Row, Muted, TextAction, useWidgetMode } from "@/v2/primitives";
import MedicationSheet from "@/components/medications/MedicationSheet";
import { clockOpts } from "@/lib/timeFormat";
import {
  useMedications, useMedicationDoses, refreshMedications, createMedication, markDose, unmarkDose,
  dosesOnDay, asNeededTakenOn, isActiveMed, supplyOf, supplyLabel, courseLabel, dayKey,
} from "@/lib/medications";
import { useEmergencyCard } from "@/lib/useEmergencyCard";

const limitOf = (settings, fallback) => {
  const n = parseInt(settings?.limit, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const fmtClock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() });
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

// A small bordered button inside a row — the widget's accent, em-sized.
function Pill({ onClick, children, label, strong = false }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label}
      className="h-[2.75em] min-w-[3em] px-[0.9em] rounded-full text-[1em] font-medium"
      style={{
        border: "1px solid var(--v2-accent, hsl(var(--primary)))",
        ...(strong ? { background: "var(--v2-accent, hsl(var(--primary)))", color: "hsl(var(--primary-foreground))" } : { color: "var(--v2-accent, hsl(var(--primary)))" }),
      }}>
      {children}
    </button>
  );
}

// A row that also holds buttons can't be a button itself (no button inside
// a button), so its name is the door to the sheet.
function NameButton({ name, onClick }) {
  return (
    <button type="button" onClick={onClick} className="truncate text-left hover:underline max-w-full">{name}</button>
  );
}

// The sheet every row opens.
function useSheet() {
  const [state, setState] = useState(null);
  const open = (id, tab = "info") => setState({ id, tab });
  const sheet = (
    <MedicationSheet open={!!state} medicationId={state?.id} initialTab={state?.tab || "info"} onClose={() => setState(null)} />
  );
  return { open, sheet };
}

function useRun() {
  const qc = useQueryClient();
  return async (fn, done = null) => {
    try {
      await fn();
      refreshMedications(qc);
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    }
  };
}

// ── Today ────────────────────────────────────────────────────────────

export function MedsTodayWidget({ settings }) {
  const mode = useWidgetMode();
  const { medications, isFetched } = useMedications();
  const { doses } = useMedicationDoses();
  const { open, sheet } = useSheet();
  const run = useRun();
  const now = new Date();
  const slots = useMemo(() => dosesOnDay(medications, doses, { now }), [medications, doses]); // eslint-disable-line react-hooks/exhaustive-deps
  const asNeeded = useMemo(
    () => (settings?.asNeeded === false ? [] : medications.filter((m) => isActiveMed(m) && m.as_needed).sort(byName)),
    [medications, settings?.asNeeded],
  );
  const takenPrn = useMemo(() => asNeededTakenOn(doses, dayKey(now)), [doses]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = slots.filter((s) => s.state === "due" || s.state === "later");
  const shown = mode === "minimal" ? pending.slice(0, 3) : slots;
  const done = slots.length - pending.length;

  if (!isFetched) return <Section label="Today's medications"><Muted>…</Muted></Section>;
  return (
    <Section label="Today's medications"
      action={slots.length > 0 ? <span className="text-[0.6875em] text-muted-foreground tabular-nums">{`${done} of ${slots.length}`}</span> : null}>
      {medications.filter(isActiveMed).length === 0 && <Muted>No medications yet. Add them on the Medications page.</Muted>}
      {medications.filter(isActiveMed).length > 0 && slots.length === 0 && asNeeded.length === 0 && <Muted>Nothing scheduled today.</Muted>}
      {mode === "minimal" && slots.length > 0 && pending.length === 0 && <Muted>All of today's doses are marked. 💜</Muted>}
      {shown.map((s) => {
        const time = fmtClock(s.at);
        let right;
        if (s.state === "taken" || s.state === "skipped") {
          right = (
            <span className="inline-flex items-center gap-1">
              <span>{s.state === "taken" ? `✓ ${fmtClock(new Date(s.dose.timestamp))}` : "Skipped"}</span>
              <Pill label={`Undo ${s.med.name} ${time}`} onClick={() => run(() => unmarkDose(s.dose))}>Undo</Pill>
            </span>
          );
        } else {
          right = (
            <span className="inline-flex items-center gap-1">
              <Pill label={`Skip ${s.med.name} ${time}`} onClick={() => run(() => markDose(s.med, { slot: s.slot, status: "skipped" }))}>Skip</Pill>
              <Pill strong label={`Took ${s.med.name} ${time}`} onClick={() => run(() => markDose(s.med, { slot: s.slot, status: "taken" }))}>Took it</Pill>
            </span>
          );
        }
        return (
          <Row key={`${s.med.id}-${s.slot}`} primary={<NameButton name={s.med.name} onClick={() => open(s.med.id, "schedule")} />}
            secondary={[time, s.med.dose, s.state === "due" ? "due" : null].filter(Boolean).join(" · ")}
            right={right} />
        );
      })}
      {mode !== "minimal" && asNeeded.length > 0 && (
        <>
          <p className="text-[0.6875em] font-semibold uppercase tracking-wide text-muted-foreground pt-1">As needed</p>
          {asNeeded.map((m) => {
            const today = takenPrn.get(m.id) || [];
            const last = today.length ? today[today.length - 1] : null;
            return (
              <Row key={m.id} primary={<NameButton name={m.name} onClick={() => open(m.id, "history")} />}
                secondary={today.length ? `${today.length} today · last ${fmtClock(new Date(last.timestamp))}` : m.dose || null}
                right={<Pill strong label={`Took ${m.name}`} onClick={() => run(() => markDose(m, { status: "taken" }), `${m.name} marked`)}>Took one</Pill>} />
            );
          })}
        </>
      )}
      {sheet}
    </Section>
  );
}

// ── The list ─────────────────────────────────────────────────────────

function AddRow({ onAdded, onCancel }) {
  const [name, setName] = useState("");
  const run = useRun();
  const add = () => {
    const n = name.trim();
    if (!n) return;
    run(async () => {
      const made = await createMedication({ name: n });
      setName("");
      onAdded(made);
    });
  };
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medication name" aria-label="Medication name" autoFocus
        className="flex-1 min-w-0 h-[2.25em] px-[0.75em] rounded-md bg-transparent text-[0.875em]"
        style={{ border: "1px solid var(--v2-accent, hsl(var(--border)))" }} />
      <Pill strong label="Add medication" onClick={add}>Add</Pill>
      <Pill label="Cancel" onClick={onCancel}>Cancel</Pill>
    </form>
  );
}

export function MedicationsWidget({ settings }) {
  const mode = useWidgetMode();
  const { medications, isFetched } = useMedications();
  const { doses } = useMedicationDoses();
  const { open, sheet } = useSheet();
  const [adding, setAdding] = useState(false);
  const [showStopped, setShowStopped] = useState(false);
  const active = useMemo(() => medications.filter(isActiveMed).sort(byName), [medications]);
  const stopped = useMemo(() => medications.filter((m) => m.is_archived).sort(byName), [medications]);
  const shown = mode === "expanded" ? active : active.slice(0, limitOf(settings, 6));

  const describe = (m) => {
    const bits = [m.dose, m.purpose];
    if (settings?.supply !== false) bits.push(supplyLabel(supplyOf(m, doses)));
    bits.push(courseLabel(m));
    return bits.filter(Boolean).join(" · ") || (m.as_needed ? "As needed" : null);
  };

  return (
    <Section label="Medications" action={!adding ? <TextAction onClick={() => setAdding(true)}>Add</TextAction> : null}>
      {adding && <AddRow onCancel={() => setAdding(false)} onAdded={(m) => { setAdding(false); if (m?.id) open(m.id); }} />}
      {isFetched && active.length === 0 && !adding && <Muted>No medications yet. Add one to keep track of doses and refills.</Muted>}
      {shown.map((m) => (
        <Row key={m.id} primary={m.name} secondary={describe(m)}
          right={supplyOf(m, doses)?.low ? "Refill soon" : null}
          onClick={() => open(m.id)} />
      ))}
      {mode !== "expanded" && active.length > shown.length && <Muted>{`and ${active.length - shown.length} more`}</Muted>}
      {mode === "expanded" && stopped.length > 0 && (
        <>
          <TextAction onClick={() => setShowStopped((v) => !v)}>{showStopped ? "Hide stopped" : `Stopped (${stopped.length})`}</TextAction>
          {showStopped && stopped.map((m) => (
            <Row key={m.id} primary={m.name} secondary={m.dose || null} onClick={() => open(m.id)} />
          ))}
        </>
      )}
      {sheet}
    </Section>
  );
}

// ── Refills ──────────────────────────────────────────────────────────

export function MedRefillsWidget({ settings }) {
  const mode = useWidgetMode();
  const { medications, isFetched } = useMedications();
  const { doses } = useMedicationDoses();
  const { open, sheet } = useSheet();
  const rows = useMemo(() => medications
    .filter(isActiveMed)
    .map((m) => ({ med: m, supply: supplyOf(m, doses) }))
    .filter((r) => r.supply)
    .sort((a, b) => (a.supply.daysLeft ?? 9999) - (b.supply.daysLeft ?? 9999)), [medications, doses]);
  const lowOnly = settings?.show === "low";
  const pool = lowOnly ? rows.filter((r) => r.supply.low) : rows;
  const shown = mode === "expanded" ? pool : pool.slice(0, limitOf(settings, 5));
  const missing = medications.filter(isActiveMed).length - rows.length;

  return (
    <Section label="Refills">
      {isFetched && rows.length === 0 && <Muted>Fill in a medication's last refill (on its Supply page) to see when it runs out.</Muted>}
      {lowOnly && rows.length > 0 && pool.length === 0 && <Muted>Nothing is running low.</Muted>}
      {shown.map(({ med, supply }) => (
        <Row key={med.id} primary={med.name}
          secondary={supply.courseEndsFirst ? `${supplyLabel(supply)} · course ends first` : supplyLabel(supply)}
          right={supply.low ? (supply.remaining <= 0 ? "Run out" : "Refill soon")
            : (supply.runOut ? format(supply.runOut, "d MMM") : null)}
          onClick={() => open(med.id, "supply")} />
      ))}
      {mode === "expanded" && missing > 0 && <Muted>{`${missing} without refill details.`}</Muted>}
      {sheet}
    </Section>
  );
}

// ── Emergency card (v0.368.0) ────────────────────────────────────────

// A door to the emergency card from any board: the first lines of it, and
// Show (full screen, ready to hand to someone).
export function EmergencyCardWidget() {
  const navigate = useNavigate();
  const mode = useWidgetMode();
  const { sections, isFetched } = useEmergencyCard();
  const first = sections.find((s) => s.id === "communication");
  const allergies = sections.find((s) => s.id === "allergies");
  return (
    <Section label="Emergency info" action={sections.length > 0 ? <TextAction onClick={() => navigate("/emergency?show=1")}>Show</TextAction> : null}>
      {isFetched && sections.length === 0 && (
        <Row primary="Fill in your emergency card" secondary={mode === "minimal" ? null : "What a helper should know"} onClick={() => navigate("/emergency?edit=1")} />
      )}
      {sections.length > 0 && (
        <>
          <Row primary={first ? first.lines[0] : "Your emergency card"} onClick={() => navigate("/emergency?show=1")} />
          {mode !== "minimal" && allergies && <Row primary="Allergies" secondary={allergies.lines.join(" ")} onClick={() => navigate("/emergency")} />}
        </>
      )}
    </Section>
  );
}
