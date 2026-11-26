// The Day's editing sheets, in the house's look (boards 01-Main's Info and
// 10-Inspector's grammar). Every one writes ONLY through the record's own
// write path:
//
//   Split a {fronting} session      splitFrontSession   (frontSessionEdit.js)
//   Add {fronting} that happened    addPastFrontSessions
//   End now                         endFrontSession
//   Remove from history             removeFrontSession  (to the trash, with Undo)
//   It was someone else             reassignFrontSession / undoFrontReassign
//
// The session's times-and-level form, a symptom episode's form, a check-in
// at a past time and the day's tally are the old ones, reused as they are
// (AlterSessionEdit, SymptomSessionPopup, QuickCheckInModal, DailyTallyPanel),
// so there is still one editor per record.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Heart, Users } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontLevels, getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import {
  splitFrontSession, addPastFrontSessions, removeFrontSession, endFrontSession, reassignFrontSession, undoFrontReassign,
} from "@/lib/frontSessionEdit";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { Button } from "@/house/kit/Button";
import { Sheet, ConfirmSheet } from "@/house/kit/Sheet";
import { TimeField, DateField } from "@/house/kit/Field";
import { Checkbox, RadioGroup } from "@/house/kit/Choices";
import { AlterPicker } from "@/house/kit/Pickers";
import { AlterChip } from "@/house/kit/Content";
import { showToast, trashWithUndo } from "@/house/kit/Toast";
import { timeOnDay, hhmmOf, dayKeyOf, parseDayKey } from "@/house/day/dayView";

const FRONT_KEYS = [["frontHistory"], ["activeFront"], ["frontingSessions"]];
export function useRefreshFront() {
  const qc = useQueryClient();
  return () => { for (const key of FRONT_KEYS) qc.invalidateQueries({ queryKey: key, refetchType: "all" }); };
}

const dayOfSession = (s) => { const d = new Date(s?.start_time || Date.now()); d.setHours(0, 0, 0, 0); return d; };

