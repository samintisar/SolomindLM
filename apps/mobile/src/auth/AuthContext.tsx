import { createContext, useContext, type ReactNode } from "react";

/** Week 1: authentication runs in the embedded web app (cookies). */
export type ShellAuthMode = "webview";

const AuthContext = createContext<{ mode: ShellAuthMode }>({ mode: "webview" });

export function ShellAuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={{ mode: "webview" }}>{children}</AuthContext.Provider>;
}

export function useShellAuth() {
  return useContext(AuthContext);
}
