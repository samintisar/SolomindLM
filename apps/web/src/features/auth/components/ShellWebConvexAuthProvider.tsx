import { useShellWebConvexAuth } from "@/features/auth/hooks/useShellWebConvexAuth";
import { NativeShellAuthListener } from "@/features/auth/components/NativeShellAuthListener";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { createContext, type ReactNode } from "react";

export const ShellConvexClientContext = createContext<ConvexReactClient | null>(null);

type ShellWebConvexAuthProviderProps = {
  client: ConvexReactClient;
  children: ReactNode;
};

/**
 * WebView shell: mirrors JWT from localStorage injected by native — no independent refresh.
 */
export function ShellWebConvexAuthProvider({ client, children }: ShellWebConvexAuthProviderProps) {
  return (
    <ShellConvexClientContext.Provider value={client}>
      <ConvexProviderWithAuth client={client} useAuth={useShellWebConvexAuth}>
        <NativeShellAuthListener />
        {children}
      </ConvexProviderWithAuth>
    </ShellConvexClientContext.Provider>
  );
}