// ── Split ─────────────────────────────────────────────────────────────
export function SplitSheet({ open, session, alter, onClose }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const levelCfg = useFrontLevels();
  const refresh = useRefreshFront();
  const seed = session?.alter_id ? session : { ...session, is_primary: session?.primary_alter_id === alter?.id };
  const current = session ? getSessionLevel(seed, levelCfg) : null;
  const [time, setTime] = useState("");
  const [level, setLevel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!open || !session) return;
    const end = session.end_time ? new Date(session.end_time).getTime() : Date.now();
    const mid = new Date((new Date(session.start_time).getTime() + end) / 2);
    setTime(hhmmOf(mid, 5)); setLevel(null); setBusy(null);
  }, [open, session]);
  if (!session) return null;
  const name = alter ? formatAlter(alter) : terms.Alter;
  const at = timeOnDay(dayOfSession(session), time);
  const run = async (action) => {
    setBusy(action);
    try {
      await splitFrontSession({ session, alterId: alter?.id || session.alter_id, at, action, levelId: action === "level" ? (level || current?.id || levelCfg.levels[0]?.id) : null, levelCfg });
      refresh();
      showToast({ message: action === "end" ? `${name} is out of ${terms.front} from ${time}.` : `${name}'s session is split at ${time}.`, detail: "The session before it is in Recent changes." });
      onClose?.();
    } catch (e) {
      showToast({ tone: "failed", message: "Couldn't split the session.", detail: `${e?.message || ""} Your data is safe.`.trim() });
      setBusy(null);
    }
  };
  const levels = levelCfg.levels.map((l) => ({ value: l.id, label: frontLevelLabel(l, terms) }));
  return (
    <Sheet open={open} onClose={onClose} title={`Split ${name}'s session`} size="half" holdsTyping>
      <div className="hd-form">
        <TimeField label="Split at" value={time} onChange={setTime} onInvalidChange={setBad} step={5} />
        {levels.length > 1 ? (
          <RadioGroup label={`From then, their ${terms.fronting} level is`} options={levels}
            value={level || current?.id || levels[0]?.value} onChange={setLevel} name="hd-split-level" />
        ) : null}
        <div className="hd-actions hd-wrap">
          <Button rank="primary" busy={busy === "level"} onClick={() => run("level")}
            disabledReason={bad || !at ? "Fix the time first" : undefined}>Split here</Button>
          <Button rank="secondary" busy={busy === "end"} onClick={() => run("end")}
            disabledReason={bad || !at ? "Fix the time first" : undefined}>{`Out of ${terms.front} at ${time || "…"}`}</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Add fronting that already happened ────────────────────────────────
export function AddPastFrontSheet({ open, day, start: startProp, onClose }) {
  const terms = useTerms();
  const levelCfg = useFrontLevels();
  const refresh = useRefreshFront();
  const [date, setDate] = useState(dayKeyOf(day || new Date()));
  const [start, setStart] = useState(startProp || "09:00");
  const [end, setEnd] = useState("");
  const [still, setStill] = useState(false);
  const [picked, setPicked] = useState({ ids: [], levels: {} });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState({});
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  useEffect(() => {
    if (!open) return;
    setDate(dayKeyOf(day || new Date())); setStart(startProp || "09:00"); setEnd(""); setStill(false); setPicked({ ids: [], levels: {} }); setBusy(false);
  }, [open, day, startProp]);
  const theDay = parseDayKey(date) || day || new Date();
  const startIso = timeOnDay(theDay, start);
  const endIso = still ? null : timeOnDay(theDay, end);
  const reason = Object.values(bad).some(Boolean) ? "Fix the times first"
    : !picked.ids.length ? `Choose who was ${terms.fronting}`
      : !startIso ? "Pick a start time"
        : (!still && !endIso) ? `Pick an end, or tick "Still ${terms.fronting}"`
          : (endIso && endIso <= startIso) ? "The end has to be after the start" : undefined;
  const save = async () => {
    setBusy(true);
    try {
      await addPastFrontSessions({
        start: startIso, end: endIso,
        selections: picked.ids.map((id) => ({ alterId: id, levelId: picked.levels[id] || levelCfg.levels[0]?.id })),
        levelCfg,
      });
      refresh();
      showToast({ message: `${terms.Fronting} added for ${start}${endIso ? `–${end}` : ""}.`, detail: "Change or remove it from its Info." });
      onClose?.();
    } catch (e) {
      showToast({ tone: "failed", message: "Couldn't add that.", detail: `${e?.message || ""} Your data is safe.`.trim() });
      setBusy(false);
    }
  };
  const byId = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  return (
    <>
      <Sheet open={open && !pickerOpen} onClose={onClose} title={`Add ${terms.fronting} that already happened`} size="half" holdsTyping
        footer={<Button rank="primary" block busy={busy} busyLabel="Saving…" onClick={save} disabledReason={reason}>Add it</Button>}>
        <div className="hd-form">
          <DateField label="Day" value={date} onChange={(v) => v && setDate(v)} onInvalidChange={(b) => setBad((x) => ({ ...x, date: b }))} />
          <div className="hd-pair">
            <TimeField label="From" value={start} onChange={setStart} onInvalidChange={(b) => setBad((x) => ({ ...x, start: b }))} step={5} />
            {still ? null : <TimeField label="Until" value={end} onChange={setEnd} onInvalidChange={(b) => setBad((x) => ({ ...x, end: b }))} step={5} />}
          </div>
          <Checkbox label={`Still ${terms.fronting} (no end yet)`} checked={still} onChange={setStill} />
          <div className="hd-who">
            <p className="hd-label house-label">{`Who was ${terms.fronting}?`}</p>
            {picked.ids.length ? (
              <div className="hd-chips">{picked.ids.map((id) => (byId[id] ? <AlterChip key={id} alter={byId[id]} size="sm" /> : null))}</div>
            ) : null}
            <Button rank="secondary" icon={Users} onClick={() => setPickerOpen(true)}>
              {picked.ids.length ? `Change ${terms.alters} or levels` : `Choose ${terms.alters}`}
            </Button>
          </div>
        </div>
      </Sheet>
      <SetFrontModal open={open && pickerOpen} onClose={() => setPickerOpen(false)} selectionMode withLevels={levelCfg.enabled}
        preselectedIds={picked.ids} preselectedLevels={picked.levels}
        selectionTitle={`Who was ${terms.fronting}?`} selectionHint="Tap to add or remove." confirmLabel="Done"
        onConfirm={(ids, extra) => setPicked({ ids, levels: extra?.levels || {} })} />
    </>
  );
}

// ── It was someone else ───────────────────────────────────────────────
export function ReassignSheet({ open, session, alter, onClose }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const refresh = useRefreshFront();
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(null); setBusy(false); } }, [open]);
  if (!session) return null;
  const fromId = alter?.id || session.alter_id || session.primary_alter_id;
  const name = alter ? formatAlter(alter) : terms.Alter;
  const save = async () => {
    setBusy(true);
    try {
      const result = await reassignFrontSession({ session, fromAlterId: fromId, toAlterId: to, mode: "move" });
      refresh();
      showToast({
        message: `That session is now someone else's.`,
        detail: "The session as it was is in Recent changes.",
        action: { label: "Undo", onClick: async () => {
          try { await undoFrontReassign(result); refresh(); showToast({ message: `It's ${name}'s again.` }); }
          catch (e) { showToast({ tone: "failed", message: "Couldn't undo.", detail: `${e?.message || ""} The session before is in Recent changes.`.trim() }); }
        } },
      });
      onClose?.();
    } catch (e) {
      showToast({ tone: "failed", message: "Couldn't change who it was.", detail: `${e?.message || ""} Your data is safe.`.trim() });
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`It wasn't ${name}`} size="half"
      footer={<Button rank="primary" block busy={busy} busyLabel="Saving…" onClick={save} disabledReason={to ? undefined : `Choose who it was`}>Save</Button>}>
      <div className="hd-form">
        <p className="hd-p">{`The whole session moves to the ${terms.alter} you pick. Notes and feelings go with it.`}</p>
        <AlterPicker label="Who it was" value={to} onChange={setTo} showNone={false} disabledIds={fromId ? [fromId] : undefined} />
      </div>
    </Sheet>
  );
}

