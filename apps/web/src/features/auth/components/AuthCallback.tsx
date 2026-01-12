import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse hash fragment for OAuth tokens
        const hashFragment = window.location.hash.substring(1); // Remove leading #
        const params = new URLSearchParams(hashFragment);

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');

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

        // Verify tokens with backend and set cookies
        const response = await fetch(`${API_BASE_URL}/api/auth/google/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, refreshToken }),
          credentials: 'include',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Authentication failed');
        }

        // Dispatch event to notify AuthContext of login
        window.dispatchEvent(new CustomEvent('auth-change'));

        // Clean up URL hash and redirect to home
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
