/** Smoothly scrolls the page so the element with `id` sits at the top. No-op when it isn't rendered. */
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
