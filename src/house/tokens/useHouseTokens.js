// The person's paint, as house tokens, live (step 1.1).
//
// Reads the settings row (the shared ["systemSettings"] cache) and this
// device's look preferences, runs them through the paint translator and
// houseTokens(), and re-runs when the old house's appliers change <html>
// (dark, high contrast, reduce motion, text size) or another tab changes a
// preference. READS ONLY: it never writes a setting, a record or storage.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { readUiLook } from "@/lib/pixelLook";
import { translatePaint, readDevicePaint } from "@/house/paint/translate";
import { houseTokens } from "@/house/tokens/roles";

function readEnv() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  let isDarkOS = true;
  try { isDarkOS = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { /* no window */ }
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  return {
    device: readDevicePaint(get, { isDarkOS }),
    highContrast: !!root?.classList.contains("a11y-high-contrast"),
    // The class list itself, so any change the old appliers make re-runs.
    stamp: root ? `${root.className}|${root.getAttribute("style") || ""}` : "",
  };
}

export function useHouseTokens() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(list);
  const [env, setEnv] = useState(readEnv);

  useEffect(() => {
    const refresh = () => setEnv((prev) => {
      const next = readEnv();
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    let mo;
    try {
      mo = new MutationObserver(refresh);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-ui-look"] });
    } catch { /* no DOM */ }
    let mq;
    try { mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener?.("change", refresh); } catch { /* no window */ }
    window.addEventListener("storage", refresh);
    return () => {
      mo?.disconnect();
      mq?.removeEventListener?.("change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return useMemo(() => {
    const paint = translatePaint(row, { device: env.device });
    const tokens = houseTokens(paint, { look: readUiLook(row), highContrast: env.highContrast });
    return { paint, ...tokens };
  }, [row, env]);
}
