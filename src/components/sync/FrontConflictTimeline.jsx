// Advanced front-conflict review: both devices' front history side by side,
// one row per device per day. The person picks a device for a span of
// days, overrides single days, and fine-tunes or removes single sessions.
// Rules and the meaning of every answer: src/lib/frontConflictTimeline.js.
// Nothing is written until Save; the bars show the result as it will be.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, ChevronUp, Undo2, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getAdvancedReview, applyAdvancedResolution } from "@/lib/frontConflicts";
import {
  BOTH, planAdvancedResolution, choiceForDay, dayKey, dayStart, shiftDay, sessionSpan, originOf,
} from "@/lib/frontConflictTimeline";
import { toLocalDatetimeValue, localDatetimeToISO } from "@/lib/dateTimeInput";

const DAY_MS = 864e5;
const UNKNOWN = "__unknown";

const toInput = (iso) => toLocalDatetimeValue(iso);
const fromInput = (v) => localDatetimeToISO(v) ?? undefined;
const dayTitle = (key) => new Date(dayStart(key)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");

export default function FrontConflictTimeline({ onClose, onSaved }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [review, setReview] = useState(null);
  const [alters, setAlters] = useState([]);
  const [earlier, setEarlier] = useState(0);
  const [spans, setSpans] = useState([]);
  const [days, setDays] = useState({});
  const [edits, setEdits] = useState({});
  const [openId, setOpenId] = useState(null);
  const [spanDraft, setSpanDraft] = useState({ from: "", to: "", keep: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, a] = await Promise.all([getAdvancedReview(), base44.entities.Alter.list()]);
        if (!alive) return;
        setReview(r);
        setAlters(a || []);
        const first = r.days[0] || dayKey(r.now);
        const last = r.days[r.days.length - 1] || dayKey(r.now);
        setSpanDraft({ from: first, to: last, keep: r.thisDevice });
      } catch (e) {
        toast.error(e?.message || `Couldn't read the ${t.front} history.`);
        onClose?.();
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flaggedIds = useMemo(() => new Set(Object.keys(review?.flagged || {})), [review]);
  const originFor = useMemo(() => {
    if (!review) return () => null;
    const flaggedDevice = Object.fromEntries(Object.entries(review.flagged).map(([id, f]) => [id, f.device]));
    return (s) => originOf(s, { thisDevice: review.thisDevice, origins: review.origins, flagged: flaggedDevice });
  }, [review]);

  const shownDays = useMemo(() => {
    if (!review) return [];
    const set = new Set(review.days.length ? review.days : [dayKey(review.now)]);
    const first = [...set].sort()[0];
    for (let i = 1; i <= earlier; i++) set.add(shiftDay(first, -i));
    return [...set].sort();
  }, [review, earlier]);

  const plan = useMemo(() => {
    if (!review) return { writes: [], result: {}, error: null };
    try {
      return { ...planAdvancedResolution({ ...review, spans, days, edits }), error: null };
    } catch (e) {
      return { writes: [], result: {}, error: e.message };
    }
  }, [review, spans, days, edits]);

  if (!review) return null;

  const deviceLabel = (key) => {
    if (key === review.thisDevice) return "This device";
    if (key === UNKNOWN || !key) return "Not sure which device";
    return review.names[key] || "Your other device";
  };
  const alterOf = (s) => alters.find((a) => a.id === (s.alter_id || s.primary_alter_id));
  const nameOf = (s) => {
    const a = alterOf(s);
    return a ? (formatAlter(a) || a.name) : `Unknown ${t.alter}`;
  };

  // Devices that recorded anything on the days shown: this one first.
  const shownSessions = review.sessions.filter((s) => {
    const { start, end } = sessionSpan(plan.result[s.id] || s, review.now, flaggedIds);
    return shownDays.some((d) => start < dayStart(d) + DAY_MS && end >= dayStart(d));
  });
  const knownDevices = [...new Set([review.thisDevice, ...shownSessions.map(originFor).filter(Boolean)])];

  const answered = spans.length > 0 || Object.keys(days).length > 0 || Object.keys(edits).length > 0;
  const removedCount = plan.writes.filter((w) => w.patch.removed_at).length;
  const restoredCount = plan.writes.filter((w) => w.patch.removed_at === null).length;
  const changedCount = plan.writes.length - removedCount - restoredCount;

  const setEdit = (id, patch) => setEdits((prev) => {
    const next = { ...(prev[id] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const out = { ...prev };
    if (Object.keys(next).length) out[id] = next; else delete out[id];
    return out;
  });

  const addSpan = () => {
    const { from, to, keep } = spanDraft;
    if (!from || !to || !keep) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    setSpans((prev) => [...prev, { from: a, to: b, keep }]);
  };

  const save = async () => {
    setBusy(true);
    try {
      const n = await applyAdvancedResolution({ spans, days, edits });
      qc.invalidateQueries();
      toast.success(n ? `Saved. Sync will update your other device too.` : "Nothing needed changing.");
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const choiceButtons = (value, onPick, { allowFollow = false } = {}) => (
    <div className="flex flex-wrap gap-1">
      {[...knownDevices, BOTH].map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          className={`px-2 py-1 rounded-md text-xs border transition-colors ${value === key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
        >
          {key === BOTH ? "Keep both" : key === review.thisDevice ? "Use this device" : `Use ${deviceLabel(key)}`}
        </button>
      ))}
      {allowFollow && (
        <button type="button" onClick={() => onPick(null)} className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted">
          Reset day
        </button>
      )}
    </div>
  );

  const editor = (s) => {
    const r = plan.result[s.id] || s;
    const e = edits[s.id] || {};
    const live = r.is_active === true || (flaggedIds.has(s.id) && !r._removed && r.sync_demoted);
    return (
      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5 space-y-2" data-testid="session-editor">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{nameOf(s)} <span className="text-xs text-muted-foreground font-normal">· {deviceLabel(originFor(s) || UNKNOWN)}</span></p>
          <button type="button" onClick={() => setOpenId(null)} className="text-muted-foreground p-1" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {r._removed ? (
          <p className="text-xs text-muted-foreground">Removed from your {t.front} history. It stays in your data and backups, and you can put it back.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Started</span>
              <Input type="datetime-local" value={toInput(e.start_time || s.start_time)} onChange={(ev) => setEdit(s.id, { start_time: fromInput(ev.target.value) })} className="text-sm h-9" />
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Ended</span>
              <Input
                type="datetime-local"
                value={toInput(e.end_time !== undefined ? e.end_time : (live ? "" : s.end_time))}
                placeholder={`Still ${t.fronting}`}
                onChange={(ev) => setEdit(s.id, { end_time: fromInput(ev.target.value) })}
                className="text-sm h-9"
              />
              {live && e.end_time === undefined && <span className="block">Still {t.fronting}</span>}
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {r._removed ? (
            <Button size="sm" variant="outline" onClick={() => setEdit(s.id, { removed: false })}><RotateCcw className="w-3.5 h-3.5 mr-1" />Put back</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEdit(s.id, { removed: true })}><Trash2 className="w-3.5 h-3.5 mr-1" />Remove from history</Button>
          )}
          {edits[s.id] && (
            <Button size="sm" variant="ghost" onClick={() => setEdits((prev) => { const o = { ...prev }; delete o[s.id]; return o; })}>
              <Undo2 className="w-3.5 h-3.5 mr-1" />Undo my changes
            </Button>
          )}
        </div>
      </div>
    );
  };

  const dayCard = (day) => {
    const from = dayStart(day);
    const to = from + DAY_MS;
    const choice = choiceForDay(day, { spans, days });
    const inDay = review.sessions
      .map((s) => ({ s, r: plan.result[s.id] || s }))
      .map((x) => ({ ...x, ...sessionSpan(x.r, review.now, flaggedIds) }))
      .filter((x) => x.start < to && x.end >= from);
    const lanes = [...knownDevices, UNKNOWN]
      .map((key) => ({ key, items: inDay.filter((x) => (originFor(x.s) || UNKNOWN) === key) }))
      .filter((l) => l.items.length || l.key === review.thisDevice);
    const open = inDay.find((x) => x.s.id === openId);
    return (
      <div key={day} className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="conflict-day">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{dayTitle(day)}</p>
          {choiceButtons(days[day] ? choice : (choice === BOTH && !spans.length ? null : choice), (key) => setDays((prev) => {
            const o = { ...prev };
            if (key === null) delete o[day]; else o[day] = key;
            return o;
          }), { allowFollow: !!days[day] })}
        </div>
        <div className="relative pl-0">
          <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
            {["12a", "6a", "12p", "6p", "12a"].map((h, i) => <span key={i}>{h}</span>)}
          </div>
          {lanes.map((lane) => (
            <div key={lane.key} className="mt-1">
              <p className="text-[11px] text-muted-foreground mb-0.5">{deviceLabel(lane.key)}</p>
              <div className="relative h-7 rounded-md bg-muted/50 overflow-hidden">
                {[0.25, 0.5, 0.75].map((f) => <div key={f} className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: `${f * 100}%` }} />)}
                {lane.items.map(({ s, r, start, end }) => {
                  const left = Math.max(0, (start - from) / DAY_MS) * 100;
                  const right = Math.min(1, (end - from) / DAY_MS) * 100;
                  const color = alterOf(s)?.color || "hsl(var(--primary))";
                  const removed = r._removed;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setOpenId(openId === s.id ? null : s.id)}
                      title={`${nameOf(s)} ${clock(r.start_time)}–${r.is_active ? `now` : clock(r.end_time)}`}
                      aria-label={`${nameOf(s)}, ${clock(r.start_time)} to ${r.is_active ? "now" : clock(r.end_time)}${removed ? ", removed" : ""}`}
                      data-testid="session-bar"
                      className={`absolute top-0.5 bottom-0.5 rounded-sm text-[10px] leading-6 px-1 truncate text-left text-white ${openId === s.id ? "ring-2 ring-foreground z-10" : ""} ${r._changed && !removed ? "outline outline-1 outline-offset-1 outline-primary" : ""}`}
                      style={{
                        left: `${left}%`,
                        width: `max(6px, ${right - left}%)`,
                        backgroundColor: removed ? "transparent" : color,
                        backgroundImage: removed ? `repeating-linear-gradient(135deg, ${color}55 0 4px, transparent 4px 8px)` : "none",
                        color: removed ? "hsl(var(--muted-foreground))" : undefined,
                        textDecoration: removed ? "line-through" : undefined,
                      }}
                    >
                      {nameOf(s)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {open && editor(open.s)}
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "var(--os-sab, 0px)" }}
      role="dialog"
      aria-label={`Compare ${t.front} history between devices`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Compare {t.front} history</p>
          <p className="text-xs text-muted-foreground">Pick which device was right, day by day. Tap a bar to change its times.</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 -mr-2 text-muted-foreground" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 max-w-3xl w-full mx-auto">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="span-card">
          <p className="text-sm font-medium">For a span of days</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground space-y-1"><span>From</span>
              <Input type="date" value={spanDraft.from} onChange={(e) => setSpanDraft((d) => ({ ...d, from: e.target.value }))} className="h-9 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground space-y-1"><span>To</span>
              <Input type="date" value={spanDraft.to} onChange={(e) => setSpanDraft((d) => ({ ...d, to: e.target.value }))} className="h-9 text-sm" />
            </label>
          </div>
          {choiceButtons(spanDraft.keep, (key) => setSpanDraft((d) => ({ ...d, keep: key })))}
          <Button size="sm" onClick={addSpan} disabled={!spanDraft.from || !spanDraft.to || !spanDraft.keep}>Apply to these days</Button>
          {spans.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {spans.map((sp, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {dayTitle(sp.from)}{sp.to !== sp.from ? ` – ${dayTitle(sp.to)}` : ""}: {sp.keep === BOTH ? "both" : deviceLabel(sp.keep)}
                  <button type="button" onClick={() => setSpans((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove this span"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Using one device removes the other device&apos;s sessions that started on those days. Sessions from an unknown device only change when you edit them.</p>
        </div>

        <button type="button" onClick={() => setEarlier((n) => n + 1)} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground py-1 hover:text-foreground">
          <ChevronUp className="w-3.5 h-3.5" /> Show an earlier day
        </button>
        {shownDays.map(dayCard)}
      </div>

      <div className="border-t border-border px-4 py-3 bg-card">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" data-testid="plan-summary">
            {plan.error ? <span className="text-destructive">{plan.error}</span> : (
              answered && plan.writes.length
                ? [removedCount && `${removedCount} removed`, restoredCount && `${restoredCount} put back`, changedCount && `${changedCount} changed`].filter(Boolean).join(", ")
                : "No changes yet"
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={busy || !!plan.error}>Save</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
