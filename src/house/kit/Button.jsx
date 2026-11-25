// The kit's buttons (new house step 1.2, building code §1 and §3).
//
//   <Button rank="primary" onClick={save}>Save</Button>
//   <Button rank="secondary">Cancel</Button>
//   <Button rank="quiet">Show more</Button>
//   <Button rank="danger">Delete Walk</Button>          (in a confirm sheet, never a header)
//   <Button busy busyLabel="Saving…">Save</Button>
//   <Button disabledReason="Pick a time first">Save</Button>
//   <IconButton icon={MoreHorizontal} label="More for Planner" />
//
// Rules this keeps:
// - Three ranks plus danger. One primary per surface is the page's job.
// - Disabled always says why: `disabledReason` is shown under the button
//   and read with it, and the button stays focusable (aria-disabled), so a
//   keyboard or screen reader user can find out why it won't go.
// - Busy keeps the button's place and size, shows a spinner and the busy
//   words, and ignores presses, so one action makes at most one save.
// - An icon-only button needs a name (`label`) that names the thing
//   ("More for Planner", not "More"); it shows as a tooltip too.

import React, { forwardRef, useId } from "react";
import { Info, Loader2 } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import "@/house/kit/kit.css";

const RANKS = new Set(["primary", "secondary", "quiet", "danger"]);
const RETIRED = /^(update|apply|ok|submit|confirm|save changes)$/i;

export const Button = forwardRef(function Button(
  { rank = "secondary", icon, iconPage, iconKey, busy = false, busyLabel, disabledReason, disabled = false, block = false, type = "button", className = "", onClick, children, ...rest },
  ref
) {
  const reasonId = useId();
  const off = !!(disabled || disabledReason);
  const r = RANKS.has(rank) ? rank : "secondary";
  if (import.meta.env?.DEV && typeof children === "string" && RETIRED.test(children.trim())) {
    console.warn(`[house kit] "${children}" is a retired verb; the verb is Save (building code §1).`);
  }
  if (import.meta.env?.DEV && disabled && !disabledReason) {
    console.warn("[house kit] a disabled Button needs a disabledReason (plan §4, check 6).");
  }
  const btn = (
    <button
      ref={ref}
      type={type}
      className={`hk-btn hk-btn--${r}${block ? " hk-btn--block" : ""} ${className}`}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      onClick={(e) => {
        if (off || busy) { e.preventDefault(); return; }
        onClick?.(e);
      }}
      {...rest}
    >
      {busy
        ? <Loader2 aria-hidden="true" className="hk-spin" style={{ width: "var(--house-icon-control)", height: "var(--house-icon-control)" }} />
        : icon ? <HouseIcon icon={icon} page={iconPage} iconKey={iconKey} /> : null}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </button>
  );
  if (!disabledReason) return btn;
  return (
    <span className={`hk-btn-wrap${block ? " hk-btn-wrap--block" : ""}`}>
      {btn}
      <span id={reasonId} className="hk-reason">
        <HouseIcon icon={Info} size="inline" />
        <span>{disabledReason}</span>
      </span>
    </span>
  );
});

export const IconButton = forwardRef(function IconButton(
  { icon, iconPage, iconKey, label, rank = "quiet", disabledReason, disabled = false, busy = false, type = "button", className = "", onClick, ...rest },
  ref
) {
  const reasonId = useId();
  const off = !!(disabled || disabledReason);
  if (import.meta.env?.DEV && !label) console.warn("[house kit] an IconButton needs a label that names the thing.");
  return (
    <button
      ref={ref}
      type={type}
      className={`hk-btn hk-btn--${RANKS.has(rank) ? rank : "quiet"} hk-iconbtn ${className}`}
      aria-label={label}
      title={disabledReason ? `${label}: ${disabledReason}` : label}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      onClick={(e) => {
        if (off || busy) { e.preventDefault(); return; }
        onClick?.(e);
      }}
      {...rest}
    >
      {busy
        ? <Loader2 aria-hidden="true" className="hk-spin" style={{ width: "var(--house-icon-control)", height: "var(--house-icon-control)" }} />
        : <HouseIcon icon={icon} page={iconPage} iconKey={iconKey} />}
      {disabledReason ? <span id={reasonId} className="hk-sr">{disabledReason}</span> : null}
    </button>
  );
});

// A link drawn as a button: a phone number to call (tel:), a text (sms:) or
// a page outside the app. Same ranks and look as Button; it is an <a>, so
// the browser's own link behaviour (and the dialler) stays.
//   <LinkButton rank="primary" href="tel:+441234">Call Dana</LinkButton>
export const LinkButton = forwardRef(function LinkButton(
  { rank = "secondary", icon, href, block = false, className = "", children, ...rest },
  ref
) {
  const r = RANKS.has(rank) ? rank : "secondary";
  return (
    <a ref={ref} href={href} className={`hk-btn hk-btn--${r} hk-linkbtn${block ? " hk-btn--block" : ""} ${className}`} {...rest}>
      {icon ? <HouseIcon icon={icon} /> : null}
      <span>{children}</span>
    </a>
  );
});

export default Button;
