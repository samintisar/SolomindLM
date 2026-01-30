import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { authClient } from '@/lib/auth-client';

export interface User {
  id: string;
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  forgetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.getCurrentUser);
  const [authError, setAuthError] = useState<string | null>(null);

  // Note: OAuth callback handling is done by ConvexBetterAuthProvider in index.tsx
  // It automatically verifies OTT, fetches Convex token, and sets auth
  // We just need to provide the auth context and handle navigation if needed

  const user: User | null = currentUser
    ? {
        id: currentUser.id,
        email: currentUser.email ?? undefined,
        name: currentUser.name ?? undefined,
      }
    : null;

  const signIn = async (email: string, password: string): Promise<void> => {
    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: window.location.href,
    });
    if (result.error) {
      throw new Error(result.error.message || "Sign in failed");
    }
  };

  const signUp = async (email: string, password: string, name?: string): Promise<void> => {
    const result = await authClient.signUp.email({
      email,
      password,
      name,
      callbackURL: window.location.href,
    });
    if (result.error) {
      throw new Error(result.error.message || "Sign up failed");
    }
    // Session should be automatically set, trigger refresh
    await refreshSession();
  };

  const forgetPassword = async (email: string): Promise<void> => {
    const result = await (authClient as any).forgetPassword({ email });
    if (result.error) {
      throw new Error(result.error.message || "Failed to send reset email");
    }
    // Show success message even if email doesn't exist (security best practice)
    // "If an account exists with this email, you'll receive a reset link."
  };

  const resetPassword = async (token: string, newPassword: string): Promise<void> => {
    const result = await authClient.resetPassword({ token, newPassword });
    if (result.error) {
      throw new Error(result.error.message || "Failed to reset password");
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    setAuthError(null);
    sessionStorage.setItem('oauth_in_progress', 'true');
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: `${window.location.origin}/home`,
    });
  };

  const signOut = async (): Promise<void> => {
    await authClient.signOut();
    sessionStorage.removeItem('oauth_in_progress');
    // Immediate redirect to home page to prevent queries from running without auth
    navigate('/home', { replace: true });
  };

  const clearAuthError = (): void => {
    setAuthError(null);
  };

  const refreshSession = async (): Promise<void> => {
    // Better Auth handles session refresh via Convex
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        authError,
        signIn,
        signUp,
        resetPassword,
        forgetPassword,
        signInWithGoogle,
        signOut,
        refreshSession,
        clearAuthError,
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
