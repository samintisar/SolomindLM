import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestNativeGoogleSignIn, requestNativeSignOut } from "@/features/auth/nativeShellAuth";
import { getConvexAuthUserMessage } from "@/features/auth/utils/authErrorMessage";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthContext, User } from "./useAuth";

type AuthProviderContentProps = {
  children: ReactNode;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

function AuthProviderContent({ children, signInGoogle, signOutUser }: AuthProviderContentProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.getCurrentUser);
  const [authError, setAuthError] = useState<string | null>(null);

  const user: User | null = currentUser
    ? { id: currentUser.id, email: currentUser.email, name: currentUser.name }
    : null;

  const signInWithGoogle = async (): Promise<void> => {
    setAuthError(null);
    try {
      await signInGoogle();
    } catch (error) {
      setAuthError(getConvexAuthUserMessage(error, "Google sign-in failed"));
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    await signOutUser();
    navigate("/sign-in", { replace: true });
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

function AuthProviderWithConvexAuth({ children }: { children: ReactNode }) {
  const { signIn, signOut: authSignOut } = useAuthActions();
  return (
    <AuthProviderContent
      signInGoogle={async () => {
        await signIn("google", { redirectTo: "/home" });
      }}
      signOutUser={authSignOut}
    >
      {children}
    </AuthProviderContent>
  );
}

/** Browser uses Convex Auth actions; native shell delegates OAuth/password flows to the host app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (isNativeShell()) {
    return (
      <AuthProviderContent
        signInGoogle={async () => {
          await requestNativeGoogleSignIn();
        }}
        signOutUser={requestNativeSignOut}
      >
        {children}
      </AuthProviderContent>
    );
  }
  return <AuthProviderWithConvexAuth>{children}</AuthProviderWithConvexAuth>;
}
