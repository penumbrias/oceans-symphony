import { useEffect } from "react";

/**
 * Hook to handle mention highlights from URL query params
 * Scrolls to item and applies a glowing border animation for 5 seconds
 * @param {string} paramName - Query param name (e.g., 'id', 'bulletinId', 'date')
 * @param {boolean} isReady - Flag indicating when data is loaded
 */
export function useMentionHighlight(paramName = "id", isReady = true) {
  useEffect(() => {
    if (!isReady) return;

    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get(paramName);

    if (!highlightId) return;

    const el = document.getElementById(`item-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("mention-highlight");
      setTimeout(() => el.classList.remove("mention-highlight"), 5000);
    }
  }, [paramName, isReady]);
}