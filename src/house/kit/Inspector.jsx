// The kit's inspector (new house step 1.3), built to
// docs/inspector-design-guide.md in the house's look:
//
//   <Inspector title="Plans widget" onClose={close}
//     undo={{ onClick: undo, disabledReason: canUndo ? null : "Nothing to undo" }}
//     redo={…}
//     menu={[{ id: "dup", label: "Duplicate", onSelect }, { id: "rm", label: "Remove Plans widget", danger: true, onSelect }]}
//     tab={tab} onTabChange={setTab}
//     tabs={[
//       { id: "content", label: "Content", icon: List, dot: true, onReset: resetContent, body: <>…rows…</> },
//       { id: "text", label: "Text", icon: Type, onReset: resetText, body: … },
//     ]} />
//
// - Header: title · Undo · Redo · [primary] · ⋯ (every destructive or rare
//   action, Delete/Remove last in danger) · Close.
// - A fixed tab strip (PageTabs) with the standard names in order
//   (Content · Text · Shape · Bars · Colour · Styles); a dot says the item
//   has its own setting there. One tab at a time; a tab change scrolls the
//   body to the top. With Accessibility → "Option menus as one list" on,
//   every tab shows at once under its own heading (useInspectorStacked).
// - Rows are the kit's (Switch, Segmented, SliderRow with the number
//   beside it, inherited values dashed with ×; InspectorGroup headings).
// - Every tab ends in "Reset {tab}". Nothing destructive at a tab's foot.
//
// The inspector only lays out; every value change is the host's, through
// its own one writer (records save, settings apply live).

import React, { useEffect, useId, useRef } from "react";
import { Redo2, RotateCcw, Undo2, X } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { useInspectorStacked } from "@/lib/motionPrefs";
import { Button, IconButton } from "@/house/kit/Button";
import Menu from "@/house/kit/Menu";
import { PageTabs, TabPanel } from "@/house/kit/Panel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

export const STANDARD_TABS = ["content", "text", "shape", "bars", "colour", "styles"];

// Order tabs the standard way (unknown ids keep their place after them).
export function orderTabs(tabs = []) {
  const rank = (t) => { const i = STANDARD_TABS.indexOf(t.id); return i < 0 ? STANDARD_TABS.length : i; };
  return tabs.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

export function InspectorGroup({ title, children }) {
  return (
    <div className="hk-insp-group" role="group" aria-label={title}>
      {title ? <h4 className="hk-insp-group-title house-label">{title}</h4> : null}
      {children}
    </div>
  );
}

function ResetFoot({ tab }) {
  if (!tab.onReset) return null;
  return (
    <div className="hk-insp-reset">
      <Button rank="quiet" icon={RotateCcw} onClick={tab.onReset}
        disabledReason={tab.resetDisabledReason || undefined}>{`Reset ${String(tab.label).toLowerCase()}`}</Button>
    </div>
  );
}

export default function Inspector({ title, tabs: rawTabs = [], tab, onTabChange, undo, redo, primary, menu, onClose, stacked: stackedProp, className = "" }) {
  const tabs = orderTabs(rawTabs);
  const stackedPref = useInspectorStacked();
  const stacked = stackedProp ?? stackedPref;
  const current = tabs.find((t) => t.id === tab) || tabs[0];
  const bodyRef = useRef(null);
  const pre = useId();
  const titleId = `${pre}-title`;
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [current?.id]);
  return (
    <section className={`hk-insp ${className}`} aria-labelledby={titleId}>
      <header className="hk-insp-head">
        <h2 id={titleId} className="hk-insp-title house-label">{title}</h2>
        <div className="hk-insp-actions">
          {undo ? <IconButton icon={Undo2} label={`Undo in ${title}`} onClick={undo.onClick} disabledReason={undo.disabledReason || undefined} /> : null}
          {redo ? <IconButton icon={Redo2} label={`Redo in ${title}`} onClick={redo.onClick} disabledReason={redo.disabledReason || undefined} /> : null}
          {primary ? <Button rank="primary" icon={primary.icon} onClick={primary.onClick}>{primary.label}</Button> : null}
          {menu?.length ? <Menu label={`More for ${title}`} items={menu} /> : null}
          {onClose ? <IconButton icon={X} label={`Close ${title}`} onClick={onClose} /> : null}
        </div>
      </header>
      {!stacked && tabs.length > 1 ? (
        <PageTabs label={`${title}: sections`} idPrefix={pre} withPanels tabs={tabs} value={current?.id} onChange={onTabChange} />
      ) : null}
      <div ref={bodyRef} className="hk-insp-body">
        {stacked
          ? tabs.map((t) => (
              <section key={t.id} className="hk-insp-stack" aria-labelledby={`${pre}-stack-${t.id}`}>
                <h3 id={`${pre}-stack-${t.id}`} className="hk-insp-stack-title house-label">
                  {t.icon ? <HouseIcon icon={t.icon} /> : null}{t.label}
                </h3>
                {t.body}
                <ResetFoot tab={t} />
              </section>
            ))
          : current ? (
              tabs.length > 1 ? (
                <TabPanel idPrefix={pre} id={current.id} className="hk-insp-tab">
                  {current.body}
                  <ResetFoot tab={current} />
                </TabPanel>
              ) : (
                <div className="hk-insp-tab">{current.body}<ResetFoot tab={current} /></div>
              )
            ) : null}
      </div>
    </section>
  );
}

export { Inspector };
