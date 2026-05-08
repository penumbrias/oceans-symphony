import { useEffect, useState } from "react";
import { isPreviewActive, getActiveSystem, subscribe } from "./previewMode";

// React hook that re-renders whenever Preview Mode is toggled or the active
// system changes. Returns { active, system } — system is null when inactive.
export function usePreviewMode() {
  const [snapshot, setSnapshot] = useState(() => ({
    active: isPreviewActive(),
    system: getActiveSystem(),
  }));

  useEffect(() => {
    return subscribe(() => {
      setSnapshot({ active: isPreviewActive(), system: getActiveSystem() });
    });
  }, []);

  return snapshot;
}
