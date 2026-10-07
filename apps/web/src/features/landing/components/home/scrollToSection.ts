/** Scrolls the page so the element with `id` sits at the top: smoothly, unless the user prefers reduced motion. No-op when it isn't rendered. */
export function scrollToSection(id: string): void {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}
