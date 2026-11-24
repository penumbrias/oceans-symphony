// The kit's empty, loading and error blocks (new house step 1.3, plan §4
// checks 2–4).
//
//   <EmptyBlock icon={CalendarDays} title="No plans this week"
//     body="Plans you make show here, with what's next at the top."
//     action={{ label: "Plan something", icon: Plus, onClick: openEditor }} />
//   <LoadingBlock label="Loading plans" kind="rows" rows={5} />
//   <ErrorBlock what="Couldn't load your plans" detail={e.message} onRetry={refetch} />
//
// Empty: what goes here, in the person's words, and ONE real next step.
// Loading is not empty: placeholders the size of what's coming (rows of a
// row's height, a card, a chart, a stat), never "Nothing here" while a read
// is still running. Error: what failed, whether the data is safe (it is,
// unless the host says otherwise), and Try again.

import React from "react";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button } from "@/house/kit/Button";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

export function EmptyBlock({ icon, title, body, action, compact = false }) {
  return (
    <div className="hk-empty" data-compact={compact || undefined}>
      {icon ? <span className="hk-empty-icon"><HouseIcon icon={icon} size="bar" /></span> : null}
      <p className="hk-empty-title house-label">{title}</p>
      {body ? <p className="hk-empty-body">{body}</p> : null}
      {action ? (
        <Button rank={action.rank || "primary"} icon={action.icon} onClick={action.onClick}
          disabledReason={action.disabledReason}>{action.label}</Button>
      ) : null}
    </div>
  );
}

// `kind`: "rows" (each a row tall), "card", "chart", "stat" or "text".
export function LoadingBlock({ label = "Loading", kind = "rows", rows = 3, height }) {
  const n = Math.max(1, Math.min(rows, 12));
  return (
    <div className="hk-loading" role="status" aria-busy="true" aria-live="polite" data-kind={kind}
      style={height ? { minHeight: height } : undefined}>
      <span className="hk-sr">{label}…</span>
      {kind === "rows"
        ? Array.from({ length: n }, (_, i) => (
            <span key={i} className="hk-ph-row" aria-hidden="true">
              <span className="hk-ph hk-ph-dot" />
              <span className="hk-ph-lines">
                <span className="hk-ph hk-ph-line" style={{ width: `${70 - ((i * 13) % 30)}%` }} />
                <span className="hk-ph hk-ph-line hk-ph-line--thin" style={{ width: `${45 - ((i * 7) % 20)}%` }} />
              </span>
            </span>
          ))
        : kind === "stat"
          ? <span className="hk-ph-stat" aria-hidden="true"><span className="hk-ph hk-ph-line--thin" /><span className="hk-ph hk-ph-big" /></span>
          : kind === "text"
            ? Array.from({ length: n }, (_, i) => <span key={i} className="hk-ph hk-ph-line" aria-hidden="true" style={{ width: i === n - 1 ? "60%" : "100%" }} />)
            : <span className={`hk-ph hk-ph-${kind}`} aria-hidden="true" />}
    </div>
  );
}

export function ErrorBlock({ what = "Couldn't load this", detail, safe = true, safeWords, onRetry, retrying = false, retryLabel = "Try again" }) {
  return (
    <div className="hk-error-block" role="alert">
      <p className="hk-error-what">
        <HouseIcon icon={AlertTriangle} />
        <span>{what}{detail ? `: ${detail}` : "."}</span>
      </p>
      <p className="hk-error-safe">
        {safe ? <HouseIcon icon={ShieldCheck} /> : null}
        <span>{safeWords || (safe ? "Your data is safe. Nothing was changed or lost." : "Some of it may not have saved. What you typed is kept here.")}</span>
      </p>
      {onRetry ? <Button rank="secondary" icon={RotateCcw} onClick={onRetry} busy={retrying} busyLabel="Trying again…">{retryLabel}</Button> : null}
    </div>
  );
}

export { EmptyBlock as Empty, LoadingBlock as Loading };
