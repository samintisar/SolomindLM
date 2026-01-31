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
          console.log('[OTT Handler] Calling:', `${authBaseURL}/cross-domain/one-time-token/verify`);

          const verifyResponse = await fetch(`${authBaseURL}/cross-domain/one-time-token/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: ott }),
          });

          console.log('[OTT Handler] Response status:', verifyResponse.status);

          if (!verifyResponse.ok) {
            console.error('[OTT Handler] Verification failed:', verifyResponse.status, await verifyResponse.text());
            return;
          }

          // Log all response headers for debugging
          console.log('[OTT Handler] Response headers:');
          verifyResponse.headers.forEach((value, key) => {
            console.log(`  ${key}: ${value.substring(0, 100)}`);
          });

          // Extract the session token from the custom header
          const customCookie = verifyResponse.headers.get('set-better-auth-cookie');
          if (customCookie) {
            console.log('[OTT Handler] Found session cookie, storing...');
            console.log('[OTT Handler] Cookie value:', customCookie.substring(0, 200));

            // Parse the cookie: "__Secure-better-auth.session_token=VALUE; Max-Age=...; ..."
            const cookieParts = customCookie.split(';');
            const [nameValue, ...attrs] = cookieParts;
            const [name, ...valueParts] = nameValue.split('=');
            const value = valueParts.join('=');

            if (name && value) {
              const trimmedName = name.trim();
              const trimmedValue = value.trim();

              console.log('[OTT Handler] Parsed:', {
                name: trimmedName,
                valuePreview: trimmedValue.substring(0, 50),
              });

              // Store the cookie with proper format for crossDomainClient
              const cookieName = 'better-auth_cookie'; // The storage key used by crossDomainClient

              // Parse Max-Age to calculate expiration
              let expires: Date | null = null;
              const maxAgeAttr = attrs.find(a => a.trim().toLowerCase().startsWith('max-age='));
              if (maxAgeAttr) {
                const maxAge = parseInt(maxAgeAttr.split('=')[1], 10);
                if (!isNaN(maxAge)) {
                  expires = new Date(Date.now() + maxAge * 1000);
                }
              }

              // Parse the cookie data in the format crossDomainClient expects
              const cookieData: Record<string, { value: string; expires: Date | null }> = {};
              cookieData[trimmedName] = {
                value: trimmedValue,
                expires,
              };

              // Merge with existing cookies in localStorage
              const existing = localStorage.getItem(cookieName);
              if (existing) {
                try {
                  const parsed = JSON.parse(existing);
                  console.log('[OTT Handler] Existing cookies:', Object.keys(parsed));
                  Object.assign(cookieData, parsed);
                } catch (e) {
                  console.warn('[OTT Handler] Failed to parse existing cookies:', e);
                }
              }

              // Store merged cookies
              const cookieString = JSON.stringify(cookieData);
              localStorage.setItem(cookieName, cookieString);
              console.log('[OTT Handler] Stored in localStorage:', cookieName);

              // VERIFY it was actually stored
              const stored = localStorage.getItem(cookieName);
              if (stored) {
                console.log('[OTT Handler] Verification - SUCCESS! Cookie stored.');
                console.log('[OTT Handler] Stored data preview:', stored.substring(0, 200));
              } else {
                console.error('[OTT Handler] Verification - FAILED! Cookie not in localStorage!');
              }
            } else {
              console.error('[OTT Handler] Failed to parse cookie - missing name or value');
            }
          } else {
            console.error('[OTT Handler] No set-better-auth-cookie header in response!');
          }

          // Wait a bit for storage to settle
          await new Promise(resolve => setTimeout(resolve, 100));

          // Check localStorage before fetching session
          const storedBefore = localStorage.getItem('better-auth_cookie');
          console.log('[OTT Handler] Before getSession - localStorage has:', storedBefore ? 'YES' : 'NO');

          // Now fetch the session using the new cookie
          console.log('[OTT Handler] Fetching session...');
          await authClient.getSession();
          console.log('[OTT Handler] Session fetch completed');

          // Check localStorage after
          const storedAfter = localStorage.getItem('better-auth_cookie');
          console.log('[OTT Handler] After getSession - localStorage has:', storedAfter ? 'YES' : 'NO');

          // Notify the session signal to update React state
          (authClient as any).updateSession?.();

          // Force a page reload to ensure everything is fresh
          console.log('[OTT Handler] Reloading page to apply changes...');
          setTimeout(() => {
            window.location.reload();
          }, 200);
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
