import { useLayoutEffect } from "react";

// The pixel desks (To-do, Activities) fill the window below the page's
// top edge and above the status bar. Their top moves with banners above
// them, so it is measured and handed to CSS as --pt-top.
export function usePixelDeskHeight(ref, on) {
  useLayoutEffect(() => {
    if (!on) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const main = document.getElementById("main-content");
      const padB = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--pt-top", `${Math.round(top + padB + 6)}px`);
    };
    measure();
    const timers = [setTimeout(measure, 400), setTimeout(measure, 1500)];
    let ro;
    try { ro = new ResizeObserver(measure); if (el.parentElement) ro.observe(el.parentElement); } catch { /* */ }
    window.addEventListener("resize", measure);
    return () => { timers.forEach(clearTimeout); ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [ref, on]);
}