// ── Remove from history (to the trash, with Undo) ─────────────────────
export function RemoveSessionConfirm({ open, session, alter, onClose, onDone }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const refresh = useRefreshFront();
  if (!session) return null;
  const name = alter ? `${formatAlter(alter)}'s session` : "this session";
  return (
    <ConfirmSheet open={open} thing={name} verb="Remove"
      detail={`Only this ${terms.fronting} session goes; the rest of the day stays.`}
      onCancel={onClose}
      onConfirm={async () => {
        const ok = await trashWithUndo({ thing: name, run: () => removeFrontSession({ session, alterId: alter?.id || session.alter_id }), refresh });
        onClose?.();
        if (ok) onDone?.();
      }} />
  );
}

/** End a live session now (the old popover's "End now"). */
export async function endSessionNow({ session, alterId, refresh, name, terms }) {
  try {
    await endFrontSession({ session, alterId });
    refresh?.();
    showToast({ message: `${name} is out of ${terms.front}.`, detail: "The session is on the timeline; change it from its Info." });
  } catch (e) {
    showToast({ tone: "failed", message: "Couldn't end the session.", detail: `${e?.message || ""} Your data is safe.`.trim() });
  }
}

// ── Add at a time (the old long-press picker) ─────────────────────────
export function AddAtSheet({ open, day, onClose, onFront, onCheckIn }) {
  const terms = useTerms();
  const [time, setTime] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => { if (open) setTime(hhmmOf(new Date(), 15)); }, [open]);
  const why = bad || !time ? "Fix the time first" : undefined;
  return (
    <Sheet open={open} onClose={onClose} title="Add something you missed" size="half">
      <div className="hd-form">
        <TimeField label="At" value={time} onChange={setTime} onInvalidChange={setBad} step={15} />
        <p className="hd-p">{`On ${new Date(day || Date.now()).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.`}</p>
        <div className="hd-actions hd-stack">
          <Button rank="secondary" icon={Users} block onClick={() => onFront?.(time)} disabledReason={why}>{`Who was ${terms.fronting}`}</Button>
          <Button rank="secondary" icon={Heart} block onClick={() => onCheckIn?.(time)} disabledReason={why}>A check-in: feelings, symptoms, a note</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Go to a day (the old date box and Jump) ───────────────────────────
export function GoToDaySheet({ open, day, onClose, onGo }) {
  const [value, setValue] = useState(dayKeyOf(day || new Date()));
  const [bad, setBad] = useState(false);
  useEffect(() => { if (open) setValue(dayKeyOf(day || new Date())); }, [open, day]);
  return (
    <Sheet open={open} onClose={onClose} title="Go to a day" size="half"
      footer={(
        <div className="hd-actions">
          <Button rank="secondary" onClick={() => { onGo?.(new Date()); onClose?.(); }}>Today</Button>
          <Button rank="primary" onClick={() => { const d = parseDayKey(value); if (d) { onGo?.(d); onClose?.(); } }}
            disabledReason={bad || !parseDayKey(value) ? "Fix the date first" : undefined}>Go</Button>
        </div>
      )}>
      <div className="hd-form">
        <DateField label="Day" value={value} onChange={(v) => v && setValue(v)} onInvalidChange={setBad} openInline />
      </div>
    </Sheet>
  );
}
