import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { authClient } from '@/lib/auth-client';
import App from './App';
import './index.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl || typeof convexUrl !== 'string') {
  throw new Error(
    'VITE_CONVEX_URL is required. Set it in apps/web/.env.local (dev) or in your hosting env (prod) to your Convex deployment URL (e.g. https://your-deployment.convex.cloud).'
  );
}

const convex = new ConvexReactClient(convexUrl, {
  expectAuth: true,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Custom OTT handler to fix cross-domain auth cookie storage issue
function OttHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const ott = url.searchParams.get('ott');
      if (ott) {
        console.log('[OTT Handler] Processing OTT...');

        // Remove OTT from URL to prevent re-processing
        url.searchParams.delete('ott');
        window.history.replaceState({}, '', url.toString());

        try {
          // Verify OTT manually to get the session token
          const authBaseURL = import.meta.env.VITE_CONVEX_SITE_URL?.replace(/\/$/, '') + '/auth';
          const verifyResponse = await fetch(`${authBaseURL}/cross-domain/one-time-token/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: ott }),
          });

          if (!verifyResponse.ok) {
            console.error('[OTT Handler] Verification failed:', verifyResponse.status);
            return;
          }

          // Extract the session token from the custom header
          const customCookie = verifyResponse.headers.get('set-better-auth-cookie');
          if (customCookie) {
            console.log('[OTT Handler] Found session cookie, storing...');

            // Parse the cookie: "__Secure-better-auth.session_token=VALUE; Max-Age=...; ..."
            const [nameValue, ...attrs] = customCookie.split(';');
            const [name, value] = nameValue.split('=');

            if (name && value) {
              // Store the cookie with proper format for crossDomainClient
              const cookieName = 'better-auth_cookie'; // The storage key used by crossDomainClient

              // Parse the cookie attributes (Max-Age, Path, etc.)
              const cookieData: Record<string, { value: string; expires?: Date | null }> = {};
              cookieData[name.trim()] = {
                value: value.trim(),
                expires: null, // Session cookies or we'll parse Max-Age if needed
              };

              // Merge with existing cookies in localStorage
              const existing = localStorage.getItem(cookieName);
              if (existing) {
                try {
                  const parsed = JSON.parse(existing);
                  Object.assign(cookieData, parsed);
                } catch (e) {
                  console.warn('[OTT Handler] Failed to parse existing cookies:', e);
                }
              }

              // Store merged cookies
              localStorage.setItem(cookieName, JSON.stringify(cookieData));
              console.log('[OTT Handler] Session cookie stored successfully');
            }
          } else {
            console.warn('[OTT Handler] No set-better-auth-cookie header in response!');
          }

          // Now fetch the session using the new cookie
          console.log('[OTT Handler] Fetching session...');
          await authClient.getSession();
          console.log('[OTT Handler] Session established');

          // Notify the session signal to update React state
          (authClient as any).updateSession();
        } catch (error) {
          console.error('[OTT Handler] Error:', error);
        }
      }
    })();
  }, []);

  return <>{children}</>;
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <OttHandler>
        {/* Move App inside the provider - it contains BrowserRouter */}
        <App />
      </OttHandler>
    </ConvexBetterAuthProvider>
  </React.StrictMode>
);
