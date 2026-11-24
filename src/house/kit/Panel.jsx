// The kit's panel and page tabs (new house step 1.3).
//
//   <Panel title="Layers" tools={<IconButton … />} collapsible>
//     …
//   </Panel>
//
//   <PageTabs label="Sections of River" value={tab} onChange={setTab}
//     tabs={[{ id: "about", label: "About" }, { id: "notes", label: "Notes", dot: true }]} />
//
// Panel: a title bar (h-control) with the title, an optional tools slot and
// a collapse button that says what it folds ("Fold Layers"). The body is a
// region named by the title. `dock` ("left" | "right" | "bottom") marks
// where a docked panel sits, ready for edit mode (step 4.1), which moves
// panels by this header; nothing is draggable yet.
//
// PageTabs: the "sections of this page" look (building code §2): plain
// labels on a flat strip, the current one bold with a 3 px accent
// underline, one row that scrolls sideways with a cut edge, the current tab
// kept in view. Arrow keys, Home and End move and choose (a tablist).

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { IconButton } from "@/house/kit/Button";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

export function Panel({ title, tools, collapsible = false, defaultOpen = true, open: openProp, onOpenChange, dock, as: Tag = "section", className = "", bodyClassName = "", children, headingLevel = 2 }) {
  const id = useId();
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (v) => { if (openProp === undefined) setOpenState(v); onOpenChange?.(v); };
  const H = `h${Math.min(6, Math.max(2, headingLevel))}`;
  const name = typeof title === "string" ? title : "this panel";
  return (
    <Tag className={`hk-panel ${className}`} aria-labelledby={`${id}-t`} data-dock={dock || undefined} data-open={open}>
      <div className="hk-panel-head">
        <H id={`${id}-t`} className="hk-panel-title house-label">{title}</H>
        {tools ? <div className="hk-panel-tools">{tools}</div> : null}
        {collapsible ? (
          <IconButton icon={open ? ChevronDown : ChevronRight} label={`${open ? "Fold" : "Open"} ${name}`}
            aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(!open)} />
        ) : null}
      </div>
      <div id={`${id}-b`} className={`hk-panel-body ${bodyClassName}`} hidden={!open}>
        {open ? children : null}
      </div>
    </Tag>
  );
}

export function PageTabs({ label, tabs = [], value, onChange, idPrefix }) {
  const auto = useId();
  const pre = idPrefix || auto;
  const stripRef = useRef(null);
  const [cut, setCut] = useState({ left: false, right: false });
  const measure = () => {
    const el = stripRef.current;
    if (!el) return;
    setCut({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useLayoutEffect(() => {
    const el = stripRef.current;
    const cur = el?.querySelector('[aria-selected="true"]');
    // Keep the current tab in view (scroll the strip only, never the page).
    if (el && cur) {
      const l = cur.offsetLeft, r = l + cur.offsetWidth;
      if (l < el.scrollLeft) el.scrollLeft = l - 16;
      else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 16;
    }
    measure();
  }, [value, tabs.length]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const move = (dir, e) => {
    const i = tabs.findIndex((t) => t.id === value);
    const n = tabs.length;
    const j = dir === "first" ? 0 : dir === "last" ? n - 1 : (i + dir + n) % n;
    e.preventDefault();
    onChange?.(tabs[j].id);
    requestAnimationFrame(() => document.getElementById(`${pre}-tab-${tabs[j].id}`)?.focus());
  };
  return (
    <div className="hk-tabs-wrap" data-cut-left={cut.left || undefined} data-cut-right={cut.right || undefined}>
      <div ref={stripRef} className="hk-tabs" role="tablist" aria-label={label} onScroll={measure}>
        {tabs.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              id={`${pre}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${pre}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              className="hk-tab"
              onClick={() => onChange?.(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") move(1, e);
                else if (e.key === "ArrowLeft") move(-1, e);
                else if (e.key === "Home") move("first", e);
                else if (e.key === "End") move("last", e);
              }}
            >
              {t.icon ? <HouseIcon icon={t.icon} /> : null}
              <span>{t.label}</span>
              {t.dot ? <span className="hk-tab-dot" aria-label="has its own settings" role="img" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The body of one tab, tied to its tab for screen readers.
export function TabPanel({ idPrefix, id, children, className = "" }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className={className} tabIndex={0}>
      {children}
    </div>
  );
}

export default Panel;
