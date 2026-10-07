import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll position on route changes (React Router does not do this by default). A `#hash`
 * scrolls to the element with that id instead, e.g. `/#pricing` from the content pages' nav.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // By id, not querySelector: a hash need not be a valid CSS selector.
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return null;
}
