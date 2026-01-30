import type { ComponentType, ReactNode } from "react";

declare module "react-router-dom" {
  export const Navigate: ComponentType<{ to: string; replace?: boolean }>;
  export const BrowserRouter: ComponentType<{ children?: ReactNode }>;
  export const Routes: ComponentType<{ children?: ReactNode }>;
  export const Route: ComponentType<{
    path?: string;
    element?: ReactNode;
    index?: boolean;
    children?: ReactNode;
  }>;
  export const Link: ComponentType<
    { to: string; children?: ReactNode } & Record<string, unknown>
  >;

  export function useLocation(): {
    pathname: string;
    search: string;
    hash: string;
    state: unknown;
    key: string;
  };
  export function useNavigate(): (to: string | number, options?: { replace?: boolean }) => void;
}
