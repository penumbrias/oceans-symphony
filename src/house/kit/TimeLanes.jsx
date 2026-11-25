// The kit's time lanes (board 01-Main's "Timeline" dock, board 08-Phone's
// "Next 6 hours"): a ruler, one lane per layer row, grouped, with a now
// line. The host hands in rows whose items already carry their place in
// the window ({ left, width } in %, from homeModel.spanIn); the lanes only
// draw them and report what was picked.
//
//   <TimeLanes label="Today, layer by layer" ticks={ticks} now={nowLeft}
//     groups={[{ id, label, color, rows: [{ id, layer, label, color, items }] }]}
//     allDay={[{ key, label }]} selected={key} onSelect={(item) => …}
//     folded={["checkins"]} onFold={(groupId) => …}
//     onHideLayer={(layerId, label) => …} compact />
//
// Each item is a button named by its row and label ("Planned: Walk"); a
// plan's state shows by its edge AND its words (struck for skipped, dashed
// for still to do), never colour alone. Folding a group keeps its header.
// `compact` (the phone's Next 6 hours) drops the fold and eye buttons.

import React from "react";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import "@/house/kit/kit.css";
import "@/house/kit/timeLanes.css";

const TONE_WORDS = { open: "not ticked off yet", plan: "still to do", done: "done", skipped: "skipped", logged: "logged" };

function LaneItem({ item, row, selected, onSelect }) {
  const pos = item.pos;
  if (!pos) return null;
  const name = `${row.label}: ${item.label}${item.tone ? `, ${TONE_WORDS[item.tone] || item.tone}` : ""}`;
  const style = { left: `${pos.left}%`, width: item.kind === "bar" ? `${pos.width}%` : undefined };
  const colour = item.color || row.color || null;
  if (colour) style["--hk-lane-c"] = colour;
  return (
    <button type="button" className="hk-lane-item" data-kind={item.kind} data-tone={item.tone || undefined}
      aria-pressed={selected} aria-label={name} title={name} style={style} onClick={() => onSelect?.(item, row)}>
      <span className="hk-lane-item-text">{item.label}</span>
    </button>
  );
}

export default function TimeLanes({ label, ticks = [], now = null, nowLabel, groups = [], allDay = [], selected, onSelect, folded = [], onFold, onHideLayer, compact = false, empty }) {
  const off = new Set(folded);
  return (
    <div className="hk-lanes" data-compact={compact || undefined} role="group" aria-label={label}>
      <div className="hk-lanes-ruler" aria-hidden="true">
        <span className="hk-lanes-gutter" />
        <span className="hk-lanes-track">
          {ticks.map((t) => <span key={t.left} className="hk-lanes-tick" style={{ left: `${t.left}%` }}>{t.label}</span>)}
          {now != null && nowLabel ? <span className="hk-lanes-nowtag" style={{ left: `${now}%` }}>{nowLabel}</span> : null}
        </span>
      </div>
      <div className="hk-lanes-body">
        {now != null ? <span className="hk-lanes-now" style={{ "--hk-now": String(now / 100) }} aria-hidden="true" /> : null}
        {groups.map((g) => {
          const isFolded = off.has(g.id);
          return (
            <div key={g.id} className="hk-lanes-group" role="group" aria-label={g.label}>
              {compact ? null : (
                <div className="hk-lanes-row hk-lanes-ghead">
                  <span className="hk-lanes-gutter">
                    <button type="button" className="hk-lanes-fold" aria-expanded={!isFolded}
                      aria-label={`${isFolded ? "Open" : "Fold"} ${g.label}`} onClick={() => onFold?.(g.id)}>
                      <HouseIcon icon={isFolded ? ChevronRight : ChevronDown} size="inline" />
                    </button>
                    <span className="hk-lanes-swatch" style={{ "--hk-lane-c": g.color }} aria-hidden="true" />
                    <span className="hk-lanes-name house-label">{g.label}</span>
                  </span>
                  <span className="hk-lanes-track" />
                </div>
              )}
              {g.id === "plans" && allDay.length && !isFolded ? (
                <div className="hk-lanes-row hk-lanes-allday">
                  <span className="hk-lanes-gutter" />
                  <span className="hk-lanes-track">
                    {allDay.map((a) => (
                      <button key={a.key} type="button" className="hk-lanes-alldayitem" aria-pressed={selected === a.key}
                        onClick={() => onSelect?.(a, { label: "All day" })}>
                        {`${a.label} (all day)`}
                      </button>
                    ))}
                  </span>
                </div>
              ) : null}
              {isFolded ? null : g.rows.map((r) => (
                <div key={r.id} className="hk-lanes-row">
                  <span className="hk-lanes-gutter">
                    {compact || !onHideLayer ? null : (
                      <button type="button" className="hk-lanes-eye" aria-label={`Hide ${r.label}`} title={`Hide ${r.label}`}
                        onClick={() => onHideLayer(r.layer, r.label)}>
                        <HouseIcon icon={Eye} size="inline" />
                      </button>
                    )}
                    <span className="hk-lanes-swatch" style={{ "--hk-lane-c": r.color || g.color }} aria-hidden="true" />
                    <span className="hk-lanes-name">{r.label}</span>
                  </span>
                  <span className="hk-lanes-track">
                    {r.items.map((it) => <LaneItem key={it.key} item={it} row={r} selected={selected === it.key} onSelect={onSelect} />)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        {!groups.length && empty ? <p className="hk-lanes-empty">{empty}</p> : null}
      </div>
    </div>
  );
}

export { TimeLanes };
