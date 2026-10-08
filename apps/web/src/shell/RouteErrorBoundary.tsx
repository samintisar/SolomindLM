import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";

interface RouteErrorBoundaryState {
  failed: boolean;
}

/**
 * Last-resort recovery for the route tree, chiefly a lazy page whose chunk can't load (offline,
 * or an asset removed by a deploy). Suspense only covers loading; a rejected import lands here.
 */
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground"
      >
        <p className="text-muted-foreground">This page couldn't load.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
