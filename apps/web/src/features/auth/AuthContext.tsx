import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { setStoredUser } from '@/shared/utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Wrapper to set user and sync to localStorage synchronously
  const setUserAndSync = useCallback((newUser: User | null) => {
    setUser(newUser);
    setStoredUser(newUser);
  }, []);

  // Check for existing session (cookies are set by backend)
  const checkSession = useCallback(async () => {
    try {
      // Verify session is still valid by calling /me endpoint
      // Cookies are automatically sent by the browser
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUserAndSync({ id: data.userId, email: data.email });
      } else {
        // Session expired or not authenticated (expected if user hasn't logged in)
        setUserAndSync(null);
      }
    } catch (error) {
      // Only log unexpected errors, not expected 401s
      if (error instanceof Error && !error.message.includes('401')) {
        console.error('Session check error:', error);
      }
      setUserAndSync(null);
    } finally {
      setIsLoading(false);
    }
  }, [setUserAndSync]);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Listen for custom auth events (for OAuth callback handling)
  useEffect(() => {
    const handleAuthChange = () => {
      checkSession();
    };

    window.addEventListener('auth-change', handleAuthChange);

    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, [checkSession]);

  // Listen for session expired events from API calls
  // This handles the case where the refresh token has also expired
  useEffect(() => {
    const handleSessionExpired = () => {
      console.log('[Auth] Session expired, logging out user');
      setUserAndSync(null);
    };

    window.addEventListener('auth-session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('auth-session-expired', handleSessionExpired);
    };
  }, [setUserAndSync]);

  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Sign in failed');
    }

    // Verify session after login to ensure cookies are set and working
    await checkSession();

    // Return user from session check or fallback to login response
    const newUser: User = {
      id: data.userId,
      email: data.email,
    };

    setUserAndSync(newUser);
    return newUser;
  }, [checkSession, setUserAndSync]);

  const signUp = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Sign up failed');
    }

    // If email confirmation is needed
    if (data.needsConfirmation) {
      throw new Error('Please check your email to confirm your account before signing in.');
    }

    const newUser: User = {
      id: data.userId,
      email: data.email,
    };

    setUserAndSync(newUser);
    return newUser;
  }, [setUserAndSync]);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUserAndSync(null);
    }
  }, [setUserAndSync]);

  const signInWithGoogle = useCallback(async () => {
    // Initiate OAuth with Supabase directly from the browser
    // This ensures state cookies are set properly in the browser
    // Supabase will redirect back to /auth/callback with an authorization code
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Use PKCE flow (Authorization Code with PKCE)
        // This is more secure than implicit flow
        skipBrowserRedirect: false,
      },
    });

    if (error) {
      throw error;
    }

    // Supabase SDK will redirect to Google OAuth
    // If data.url is available, we can manually redirect
    if (data?.url) {
      window.location.href = data.url;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      // Session is truly invalid, clear user state
      setUserAndSync(null);
      throw new Error('Session refresh failed');
    }

    // Cookies are automatically updated by the backend
    // Re-check session to get updated user info
    await checkSession();
  }, [checkSession, setUserAndSync]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
