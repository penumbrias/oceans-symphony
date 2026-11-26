// Small shared pieces for the pixel-look "desk" pages (Groups, Contacts,
// Assets): a bevelled panel with a title bar, and a hook that sizes a desk
// to the space left under the frame so its columns scroll on their own.
// Only rendered in the pixel look; every class is styled in
// src/styles/pixel/groups.css under html[data-ui-look="pixel"].
import React, { useLayoutEffect, useRef, useState } from "react";

// Height from the desk's top edge to the bottom of the window, less the
// frame's status bar. Re-measured on resize and when the page above moves.
export function useDeskHeight() {
  const ref = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const status = document.documentElement.getAttribute("data-px-status") === "1" ? 30 : 4;
      setHeight(Math.max(480, Math.round(window.innerHeight - top - status - 6)));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    const t = setTimeout(measure, 400);
    return () => { window.removeEventListener("resize", measure); ro?.disconnect(); clearTimeout(t); };
  }, []);
  return [ref, height];
}

// A panel: optional title bar (title on the left, `actions` on the right),
// then its body.
export function PxPanel({ title, actions, className = "", bodyClassName = "", children, as: Tag = "section", ...rest }) {
  return (
    <Tag className={`pg-panel ${className}`} {...rest}>
      {(title != null || actions) && (
        <div className="pg-ttl">
          <span className="pg-ttl-text">{title}</span>
          {actions && <span className="pg-ttl-acts">{actions}</span>}
        </div>
      )}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </Tag>
  );
}

// The square tabs the boards use under a header.
export function PxTabs({ tabs, value, onChange, label }) {
  return (
    <div className="pg-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id}
          className={`pg-tab${value === t.id ? " sel" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
