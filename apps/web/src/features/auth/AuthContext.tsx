import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  requestNativeAppleSignIn,
  requestNativeGoogleSignIn,
  requestNativeSignOut,
} from "@/features/auth/nativeShellAuth";
import { getConvexAuthUserMessage } from "@/features/auth/utils/authErrorMessage";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthContext, AuthContextType, User } from "./useAuth";

type AuthProviderContentProps = {
  children: ReactNode;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

function AuthProviderContent({
  children,
  signInGoogle,
  signInApple,
  signOutUser,
}: AuthProviderContentProps) {
  // Under <BrowserRouter> (not a data router) navigate is rebuilt on every pathname change. Read it
  // through a ref so signOut, and with it the context value, stays the same across navigations.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.getCurrentUser);
  const [authError, setAuthError] = useState<string | null>(null);

  const userId = currentUser?.id;
  const userEmail = currentUser?.email;
  const userName = currentUser?.name;
  const userImage = currentUser?.image;
  const user = useMemo<User | null>(
    () =>
      userId === undefined
        ? null
        : { id: userId, email: userEmail, name: userName, image: userImage },
    [userId, userEmail, userName, userImage]
  );

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    setAuthError(null);
    try {
      await signInGoogle();
    } catch (error) {
      setAuthError(getConvexAuthUserMessage(error, "Google sign-in failed"));
      throw error;
    }
  }, [signInGoogle]);

  const signInWithApple = useCallback(async (): Promise<void> => {
    setAuthError(null);
    try {
      await signInApple();
    } catch (error) {
      setAuthError(getConvexAuthUserMessage(error, "Apple sign-in failed"));
      throw error;
    }
  }, [signInApple]);

  const signOut = useCallback(async (): Promise<void> => {
    await signOutUser();
    navigateRef.current("/sign-in", { replace: true });
  }, [signOutUser]);

  const clearAuthError = useCallback((): void => setAuthError(null), []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      authError,
      signInWithGoogle,
      signInWithApple,
      signOut,
      clearAuthError,
    }),
    [
      user,
      isLoading,
      isAuthenticated,
      authError,
      signInWithGoogle,
      signInWithApple,
      signOut,
      clearAuthError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function AuthProviderWithConvexAuth({ children }: { children: ReactNode }) {
  const { signIn, signOut: authSignOut } = useAuthActions();
  const signInGoogle = useCallback(async () => {
    await signIn("google", { redirectTo: "/home" });
  }, [signIn]);
  const signInApple = useCallback(async () => {
    await signIn("apple", { redirectTo: "/home" });
  }, [signIn]);
  return (
    <AuthProviderContent
      signInGoogle={signInGoogle}
      signInApple={signInApple}
      signOutUser={authSignOut}
    >
      {children}
    </AuthProviderContent>
  );
}

async function nativeSignInGoogle(): Promise<void> {
  await requestNativeGoogleSignIn();
}

async function nativeSignInApple(): Promise<void> {
  await requestNativeAppleSignIn();
}

/** Browser uses Convex Auth actions; native shell delegates OAuth/password flows to the host app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (isNativeShell()) {
    return (
      <AuthProviderContent
        signInGoogle={nativeSignInGoogle}
        signInApple={nativeSignInApple}
        signOutUser={requestNativeSignOut}
      >
        {children}
      </AuthProviderContent>
    );
  }
  return <AuthProviderWithConvexAuth>{children}</AuthProviderWithConvexAuth>;
}
