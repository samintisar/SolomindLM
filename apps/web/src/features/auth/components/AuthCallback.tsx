import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * AuthCallback Component - Handles both Authorization Code and Implicit flows
 *
 * OAuth flows supported:
 *
 * 1. Authorization Code Flow (PKCE) - preferred, more secure:
 *    - Frontend initiates OAuth with Supabase
 *    - Supabase redirects back with ?code= in query params
 *    - Frontend sends code to backend for secure token exchange
 *
 * 2. Implicit Flow - fallback, Supabase default:
 *    - Frontend initiates OAuth with Supabase
 *    - Supabase redirects back with #access_token= in hash fragment
 *    - Frontend sends tokens to backend to set HttpOnly cookies
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for OAuth error in query params
        const oauthError = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (oauthError) {
          setError(errorDescription || oauthError);
          setTimeout(() => navigate('/', { replace: true }), 3000);
          return;
        }

        // Try Authorization Code flow first (preferred - PKCE)
        const code = searchParams.get('code');

        if (code) {
          // Authorization Code Flow: Send code to backend for secure exchange
          const response = await fetch(`${API_BASE_URL}/api/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
            credentials: 'include',
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to exchange authorization code');
          }

          // Success! Backend has set HttpOnly cookies
          window.dispatchEvent(new CustomEvent('auth-change'));
          navigate('/home', { replace: true });
          return;
        }

        // Fallback: Check for Implicit Flow tokens in hash fragment
        const hashFragment = window.location.hash.substring(1); // Remove leading #
        const hashParams = new URLSearchParams(hashFragment);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          // Implicit Flow: Send tokens to backend to set HttpOnly cookies
          const response = await fetch(`${API_BASE_URL}/api/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, refreshToken }),
            credentials: 'include',
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to establish session');
          }

          // Success! Backend has set HttpOnly cookies
          window.dispatchEvent(new CustomEvent('auth-change'));
          // Clean up URL hash
          window.history.replaceState({}, '', window.location.pathname);
          navigate('/home', { replace: true });
          return;
        }

        // Neither code nor tokens found
        setError('No authorization code or tokens received from OAuth provider');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <div className="text-destructive text-lg font-semibold">
              Authentication Error
            </div>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">Redirecting...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
}
