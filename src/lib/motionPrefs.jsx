// Reduce motion, all the way (UI critique item 12, v0.364.12).
//
// The CSS switch (`html.a11y-reduce-motion`, index.css) already stops CSS
// animations and transitions. Two kinds of movement got past it, and a
// low-vision tester lost track of the screen because of them:
//  - framer-motion animates in JavaScript, so sheets, tab pages and
//    drill-ins still slid. <ReduceMotionConfig> tells framer-motion to drop
//    every movement (fades stay, they're short and don't move anything).
//  - `scrollTo({ behavior: "smooth" })` overrides CSS scroll-behavior, so
//    page swipes and "jump to" still glided. installReducedMotionScroll()
//    turns those into instant jumps while reduce motion is on.
// Both follow the in-app switch AND the device's own "reduce motion".
//
// Also here: "Option menus as one list" — the inspector's tabs shown as one
// stacked list with a heading per section, for people who'd rather scroll
// than switch pages. A per-device preference (in BACKUP_LS_KEYS).

import React, { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";

const CLASS = "a11y-reduce-motion";
export const INSPECTOR_STACKED_KEY = "symphony_a11y_inspectorStacked";
const STACKED_EVENT = "inspector-stacked-changed";

export function reduceMotionOn() {
  if (typeof document === "undefined") return false;
  if (document.documentElement.classList.contains(CLASS)) return true;
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false; } catch { return false; }
}

export function useReduceMotion() {
  const [on, setOn] = useState(reduceMotionOn);
  useEffect(() => {
    const update = () => setOn(reduceMotionOn());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    let mq = null;
    try { mq = window.matchMedia("(prefers-reduced-motion: reduce)"); mq.addEventListener?.("change", update); } catch { /* old browser */ }
    return () => { obs.disconnect(); mq?.removeEventListener?.("change", update); };
  }, []);
  return on;
}

export function ReduceMotionConfig({ children }) {
  const on = useReduceMotion();
  return <MotionConfig reducedMotion={on ? "always" : "user"}>{children}</MotionConfig>;
}

let installed = false;
export function installReducedMotionScroll() {
  if (installed || typeof window === "undefined" || typeof Element === "undefined") return;
  installed = true;
  const calm = (arg) => (arg && typeof arg === "object" && arg.behavior === "smooth" && reduceMotionOn()
    ? { ...arg, behavior: "auto" } : arg);
  const wrap = (obj, name) => {
    const orig = obj?.[name];
    if (typeof orig !== "function") return;
    obj[name] = function (a, ...rest) { return orig.call(this, calm(a), ...rest); };
  };
  wrap(Element.prototype, "scrollTo");
  wrap(Element.prototype, "scrollBy");
  wrap(Element.prototype, "scrollIntoView");
  wrap(window, "scrollTo");
  wrap(window, "scrollBy");
}

export function inspectorStacked() {
  try { return localStorage.getItem(INSPECTOR_STACKED_KEY) === "true"; } catch { return false; }
}

export function setInspectorStacked(on) {
  try { localStorage.setItem(INSPECTOR_STACKED_KEY, String(!!on)); } catch { /* storage off */ }
  try { window.dispatchEvent(new Event(STACKED_EVENT)); } catch { /* no window */ }
}

export function useInspectorStacked() {
  const [on, setOn] = useState(inspectorStacked);
  useEffect(() => {
    const update = () => setOn(inspectorStacked());
    window.addEventListener(STACKED_EVENT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(STACKED_EVENT, update); window.removeEventListener("storage", update); };
  }, []);
  return on;
}
