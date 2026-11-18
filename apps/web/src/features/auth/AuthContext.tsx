import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  requestNativeAppleSignIn,
  requestNativeGoogleSignIn,
  requestNativeSignOut,
} from "@/features/auth/nativeShellAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthContext, type AuthContextType } from "./useAuth";

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
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.auth.getCurrentUser);

  const signOut = useCallback(async (): Promise<void> => {
    await signOutUser();
    navigate("/sign-in", { replace: true });
  }, [signOutUser, navigate]);

  const value = useMemo<AuthContextType>(
    () => ({
      user: currentUser
        ? {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            image: currentUser.image,
          }
        : null,
      isLoading,
      isAuthenticated,
      signInWithGoogle: signInGoogle,
      signInWithApple: signInApple,
      signOut,
    }),
    [currentUser, isLoading, isAuthenticated, signInGoogle, signInApple, signOut]
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

const nativeSignInGoogle = async () => {
  await requestNativeGoogleSignIn();
};
const nativeSignInApple = async () => {
  await requestNativeAppleSignIn();
};

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
