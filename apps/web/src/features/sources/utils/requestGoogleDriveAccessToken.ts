const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

function loadGisScript(): Promise<void> {
  if (typeof google !== "undefined" && google.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Identity Services"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.body.appendChild(s);
  });
}

/**
 * Prompts Google OAuth (drive.readonly) and resolves with an access token.
 * Used for refreshing Google Drive–backed sources without opening the file picker.
 */
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
    throw new Error("Google Drive is not configured.");
  }

  await loadGisScript();
  if (typeof google === "undefined" || !google.accounts?.oauth2) {
    throw new Error("Google Identity Services failed to load.");
  }

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error("No access token received from Google."));
          return;
        }
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}
