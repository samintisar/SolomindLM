import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { type ReactNode, useState } from "react";
import { ShellWebConvexAuthProvider } from "@/features/auth/components/ShellWebConvexAuthProvider";

type ShellAwareConvexAuthProviderProps = {
  client: ConvexReactClient;
  children: ReactNode;
};

function readNativeShellFlag(): boolean {
  return typeof window !== "undefined" && !!window.__IS_NATIVE_SHELL__;
}

/**
 * Browser: full ConvexAuthProvider. WebView shell: JWT mirror only (native owns refresh).
 */
export function ShellAwareConvexAuthProvider({
  client,
  children,
}: ShellAwareConvexAuthProviderProps) {
  const [isShell] = useState(readNativeShellFlag);

  if (isShell) {
    return <ShellWebConvexAuthProvider client={client}>{children}</ShellWebConvexAuthProvider>;
  }

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
