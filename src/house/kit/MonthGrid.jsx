// The kit's month grids (board 04-Planner): the small month a person jumps
// from, the big month the calendar's Month view draws, and the year's
// twelve small months. The host hands in the cells (whole weeks, from the
// room's model) and what each day holds; the grids draw them and report the
// day, entry or month picked. Every day is a button named by its full date
// and what's on it.
//
//   <MiniMonth label="November 2026" letters={["M",…]} cells={[{ key, date, inMonth }]}
//     todayKey selectedKey weekKeys={Set} onPick={(date) => …} />
//   <MonthBoard letters cells todayKey items={(cell) => [{ key, label, tone, colour }]}
//     onPickDay={(date) => …} onPickItem={(item) => …} />
//   <YearBoard months={[{ key, label, count, cells, busy: Map, eventDays: Set }]} letters todayKey
//     onPickMonth={(month) => …} onPickDay={(date) => …} />

import React from "react";
import { format } from "date-fns";
import "@/house/kit/kit.css";
import "@/house/kit/monthGrid.css";

export function MiniMonth({ label, letters = [], cells = [], todayKey, selectedKey, weekKeys, onPick }) {
  return (
    <div className="hk-cal-mini" role="group" aria-label={label}>
      {letters.map((l, i) => <span key={`h${i}`} className="hk-cal-letter" aria-hidden="true">{l}</span>)}
      {cells.map((c) => (
        c.inMonth ? (
          <button key={c.key} type="button" className="hk-cal-d"
            data-week={weekKeys?.has(c.key) || undefined} data-sel={c.key === selectedKey || undefined}
            data-today={c.key === todayKey || undefined}
            aria-current={c.key === todayKey ? "date" : undefined}
            aria-label={format(c.date, "EEEE MMMM d")} onClick={() => onPick?.(c.date)}>
            {c.date.getDate()}
          </button>
        ) : <span key={c.key} className="hk-cal-d" data-out="" aria-hidden="true" />
      ))}
    </div>
  );
}

export function MonthBoard({ label, letters = [], cells = [], todayKey, items = () => [], max = 3, onPickDay, onPickItem }) {
  return (
    <div className="hk-cal-board" role="group" aria-label={label}>
      {letters.map((l, i) => <span key={`h${i}`} className="hk-cal-letter" aria-hidden="true">{l}</span>)}
      {cells.map((c) => {
        const list = items(c) || [];
        const shown = list.slice(0, max);
        return (
          <div key={c.key} className="hk-cal-cell" data-out={c.inMonth ? undefined : ""} data-today={c.key === todayKey || undefined}>
            <button type="button" className="hk-cal-num" onClick={() => onPickDay?.(c.date)}
              aria-label={`${format(c.date, "EEEE MMMM d")}${list.length ? `, ${list.length} on it` : ""}. Open the day`}>
              {c.date.getDate()}
            </button>
            {shown.map((it) => (
              <button key={it.key} type="button" className="hk-cal-item" data-tone={it.tone || undefined} data-kind={it.kind || undefined}
                style={it.colour ? { "--hk-cal-c": it.colour } : undefined}
                aria-label={`${it.label}${it.words ? `, ${it.words}` : ""}`} title={it.label} onClick={() => onPickItem?.(it, c)}>
                {it.label}
              </button>
            ))}
            {list.length > max ? (
              <button type="button" className="hk-cal-more" onClick={() => onPickDay?.(c.date)}>{`+${list.length - max} more`}</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function YearBoard({ label, months = [], letters = [], todayKey, onPickMonth, onPickDay }) {
  return (
    <div className="hk-cal-year" role="group" aria-label={label}>
      {months.map((m) => (
        <section key={m.key} className="hk-cal-ymonth" aria-label={m.label}>
          <button type="button" className="hk-cal-ytitle" onClick={() => onPickMonth?.(m.month)}
            aria-label={`${m.label}: ${m.count} entr${m.count === 1 ? "y" : "ies"}. Open the month`}>
            <span>{m.label}</span><span className="hk-cal-ycount">{m.count || ""}</span>
          </button>
          <div className="hk-cal-mini hk-cal-mini--year">
            {letters.map((l, i) => <span key={`h${i}`} className="hk-cal-letter" aria-hidden="true">{l}</span>)}
            {m.cells.map((c) => (
              c.inMonth ? (
                <button key={c.key} type="button" className="hk-cal-d" data-busy={Math.min(3, m.busy.get(c.key) || 0) || undefined}
                  data-event={m.eventDays.has(c.key) || undefined} data-today={c.key === todayKey || undefined}
                  aria-label={`${format(c.date, "EEEE MMMM d")}${m.busy.get(c.key) ? `, ${m.busy.get(c.key)} on it` : ""}${m.eventDays.has(c.key) ? ", an event" : ""}`}
                  onClick={() => onPickDay?.(c.date)}>{c.date.getDate()}</button>
              ) : <span key={c.key} className="hk-cal-d" data-out="" aria-hidden="true" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
