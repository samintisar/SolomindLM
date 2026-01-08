import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
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

  // Check for existing session
  const checkSession = useCallback(async () => {
    try {
      const storedUser = localStorage.getItem('solomind_user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        // Verify session is still valid
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${parsedUser.accessToken}`,
          },
        });

        if (response.ok) {
          setUser(parsedUser);
        } else {
          // Session expired, try to refresh
          if (parsedUser.refreshToken) {
            try {
              const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: parsedUser.refreshToken }),
              });

              if (refreshResponse.ok) {
                const data = await refreshResponse.json();
                const refreshedUser = {
                  ...parsedUser,
                  accessToken: data.accessToken,
                  refreshToken: data.refreshToken,
                };
                localStorage.setItem('solomind_user', JSON.stringify(refreshedUser));
                setUser(refreshedUser);
              } else {
                localStorage.removeItem('solomind_user');
              }
            } catch {
              localStorage.removeItem('solomind_user');
            }
          } else {
            localStorage.removeItem('solomind_user');
          }
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Listen for storage changes (e.g., login from another tab or callback)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'solomind_user') {
        if (e.newValue && !e.oldValue) {
          // User logged in
          const parsedUser = JSON.parse(e.newValue);
          setUser(parsedUser);
        } else if (!e.newValue && e.oldValue) {
          // User logged out
          setUser(null);
        }
      }
    };

    // Also listen for custom auth events (for same-tab updates)
    const handleAuthChange = () => {
      checkSession();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleAuthChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, [checkSession]);

  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Sign in failed');
    }

    const newUser: User = {
      id: data.userId,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };

    setUser(newUser);
    localStorage.setItem('solomind_user', JSON.stringify(newUser));

    return newUser;
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };

    setUser(newUser);
    localStorage.setItem('solomind_user', JSON.stringify(newUser));

    return newUser;
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (user?.accessToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('solomind_user');
    }
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    // Redirect to backend OAuth endpoint which will handle Supabase OAuth
    const redirectUrl = `${window.location.origin}/auth/callback`;
    window.location.href = `${API_BASE_URL}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!user?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: user.refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Session refresh failed');
    }

    const data = await response.json();

    const refreshedUser: User = {
      ...user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };

    setUser(refreshedUser);
    localStorage.setItem('solomind_user', JSON.stringify(refreshedUser));
  }, [user]);

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
