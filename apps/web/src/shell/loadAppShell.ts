/** The authenticated app (notebooks, studio, billing) is its own chunk; public pages never load it. */
export const loadAppShell = () => import("./AppShell");
