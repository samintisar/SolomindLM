import { type ReactNode, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { cn } from "@/shared/utils/cn";

interface RouteTransitionProps {
  children: ReactNode;
  /** Apply the app-shell flex layout (non-public pages live in a flex column). */
  fill: boolean;
  /**
   * Fade the first section too. Set when this instance mounts because of a navigation (the root
   * swapping the public and app shells), so the swap fades like any other section change.
   */
  animateOnMount?: boolean;
}

/**
 * Fades pages in when the top-level section changes. Keyed by the first path segment, so
 * /notebook/a → /notebook/b keeps the tree mounted (no lost chat/stream state), while
 * /home → /notebook/a gets a transition. Opacity only (a dedicated keyframe — tw-animate-css's
 * `enter` also animates transform): a transform here would make this div the
 * containing block for fixed-position modals during the animation. Skipped on the initial page
 * load and on redirects (REPLACE navigations, e.g. <Navigate replace> to /sign-in), so first
 * paint is never faded from blank.
 */
export function RouteTransition({ children, fill, animateOnMount = false }: RouteTransitionProps) {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const section = pathname.split("/")[1] ?? "";

  // Decided once per section change. Re-renders within a section (auth/data loading) must not
  // add the class to the already-visible div.
  const currentSection = useRef(section);
  const animate = useRef(animateOnMount && navigationType !== "REPLACE");
  if (section !== currentSection.current) {
    currentSection.current = section;
    animate.current = navigationType !== "REPLACE";
  }

  return (
    <div
      key={section}
      className={cn(animate.current && "animate-route-in", fill && "flex min-h-0 flex-1 flex-col")}
    >
      {children}
    </div>
  );
}
