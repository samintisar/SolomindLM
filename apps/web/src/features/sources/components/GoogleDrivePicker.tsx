import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GOOGLE_BROWSER_API_KEY = import.meta.env.VITE_GOOGLE_BROWSER_API_KEY as string | undefined;
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]+$/;
const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";
const GOOGLE_APP_ID_PATTERN = /^\d+$/;

function hasValidGooglePickerConfig() {
  if (!GOOGLE_BROWSER_API_KEY || !GOOGLE_API_KEY_PATTERN.test(GOOGLE_BROWSER_API_KEY)) {
    console.error(
      'Google Drive picker misconfigured: expected VITE_GOOGLE_BROWSER_API_KEY to be a browser API key starting with "AIza". Configure API restrictions and HTTP referrer restrictions in Google Cloud Console.',
      { apiKeyPresent: Boolean(GOOGLE_BROWSER_API_KEY) }
    );
    return false;
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_ID.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    console.error(
      "Google Drive picker misconfigured: expected VITE_GOOGLE_CLIENT_ID to be a Google OAuth web client ID.",
      { clientIdPresent: Boolean(GOOGLE_CLIENT_ID) }
    );
    return false;
  }

  if (!GOOGLE_APP_ID || !GOOGLE_APP_ID_PATTERN.test(GOOGLE_APP_ID)) {
    console.error(
      "Google Drive picker misconfigured: expected VITE_GOOGLE_APP_ID to be your Google Cloud project number used by PickerBuilder.setAppId().",
      { appIdPresent: Boolean(GOOGLE_APP_ID) }
    );
    return false;
  }

  return true;
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface GoogleDrivePickerHandle {
  open: () => void;
}

interface Props {
  onFilesSelected: (files: PickedFile[], accessToken: string) => void;
}

export function GoogleDrivePicker({
  onFilesSelected,
  ref,
}: Props & { ref?: React.Ref<GoogleDrivePickerHandle> }) {
  const tokenClientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const scriptsLoadedRef = useRef(false);
  const pickerInitedRef = useRef(false);
  const gisInitedRef = useRef(false);
  const pendingOpenRef = useRef(false);

  const openPicker = useCallback(
    (accessToken: string) => {
      if (!hasValidGooglePickerConfig()) return;

      if (typeof google === "undefined" || !google.picker?.PickerBuilder) {
        pendingOpenRef.current = true;
        console.error(
          "Google Drive picker is not ready yet. The Picker library has not finished loading."
        );
        return;
      }

      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setDeveloperKey(GOOGLE_BROWSER_API_KEY!)
        .setAppId(GOOGLE_APP_ID!)
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data: google.picker.ResponseObject) => {
          const action = data.action ?? data[google.picker.Response.ACTION];
          const docs = data.docs ?? data[google.picker.Response.DOCUMENTS];

          if (action === google.picker.Action.PICKED && Array.isArray(docs)) {
            const files: PickedFile[] = docs
              .filter((doc) => doc.id && doc.name && doc.mimeType)
              .map((doc) => ({
                id: doc.id!,
                name: doc.name!,
                mimeType: doc.mimeType!,
                sizeBytes: doc.sizeBytes,
              }));

            if (files.length > 0) {
              onFilesSelected(files, accessToken);
            }
          }
        })
        .build();

      picker.setVisible(true);
    },
    [onFilesSelected]
  );

  const requestAccessToken = useCallback(() => {
    if (!tokenClientRef.current) return;
    tokenClientRef.current.requestAccessToken({
      prompt: accessTokenRef.current ? "" : "consent",
    });
  }, []);

  const maybeOpenPicker = useCallback(() => {
    if (!pendingOpenRef.current) return;
    if (!pickerInitedRef.current || !gisInitedRef.current || !tokenClientRef.current) return;

    pendingOpenRef.current = false;
    requestAccessToken();
  }, [requestAccessToken]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        if (!hasValidGooglePickerConfig()) return;

        pendingOpenRef.current = true;
        maybeOpenPicker();

        if (!pickerInitedRef.current || !gisInitedRef.current || !tokenClientRef.current) {
          console.warn(
            "Google Drive picker is still loading and will open automatically when ready."
          );
        }
      },
    }),
    [maybeOpenPicker]
  );

  useEffect(() => {
    if (scriptsLoadedRef.current || !hasValidGooglePickerConfig()) return;

    const gisScript = document.createElement("script");
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true;
    gisScript.onload = () => {
      if (typeof google === "undefined" || !google.accounts?.oauth2) {
        console.error("Google Identity Services failed to load.");
        return;
      }

      tokenClientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: SCOPES,
        callback: (response) => {
          if ("error" in response && response.error) {
            console.error("Google Drive OAuth failed.", response);
            return;
          }

          if (response.access_token) {
            accessTokenRef.current = response.access_token;
            openPicker(response.access_token);
          }
        },
      });

      gisInitedRef.current = true;
      maybeOpenPicker();
    };
    document.body.appendChild(gisScript);

    const gapiScript = document.createElement("script");
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.async = true;
    gapiScript.onload = () => {
      if (typeof gapi === "undefined") {
        console.error("Google API loader failed to initialize.");
        return;
      }

      gapi.load("client:picker", async () => {
        await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
        pickerInitedRef.current = true;
        maybeOpenPicker();
      });
    };
    document.body.appendChild(gapiScript);

    scriptsLoadedRef.current = true;
  }, [maybeOpenPicker, openPicker]);

  return null;
}
