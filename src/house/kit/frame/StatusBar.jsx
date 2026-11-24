// The status bar's pieces (building code §7 "Heights"): the one place the
// frame talks about itself on desktop. At rest it is max(32px, 2rem) high
// with a mouse in the full studio; every piece is still a 44 px wide hit
// area; it grows to the control height on a touch screen, in the compact
// studio, and whenever it holds a control that must be pressed (a failed
// save's Try again). Saving and safety words are text-sm, times text-xs.
//
//   <StatusBar label="Status" tall={failed}>
//     <StatusButton icon={Pencil} label="Edit page" onClick={…} />
//     <StatusItem>Saved</StatusItem>
//     <StatusLink to="/settings">Synced 9:30</StatusLink>
//   </StatusBar>

import React from "react";
import { Link } from "react-router-dom";
import HouseIcon from "@/house/tokens/HouseIcon";
import "@/house/kit/frame/frameKit.css";

export function StatusBar({ label = "Status", tall = false, children }) {
  return (
    <footer className="hk-status" aria-label={label} data-tall={tall || undefined} data-house-frame="">
      {children}
    </footer>
  );
}

export function StatusItem({ tone, strong = false, children, title }) {
  return <span className="hk-status-item" data-tone={tone || undefined} data-strong={strong || undefined} title={title}>{children}</span>;
}

export function StatusLink({ to, tone, strong = false, children, title }) {
  return <Link to={to} className="hk-status-item hk-status-press" data-tone={tone || undefined} data-strong={strong || undefined} title={title}>{children}</Link>;
}

// A pressable piece. With `icon` and no children it is icon-only and
// `label` names it (aria-label + tooltip).
export function StatusButton({ icon, label, onClick, tone, strong = false, disabledReason, pressed, children }) {
  const off = !!disabledReason;
  return (
    <button
      type="button"
      className="hk-status-item hk-status-press"
      data-tone={tone || undefined}
      data-strong={strong || undefined}
      aria-label={children ? undefined : label}
      aria-disabled={off || undefined}
      aria-pressed={pressed}
      title={off ? `${label}: ${disabledReason}` : label}
      onClick={(e) => { if (off) { e.preventDefault(); return; } onClick?.(e); }}
    >
      {icon ? <HouseIcon icon={icon} /> : null}
      {children ? <span>{children}</span> : null}
      {off ? <span className="hk-sr">{disabledReason}</span> : null}
    </button>
  );
}

export const StatusSpacer = () => <span className="hk-status-spacer" aria-hidden="true" />;
