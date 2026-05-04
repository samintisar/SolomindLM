import { type ReactNode } from "react";
import { AuthContext } from "./useShellAuth";

export function ShellAuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={{ mode: "webview" }}>{children}</AuthContext.Provider>;
}
