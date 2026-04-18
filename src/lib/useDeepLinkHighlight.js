import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Hook to handle deep-linking with highlight/glow effect
 * Reads query param, scrolls to element by id, and applies glow animation
 * @param {string} paramName - Query parameter name (e.g., 'id', 'bulletinId')
 * @param {string} idPrefix - Prefix for the element id (e.g., 'item-' for id='item-123')
 */
export function useDeepLinkHighlight(paramName, idPrefix = "item-") {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const id = searchParams.get(paramName);
    if (!id) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const element = document.getElementById(`${idPrefix}${id}`);
      if (element) {
        // Scroll into view
        element.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add glow animation
        element.classList.add("mention-highlight");

        // Remove after 5 seconds
        const glowTimer = setTimeout(() => {
          element.classList.remove("mention-highlight");
        }, 5000);

        return () => clearTimeout(glowTimer);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [searchParams, paramName, idPrefix]);
}