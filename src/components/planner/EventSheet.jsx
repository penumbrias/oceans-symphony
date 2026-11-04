// THE event sheet (v0.348.0): reads, creates and edits a planner event —
// a date to remember like payday or a birthday (owner ask, 2026-11-04).
// No time, no length, nothing to mark done; it can repeat for ever.
//
// Every door opens this one sheet: the plan editor's "It's an event"
// switch (hands the draft over), the plans list's "+ Event", and tapping an
// event chip anywhere (planner calendars, timeline, Coming up, Today).
//
// request:
//   { create: true, title?, date?: "YYYY-MM-DD", alterIds?, notes? }
//   { event, occurrenceKey? }   — opens on its details; Edit is one tap
//
// Built like the activity editor (same shell, same detail chips, same Who
// list and colour row) so the two read as one family.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Bell, CalendarHeart, ChevronLeft, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/shared/ConfirmDialog";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import DetailChip from "@/components/shared/DetailChip";
import { Segmented } from "@/components/shared/SettingRows";
import PlanColorTagPicker from "@/components/activities/PlanColorTagPicker";
import { SearchableMultiList } from "@/v2/widgets";
import { isLogCommandError } from "@/lib/authoredText";
import {
  PLANNER_EVENTS_KEY, savePlannerEvent, skipEventDate, deletePlannerEvent,
} from "@/lib/plannerEvents";
import {
  EVENT_REPEATS, repeatOf, parseDayKey, dayKey, nextOccurrence, yearsSinceFirst,
  EVENT_REMINDER_DAYS, reminderDaysOf, reminderTimeOf,
} from "@/lib/plannerEventDates";
import { ensureEventReminderPermission } from "@/lib/eventReminderScheduler";
import { normalizeHex } from "@/lib/planTagColor";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useAlterSorter } from "@/lib/alterSort";

const chipCls = (on) => `text-xs px-2.5 py-1 rounded-full border ${
  on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
}`;

const SectionLabel = ({ children }) => (
  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground -mb-1">{children}</p>
);

// A year after a day key — the first guess for "Ends on a date".
function aYearOn(key) {
  const d = parseDayKey(key);
  if (!d) return key;
  d.setFullYear(d.getFullYear() + 1);
  return dayKey(d);
}

// "On the day and the day before, at 09:00" — the reminder line.
export function eventReminderSummary(ev, tr) {
  const days = reminderDaysOf(ev);
  if (!days.length) return "";
  const list = days.map((d) => tr(`event.remindShort.${d}`)).join(", ");
  return tr("event.remindSummary", { days: list, time: reminderTimeOf(ev) });
}

// "Every 2 weeks from Fri 6 Nov 2026 until …" — shared with the plans list.
export function eventRepeatSummary(ev, tr) {
  const repeat = repeatOf(ev);
  const first = parseDayKey(ev?.date);
  if (!first) return "";
  const from = format(first, "EEE d MMM yyyy");
  if (repeat === "none") return from;
  const until = parseDayKey(ev.until);
  const label = tr(`event.repeat.${repeat}`);
  return until
    ? tr("event.summaryUntil", { repeat: label, from, until: format(until, "d MMM yyyy") })
    : tr("event.summary", { repeat: label, from });
}

