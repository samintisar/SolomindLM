import { createContext, useContext } from "react";

/** Week 1: authentication runs in the embedded web app (cookies). */
export type ShellAuthMode = "webview";

export const AuthContext = createContext<{ mode: ShellAuthMode }>({ mode: "webview" });

export function useShellAuth() {
  return useContext(AuthContext);
}
