import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Helper to get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse query parameters from URL
 */
function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse hash fragment for OAuth tokens (Supabase implicit flow)
        const hashFragment = window.location.hash.substring(1); // Remove leading #
        const hashParams = new URLSearchParams(hashFragment);

        // Parse query parameters for state (PKCE flow)
        const queryParams = getQueryParams();

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const state = queryParams.get('state') || hashParams.get('state');
        const errorParam = queryParams.get('error') || hashParams.get('error');
        const errorDescription = queryParams.get('error_description') || hashParams.get('error_description');

        if (errorParam) {
          setError(errorDescription || errorParam);
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        if (!accessToken) {
          setError('No authorization tokens received');
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        // Get CSRF token from XSRF-TOKEN cookie for protection
        const csrfToken = getCsrfToken();

        // Verify tokens with backend and set cookies
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (csrfToken) {
          headers['X-XSRF-Token'] = csrfToken;
        }

        // Include state parameter for PKCE validation (if available)
        const requestBody: { accessToken: string; refreshToken?: string | null; state?: string | null } = {
          accessToken,
          refreshToken,
        };

        if (state) {
          requestBody.state = state;
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/google/callback`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          credentials: 'include',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Authentication failed');
        }

        // Small delay to ensure cookies are processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dispatch event to notify AuthContext of login
        window.dispatchEvent(new CustomEvent('auth-change'));

        // Clean up URL hash and query params, then redirect to home
        window.history.replaceState({}, '', window.location.pathname);
        navigate('/home');
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

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
