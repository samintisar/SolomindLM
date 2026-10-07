/** Shared Google sign-in setup for the Drive picker and Drive source refresh. */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** True when VITE_GOOGLE_CLIENT_ID looks like an OAuth web client id. */
export const isGoogleClientIdValid = Boolean(
  GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com")
);

const GIS_SRC = "https://accounts.google.com/gsi/client";

const scriptLoads = new Map<string, Promise<void>>();

/** Append an external script once; later calls share the first load. A failed load can be retried. */
export function loadScript(src: string): Promise<void> {
  let load = scriptLoads.get(src);
  if (!load) {
    load = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoads.delete(src);
        script.remove();
        reject(new Error(`Failed to load ${src}`));
      };
      document.body.appendChild(script);
    });
    scriptLoads.set(src, load);
  }
  return load;
}

/** Load Google Identity Services (GIS), which issues the OAuth access tokens. */
export async function loadGoogleIdentityServices(): Promise<void> {
  if (typeof google !== "undefined" && google.accounts?.oauth2) return;
  try {
    await loadScript(GIS_SRC);
  } catch {
    throw new Error("Failed to load Google Identity Services");
  }
}