export default function EventSheet({ request, onClose, onBack = null }) {
  const t = useTerms();
  const tr = useT();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!request });

  const existing = request && !request.create ? request.event : null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) { setForm(null); return; }
    const ev = request.create ? null : request.event;
    setEditing(!!request.create);
    setOpen({});
    setForm({
      title: ev?.title || request.title || "",
      date: ev?.date || request.date || dayKey(new Date()),
      repeat: ev ? repeatOf(ev) : "none",
      until: ev?.until || "",
      untilOn: !!ev?.until,
      notes: ev?.notes || request.notes || "",
      tagColor: ev?.tag_color || null,
      alterIds: ev?.alter_ids || request.alterIds || [],
      reminders: reminderDaysOf(ev),
      reminderTime: reminderTimeOf(ev),
    });
  }, [request]);

  const sorter = useAlterSorter("symphony_planner_alter_sort");
  const memberOptions = useMemo(
    () => sorter.sort(alters.filter((a) => !a.is_archived))
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatarUrl: a.avatar_url })),
    [alters, sorter, formatAlter]
  );

  if (!request || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const has = {
    who: form.alterIds.length > 0,
    notes: !!form.notes.trim(),
    tag: !!normalizeHex(form.tagColor || ""),
    remind: form.reminders.length > 0,
  };
  const isOpen = (k) => open[k] ?? has[k];
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }));
  const canSave = !!form.title.trim() && !!parseDayKey(form.date);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const rec = await savePlannerEvent({
        id: existing?.id,
        title: form.title,
        date: form.date,
        repeat: form.repeat,
        until: form.untilOn ? form.until : null,
        notes: form.notes,
        tagColor: form.tagColor,
        alterIds: form.alterIds,
        reminders: form.reminders,
        reminderTime: form.reminderTime,
      }, { alters, terms: t });
      if (!rec) return; // backed out of the whisper warning
      // Ask for notification permission the first time a reminder is on.
      // Saving the event re-syncs the OS queue (useEventReminderSync).
      if (form.reminders.length) await ensureEventReminderPermission();
      qc.invalidateQueries({ queryKey: PLANNER_EVENTS_KEY });
      toast.success(tr("event.saved"));
      onClose?.();
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : (e?.message || "Failed"));
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: tr("event.deleteTitle", { name: existing.title || tr("event.kind") }),
      body: repeatOf(existing) === "none" ? tr("event.deleteBodyOnce") : tr("event.deleteBody"),
      confirmLabel: tr("event.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePlannerEvent(existing.id);
      qc.invalidateQueries({ queryKey: PLANNER_EVENTS_KEY });
      toast.success(tr("event.deleted"));
      onClose?.();
    } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const skip = async () => {
    const key = request.occurrenceKey;
    if (!existing || !key) return;
    try {
      await skipEventDate(existing.id, key);
      qc.invalidateQueries({ queryKey: PLANNER_EVENTS_KEY });
      toast.success(tr("event.skipped", { date: format(parseDayKey(key), "EEE d MMM") }));
      onClose?.();
    } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const shell = (children) => createPortal((
    <div className="fixed inset-0 z-[72] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        {children}
      </div>
    </div>
  ), document.body);

  // ── Details (an existing event, before Edit) ─────────────────────
  if (existing && !editing) {
    const shownKey = request.occurrenceKey || nextOccurrence(existing)?.key || existing.date;
    const shown = parseDayKey(shownKey);
    const years = shown ? yearsSinceFirst(existing, shown) : null;
    const who = (existing.alter_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean);
    const tag = normalizeHex(existing.tag_color || "");
    return shell(
      <>
        <div className="flex items-start gap-2">
          <button type="button" onClick={onClose} aria-label={tr("planner.close")} title={tr("planner.close")}
            className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="flex-1 min-w-0 text-sm font-semibold break-words flex items-center gap-1.5">
            {tag && <span aria-hidden className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tag }} />}
            {existing.title}
          </p>
          <span className="text-[0.625em] uppercase tracking-wide text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 flex-shrink-0">
            {tr("event.kind")}
          </span>
        </div>
        <div className="space-y-1 text-sm">
          {shown && (
            <p className="flex items-center gap-1.5">
              <CalendarHeart className="w-4 h-4 text-[var(--v2-accent)] flex-shrink-0" />
              {format(shown, "EEEE d MMMM yyyy")}
            </p>
          )}
          {repeatOf(existing) !== "none" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 flex-shrink-0" />{eventRepeatSummary(existing, tr)}
            </p>
          )}
          {years && (
            <p className="text-xs text-muted-foreground">
              {tr("event.years", { count: years, year: parseDayKey(existing.date).getFullYear() })}
            </p>
          )}
          {reminderDaysOf(existing).length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 flex-shrink-0" />{eventReminderSummary(existing, tr)}
            </p>
          )}
        </div>
        {who.length > 0 && (
          <div>
            <SectionLabel>{tr("planner.who")}</SectionLabel>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {who.map((a) => (
                <span key={a.id} className="text-xs px-2 py-0.5 rounded-full border border-border/60 flex items-center gap-1">
                  {a.color && <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />}{formatAlter(a)}
                </span>
              ))}
            </div>
          </div>
        )}
        {existing.notes && (
          <div>
            <SectionLabel>{tr("planner.notes")}</SectionLabel>
            <p className="text-sm whitespace-pre-wrap break-words mt-1.5"><RichText content={existing.notes} /></p>
          </div>
        )}
        <div className="space-y-1.5">
          <Button className="w-full" onClick={() => setEditing(true)}>{tr("event.edit")}</Button>
          {repeatOf(existing) !== "none" && request.occurrenceKey && (
            <Button variant="outline" className="w-full" onClick={skip}>{tr("event.skip")}</Button>
          )}
          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={remove}>
            {tr("event.delete")}
          </Button>
        </div>
      </>
    );
  }

  // ── Form (new, or Edit) ──────────────────────────────────────────
  return shell(
    <>
      <div className="flex items-start justify-between gap-2">
        <button type="button"
          onClick={() => (existing ? setEditing(false) : (onBack || onClose)?.())}
          aria-label={onBack && !existing ? tr("event.back") : tr("planner.close")}
          title={onBack && !existing ? tr("event.back") : tr("planner.close")}
          className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input value={form.title} autoFocus={!form.title}
          placeholder={tr("event.namePlaceholder")} aria-label={tr("event.namePlaceholder")}
          onChange={(e) => set({ title: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none focus:border-b focus:border-[var(--v2-accent)]" />
        <span className="text-[0.625em] uppercase tracking-wide text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 flex-shrink-0">
          {tr("event.kind")}
        </span>
      </div>
      <p className="text-[0.6875em] text-muted-foreground -mt-1">{tr("event.toggleHint")}</p>

      <SectionLabel>{tr("planner.when")}</SectionLabel>
      <label className="block text-xs text-muted-foreground">
        {form.repeat === "none" ? tr("event.date") : tr("event.firstDate")}
        <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })}
          className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm text-foreground" />
      </label>
      <div>
        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Repeat className="w-3 h-3" /> {tr("event.repeat")}</p>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={tr("event.repeat")}>
          {EVENT_REPEATS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={form.repeat === r}
              onClick={() => set({ repeat: r })} className={chipCls(form.repeat === r)}>
              {tr(`event.repeat.${r}`)}
            </button>
          ))}
        </div>
      </div>
      {form.repeat !== "none" && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">{tr("event.until")}</p>
          <Segmented label={tr("event.until")} value={form.untilOn ? "on" : "never"}
            options={[{ value: "never", label: tr("event.untilNever") }, { value: "on", label: tr("event.untilOn") }]}
            onChange={(v) => set(v === "on" ? { untilOn: true, until: form.until || aYearOn(form.date) } : { untilOn: false })} />
          {form.untilOn && (
            <input type="date" value={form.until} min={form.date} aria-label={tr("event.until")}
              onChange={(e) => set({ until: e.target.value })}
              className="mt-1.5 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
          )}
        </div>
      )}

      <SectionLabel>{tr("planner.details")}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <DetailChip open={isOpen("who")} has={has.who} onToggle={() => toggle("who")}
          label={form.alterIds.length && !isOpen("who") ? `${tr("planner.who")} · ${form.alterIds.length}` : tr("planner.who")} />
        <DetailChip open={isOpen("notes")} has={has.notes} onToggle={() => toggle("notes")} label={tr("planner.notes")} />
        <DetailChip open={isOpen("tag")} has={has.tag} onToggle={() => toggle("tag")} label={tr("planner.colorTag")} />
        <DetailChip open={isOpen("remind")} has={has.remind} onToggle={() => toggle("remind")} label={tr("event.remind")} />
      </div>
      {isOpen("who") && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs text-muted-foreground">{tr("event.whoHint")}</p>
            <AlterSortToggle sorter={sorter} />
          </div>
          <SearchableMultiList
            options={memberOptions}
            selectedIds={form.alterIds}
            onToggle={(id) => set({ alterIds: form.alterIds.includes(id) ? form.alterIds.filter((x) => x !== id) : [...form.alterIds, id] })}
            searchPlaceholder={tr("planner.searchMembers", { members: t.alters })}
          />
        </div>
      )}
      {isOpen("notes") && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">{tr("planner.notes")}</p>
          <MentionTextarea value={form.notes} onChange={(v) => set({ notes: v })} alters={alters} signposts rows={2}
            placeholder={tr("event.notesPlaceholder")}
            className="w-full rounded-lg border border-input bg-background text-sm p-2" />
        </div>
      )}
      {isOpen("tag") && (
        <PlanColorTagPicker value={form.tagColor} onChange={(hex) => set({ tagColor: normalizeHex(hex || "") || null })}
          hint={tr("event.colorHint")} />
      )}

      {isOpen("remind") && (
        <div>
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Bell className="w-3 h-3" /> {tr("event.remindHint")}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={tr("event.remind")}>
            {EVENT_REMINDER_DAYS.map((d) => {
              const on = form.reminders.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} className={chipCls(on)}
                  onClick={() => set({ reminders: on ? form.reminders.filter((x) => x !== d) : [...form.reminders, d].sort((a, b) => a - b) })}>
                  {tr(`event.remind.${d}`)}
                </button>
              );
            })}
          </div>
          {form.reminders.length > 0 && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              {tr("event.remindAt")}
              <input type="time" value={form.reminderTime} onChange={(e) => set({ reminderTime: e.target.value || "09:00" })}
                className="h-8 px-2 rounded-lg border border-input bg-background text-sm text-foreground" />
            </label>
          )}
        </div>
      )}

      <Button className="w-full" disabled={!canSave || saving} onClick={save}>
        {existing ? tr("event.saveChanges") : tr("event.save")}
      </Button>
    </>
  );
}
