import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/shared/utils/cn";

interface RouteTransitionProps {
  children: ReactNode;
  /** Apply the app-shell flex layout (non-public pages live in a flex column). */
  fill: boolean;
}

/**
 * Fades pages in when the top-level section changes. Keyed by the first path segment, so
 * /notebook/a → /notebook/b keeps the tree mounted (no lost chat/stream state), while
 * /home → /notebook/a gets a transition. Opacity only (a dedicated keyframe — tw-animate-css's
 * `enter` also animates transform): a transform here would make this div the
 * containing block for fixed-position modals during the animation.
 */
export function RouteTransition({ children, fill }: RouteTransitionProps) {
  const { pathname } = useLocation();
  const section = pathname.split("/")[1] ?? "";

  return (
    <div key={section} className={cn("animate-route-in", fill && "flex min-h-0 flex-1 flex-col")}>
      {children}
    </div>
  );
}
