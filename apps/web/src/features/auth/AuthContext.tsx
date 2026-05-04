import { ReactNode, useState } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { getConvexAuthUserMessage } from "@/features/auth/utils/authErrorMessage";
import { getNativeWebViewBridge, isNativeShell } from "@/utils/platformDetection";
import { AuthContext, User } from "./useAuth";

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
      setAuthError(getConvexAuthUserMessage(error, "Google sign-in failed"));
    }
  };

  const signOut = async (): Promise<void> => {
    await authSignOut();
    const bridge = getNativeWebViewBridge();
    if (isNativeShell() && bridge) {
      bridge.postMessage(JSON.stringify({ type: "convex-auth-clear" }));
    }
    navigate("/home", { replace: true });
  };

  const clearAuthError = (): void => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        authError,
        signInWithGoogle,
        signOut,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
