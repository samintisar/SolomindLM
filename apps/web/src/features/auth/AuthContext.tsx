import { createContext, useContext, ReactNode, useState } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useAuthActions } from '@convex-dev/auth/react';

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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.getCurrentUser);
  const { signIn, signOut: authSignOut } = useAuthActions();
  const [authError, setAuthError] = useState<string | null>(null);

  const user: User | null = currentUser
    ? { id: currentUser.id, email: currentUser.email, name: currentUser.name }
    : null;

  const signInWithGoogle = async (): Promise<void> => {
    setAuthError(null);
    try {
      await signIn("google", { redirectTo: "/home" });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google sign-in failed');
    }
  };

  const signOut = async (): Promise<void> => {
    await authSignOut();
    navigate('/home', { replace: true });
  };

  const clearAuthError = (): void => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated, authError, signInWithGoogle, signOut, clearAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
