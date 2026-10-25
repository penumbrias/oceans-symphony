// WHEN for any activity entry: a day, a start, and a length you can give
// either as "for how long" (hours + minutes, or a quick chip) or as "until"
// (an end date + time). Both edit the same start + length, so switching
// never changes what's saved. Owner ask (2026-10-23): every logging popup
// should let you set the time by duration — this is the one control they
// all use (ActivityEditor, and the check-in's compact length row).
//
// Controlled: `start` (Date) and `minutes` (number, or null = no length).
// onChange({ start, minutes }) hands back both every time.
//
// Tapping the "Starts" label swaps the clock field to "Ends" (owner ask,
// 2026-10-23: "it ended at 1:30pm and I did it for 45 minutes"). With the
// end as the anchor, the length works backwards: the end stays put and the
// start moves. Still the same start + length underneath.
//
// Owner asks, 2026-10-25: "Line up with…" opens the planner's day view to
// put this entry right before / after / with another one
// (ActivityAnchorPicker); "After the one just added" chains plans entered
// in bulk; a running activity's start can be given as how long ago it
// began; the For how long / Until switch is a segmented track so it never
// reads as one of the length chips; and the Ends/From date + time split
// evenly like the top row.

import React from "react";
import { ArrowLeftRight, Clock, Hourglass, Link2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import ActivityAnchorPicker from "@/components/activities/ActivityAnchorPicker";

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
// Kept from the planner sheet so the choice people already made carries
// over ("duration" | "range"). In BACKUP_LS_KEYS.
const LEN_MODE_KEY = "symphony_planner_time_mode";
// "start" | "end" — which time the clock field holds. In BACKUP_LS_KEYS.
const ANCHOR_KEY = "symphony_activity_time_anchor";

export const LENGTH_CHIPS = [15, 30, 45, 60, 90, 120];
// "Started … ago" for a running activity.
const AGO_CHIPS = [5, 15, 30, 60, 120];

const pad = (n) => String(n).padStart(2, "0");
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtLength = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
const chipLabel = (m) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}½h` : `${m / 60}h`);

const chip = "text-[0.6875em] px-2 py-0.5 rounded-full border whitespace-nowrap";
const quiet = "border-border/50 text-muted-foreground hover:text-foreground";
const lit = "text-[var(--v2-accent)] border-[var(--v2-accent)]";
const field = "w-full h-9 px-2 rounded-lg border border-input bg-background text-sm";

export default function ActivityWhenField({
  start,
  minutes,
  onChange,
  // "done" | "now" | "plan" | "edit" — what the entry is, which decides
  // which shortcuts make sense.
  mode = "done",
  allowNoLength = true,
  prevEnd = null,          // { end: Date, name } — "After the last one"
  lastAdded = null,        // { end: Date, name, id } — "After the one just added"
  excludeId = null,        // the entry being edited (kept out of "Line up with…")
  entryName = "",          // drawn on the "Line up with…" canvas
  weekStartsOn = 1,
  dayInputRef = null,      // lets "Reschedule" jump straight to the day
  hideDay = false,         // the caller draws its own day picker
  compact = false,         // the check-in's slim row: length only
}) {
  const tr = useT();
  const [lenMode, setLenModeState] = React.useState(() => (lsGet(LEN_MODE_KEY, "duration") === "range" ? "range" : "duration"));
  const setLenMode = (m) => { setLenModeState(m); lsSet(LEN_MODE_KEY, m); };
  const [anchorPref, setAnchorState] = React.useState(() => (lsGet(ANCHOR_KEY, "start") === "end" ? "end" : "start"));
  const setAnchor = (a) => { setAnchorState(a); lsSet(ANCHOR_KEY, a); };
  // A running timer only has a start, and the compact row has no clock
  // field to swap, so both count from the start.
  const anchor = mode === "now" || compact ? "start" : anchorPref;
  const byEnd = anchor === "end";
  const s = start instanceof Date && !Number.isNaN(start.getTime()) ? start : new Date();
  const hasLength = Number(minutes) > 0;
  const mins = hasLength ? Math.round(Number(minutes)) : 0;
  const end = new Date(s.getTime() + mins * 60000);
  const emit = (nextStart, nextMin) => onChange?.({ start: nextStart, minutes: nextMin });
  const keepLen = hasLength ? mins : minutes ?? null;
  // Put the anchored time (start, or end when byEnd) at `d`.
  const placeAnchor = (d) => emit(byEnd ? new Date(d.getTime() - mins * 60000) : d, keepLen);
  const anchorAt = byEnd ? end : s;

  const setDay = (v) => {
    const [y, mo, da] = String(v).split("-").map(Number);
    if (!y || !mo || !da) return;
    placeAnchor(new Date(y, mo - 1, da, anchorAt.getHours(), anchorAt.getMinutes(), 0, 0));
  };
  const setClock = (v) => {
    const [h, m] = String(v).split(":").map(Number);
    const d = new Date(anchorAt); d.setHours(h || 0, m || 0, 0, 0);
    placeAnchor(d);
  };
  // A new length keeps the anchored time still: from the start it moves
  // the end, from the end it moves the start.
  const setLen = (n) => {
    const len = n > 0 ? Math.round(n) : null;
    emit(byEnd ? new Date(end.getTime() - (len || 0) * 60000) : s, len);
  };
  // An end TIME before the start rolls to the next day (what people mean at
  // midnight). Picking an end DATE never rolls: the end lands just after
  // the start, ready for the time to be typed (owner report on the old
  // planner sheet, where the date bounced back).
  const commitEnd = (dStr, tStr, { dateEdit = false } = {}) => {
    const [y, mo, da] = String(dStr).split("-").map(Number);
    const [h, mi] = String(tStr).split(":").map(Number);
    if (!y || !mo || !da) return;
    let e = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
    if (e <= s) e = dateEdit ? new Date(s.getTime() + 5 * 60000) : new Date(e.getTime() + 86400000);
    emit(s, Math.max(1, Math.round((e - s) / 60000)));
  };
  // The mirror when the end is the anchor ("From"): a start time after the
  // end rolls back a day; a start date never rolls.
  const commitStart = (dStr, tStr, { dateEdit = false } = {}) => {
    const [y, mo, da] = String(dStr).split("-").map(Number);
    const [h, mi] = String(tStr).split(":").map(Number);
    if (!y || !mo || !da) return;
    let b = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
    if (b >= end) b = dateEdit ? new Date(end.getTime() - 5 * 60000) : new Date(b.getTime() - 86400000);
    emit(b, Math.max(1, Math.round((end - b) / 60000)));
  };
  const endedNow = () => {
    const n = new Date(); n.setSeconds(0, 0);
    const len = hasLength ? mins : 30;
    emit(new Date(n.getTime() - len * 60000), len);
  };
  // "Now" puts whichever time is anchored at now — from the end that's
  // the same as "Ended now".
  const startNow = () => { const n = new Date(); n.setSeconds(0, 0); placeAnchor(n); };
  const afterLast = () => { if (prevEnd?.end) emit(new Date(prevEnd.end), hasLength ? mins : minutes ?? null); };
  const afterAdded = () => { if (lastAdded?.end) emit(new Date(lastAdded.end), hasLength ? mins : minutes ?? null); };
  const [lineUpOpen, setLineUpOpen] = React.useState(false);
  // A running activity: "started 20 minutes ago" puts the start that far
  // before now.
  const agoMin = Math.max(0, Math.floor((Date.now() - s.getTime()) / 60000));
  const setAgo = (n) => {
    const now = new Date(); now.setSeconds(0, 0);
    emit(new Date(now.getTime() - Math.max(0, Math.round(n)) * 60000), minutes ?? null);
  };

  const crossesDay = hasLength && end.toDateString() !== s.toDateString();
  const dayTag = (d) => d.toLocaleDateString([], { weekday: "short" });
  // "12:45 → 13:30", with the weekday on both when it crosses midnight.
  const span = crossesDay
    ? `${dayTag(s)} ${timeStr(s)} → ${dayTag(end)} ${timeStr(end)}`
    : `${timeStr(s)} → ${timeStr(end)}`;
  const timed = mode !== "now";

  const lengthRow = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {/* A segmented track, not chips: it switches HOW the length is
            given, and must never look like one of the length chips below. */}
        <div role="radiogroup" aria-label={tr("planner.durLabel")} className="inline-flex rounded-lg bg-muted/60 p-0.5 gap-0.5">
          {[["duration", tr("planner.lenFor"), Hourglass], ["range", byEnd ? tr("planner.lenFrom") : tr("planner.lenUntil"), Clock]].map(([id, label, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={lenMode === id} onClick={() => setLenMode(id)}
              className={`text-[0.6875em] px-2 py-1 rounded-md flex items-center gap-1 whitespace-nowrap ${
                lenMode === id ? "bg-background shadow-sm text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3 h-3" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        {allowNoLength && (
          <button type="button" aria-pressed={!hasLength} onClick={() => setLen(hasLength ? 0 : 30)}
            className={`${chip} ml-auto ${!hasLength ? lit : quiet}`}>{tr("planner.noLength")}</button>
        )}
      </div>
      {lenMode === "duration" ? (
        <>
          <div className="flex flex-wrap gap-1">
            {LENGTH_CHIPS.map((m) => (
              <button key={m} type="button" aria-pressed={mins === m} onClick={() => setLen(m)}
                className={`text-xs px-2.5 py-1 rounded-full border ${mins === m ? lit : quiet}`}>{chipLabel(m)}</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="w-20 text-xs text-muted-foreground">
              {tr("planner.hours")}
              <input type="number" min={0} inputMode="numeric" value={hasLength ? Math.floor(mins / 60) : ""}
                placeholder="0"
                onChange={(e) => { const h = Math.max(0, parseInt(e.target.value, 10) || 0); setLen(h * 60 + (mins % 60)); }}
                className={`mt-1 ${field}`} />
            </label>
            <label className="w-20 text-xs text-muted-foreground">
              {tr("planner.minutes")}
              <input type="number" min={0} step={5} inputMode="numeric" value={hasLength ? mins % 60 : ""}
                placeholder="0"
                onChange={(e) => { const m = Math.max(0, parseInt(e.target.value, 10) || 0); setLen(Math.floor(mins / 60) * 60 + m); }}
                className={`mt-1 ${field}`} />
            </label>
            {hasLength && (
              <span className="text-[0.6875em] text-muted-foreground tabular-nums pb-2 whitespace-nowrap">
                {span}
              </span>
            )}
          </div>
        </>
      ) : byEnd ? (
        <div className="space-y-1">
          {/* Two even halves, the same shape as the date/time row above. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs text-muted-foreground">
              {tr("planner.startedAt")}
              <input type="date" value={dateStr(s)} aria-label={tr("planner.date")}
                onChange={(e) => commitStart(e.target.value, timeStr(s), { dateEdit: true })}
                className={`mt-1 ${field}`} />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              <span className="invisible" aria-hidden="true">·</span>
              <input type="time" value={hasLength ? timeStr(s) : ""} aria-label={tr("planner.startsAt")}
                onChange={(e) => commitStart(dateStr(hasLength ? s : end), e.target.value)}
                className={`mt-1 ${field}`} />
            </label>
          </div>
          {hasLength && (
            <p className="text-[0.6875em] text-muted-foreground tabular-nums">{span} · {fmtLength(mins)}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs text-muted-foreground">
              {tr("planner.endsAt")}
              <input type="date" value={dateStr(hasLength ? end : s)} aria-label={tr("planner.endDate")}
                onChange={(e) => commitEnd(e.target.value, timeStr(hasLength ? end : s), { dateEdit: true })}
                className={`mt-1 ${field}`} />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              <span className="invisible" aria-hidden="true">·</span>
              <input type="time" value={hasLength ? timeStr(end) : ""} aria-label={tr("planner.endTime")}
                onChange={(e) => commitEnd(dateStr(hasLength ? end : s), e.target.value)}
                className={`mt-1 ${field}`} />
            </label>
          </div>
          {hasLength && (
            <p className="text-[0.6875em] text-muted-foreground tabular-nums">
              {span} · {fmtLength(mins)}{crossesDay ? ` · ${tr("planner.nextDay")}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (compact) return lengthRow;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        {!hideDay && (
          <label className="flex-1 text-xs text-muted-foreground">
            {tr("planner.date")}
            <input type="date" ref={dayInputRef} value={dateStr(anchorAt)} onChange={(e) => setDay(e.target.value)}
              className={`mt-1 ${field}`} />
          </label>
        )}
        <div className="flex-1 text-xs text-muted-foreground">
          {mode === "now" ? (
            <span>{tr("planner.startsAt")}</span>
          ) : (
            <button type="button" onClick={() => setAnchor(byEnd ? "start" : "end")} aria-pressed={byEnd}
              title={byEnd ? tr("planner.anchorSwapBack") : tr("planner.anchorSwap")}
              className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground">
              {byEnd ? tr("planner.endsAt") : tr("planner.startsAt")}
              <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          <input type="time" value={timeStr(anchorAt)} onChange={(e) => setClock(e.target.value)}
            aria-label={byEnd ? tr("planner.endTime") : tr("planner.startsAt")}
            className={`mt-1 ${field}`} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {mode !== "plan" && (
          <button type="button" onClick={startNow} className={`${chip} ${quiet}`}>{tr("planner.startedNow")}</button>
        )}
        {mode === "done" && !byEnd && (
          <button type="button" onClick={endedNow} className={`${chip} ${quiet}`}>{tr("planner.endedNow")}</button>
        )}
        {prevEnd?.end && mode !== "plan" && (
          <button type="button" onClick={afterLast}
            title={`${new Date(prevEnd.end).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} — ${prevEnd.name || ""}`}
            className={`${chip} ${quiet} truncate max-w-[60%]`}>{tr("planner.afterLast")}</button>
        )}
        {lastAdded?.end && (mode === "plan" || lastAdded.id !== prevEnd?.id) && (
          <button type="button" onClick={afterAdded}
            title={`${new Date(lastAdded.end).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} — ${lastAdded.name || ""}`}
            className={`${chip} ${quiet} truncate max-w-[60%]`}>{tr("when.afterAdded")}</button>
        )}
        {mode !== "now" && (
          <button type="button" onClick={() => setLineUpOpen(true)}
            className={`${chip} ${quiet} flex items-center gap-1`}>
            <Link2 className="w-3 h-3" aria-hidden="true" />{tr("when.lineUp")}
          </button>
        )}
      </div>
      {timed ? lengthRow : (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{tr("when.startedAgo")}</p>
          <div className="flex flex-wrap gap-1">
            {AGO_CHIPS.map((m) => (
              <button key={m} type="button" aria-pressed={agoMin === m} onClick={() => setAgo(m)}
                className={`text-xs px-2.5 py-1 rounded-full border ${agoMin === m ? lit : quiet}`}>{chipLabel(m)}</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="w-20 text-xs text-muted-foreground">
              {tr("planner.hours")}
              <input type="number" min={0} inputMode="numeric" value={agoMin ? Math.floor(agoMin / 60) : ""} placeholder="0"
                onChange={(e) => { const h = Math.max(0, parseInt(e.target.value, 10) || 0); setAgo(h * 60 + (agoMin % 60)); }}
                className={`mt-1 ${field}`} />
            </label>
            <label className="w-20 text-xs text-muted-foreground">
              {tr("planner.minutes")}
              <input type="number" min={0} step={5} inputMode="numeric" value={agoMin ? agoMin % 60 : ""} placeholder="0"
                onChange={(e) => { const m = Math.max(0, parseInt(e.target.value, 10) || 0); setAgo(Math.floor(agoMin / 60) * 60 + m); }}
                className={`mt-1 ${field}`} />
            </label>
            <span className="text-[0.6875em] text-muted-foreground tabular-nums pb-2 whitespace-nowrap">
              {agoMin ? tr("when.agoSince", { time: timeStr(s) }) : tr("when.agoNow")}
            </span>
          </div>
          <p className="text-[0.6875em] text-muted-foreground">{tr("planner.timerHint")}</p>
        </div>
      )}
      {lineUpOpen && (
        <ActivityAnchorPicker
          start={s}
          minutes={minutes}
          excludeId={excludeId}
          name={entryName}
          weekStartsOn={weekStartsOn}
          onApply={({ start: ns, minutes: nm }) => emit(ns, nm)}
          onClose={() => setLineUpOpen(false)}
        />
      )}
    </div>
  );
}
