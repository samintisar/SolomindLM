import {
  DRIVE_READONLY_SCOPE,
  GOOGLE_CLIENT_ID,
  isGoogleClientIdValid,
  loadGoogleIdentityServices,
} from "./googleIdentity";

/**
 * Prompts Google OAuth (drive.readonly) and resolves with an access token.
 * Used for refreshing Google Drive–backed sources without opening the file picker.
 */
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const clientId = GOOGLE_CLIENT_ID;
  if (!clientId || !isGoogleClientIdValid) {
    throw new Error("Google Drive is not configured.");
  }

  await loadGoogleIdentityServices();
  if (typeof google === "undefined" || !google.accounts?.oauth2) {
    throw new Error("Google Identity Services failed to load.");
  }

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_READONLY_SCOPE,
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
