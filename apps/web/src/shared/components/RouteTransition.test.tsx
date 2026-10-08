import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { RouteTransition } from "./RouteTransition";

let navigate: ReturnType<typeof useNavigate>;

function CaptureNavigate() {
  navigate = useNavigate();
  return <span data-testid="page" />;
}

function renderAt(path: string, animateOnMount?: boolean) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteTransition fill={false} animateOnMount={animateOnMount}>
        <CaptureNavigate />
      </RouteTransition>
    </MemoryRouter>
  );
}

const wrapper = () => screen.getByTestId("page").parentElement as HTMLElement;

describe("RouteTransition", () => {
  test("does not fade the initial page", () => {
    renderAt("/home");
    expect(wrapper()).not.toHaveClass("animate-route-in");
  });

  test("fades when a push navigation changes the section", () => {
    renderAt("/home");
    act(() => navigate("/notebook/a"));
    expect(wrapper()).toHaveClass("animate-route-in");
  });

  test("does not fade on a redirect (replace navigation)", () => {
    renderAt("/notebook/a");
    act(() => navigate("/sign-in", { replace: true }));
    expect(wrapper()).not.toHaveClass("animate-route-in");
  });

  test("keeps the tree mounted within a section", () => {
    renderAt("/home");
    act(() => navigate("/notebook/a"));
    const before = wrapper();
    act(() => navigate("/notebook/b"));
    expect(wrapper()).toBe(before);
  });

  test("fades on mount when asked to (a shell swapped in after navigation)", () => {
    renderAt("/home", true);
    expect(wrapper()).toHaveClass("animate-route-in");
  });

  test("does not fade on mount after a redirect, even when asked to", () => {
    render(
      <MemoryRouter initialEntries={["/", "/home"]} initialIndex={1}>
        <ReplaceThenMount />
      </MemoryRouter>
    );
    act(() => navigate("/sign-in", { replace: true }));
    expect(wrapper()).not.toHaveClass("animate-route-in");
  });
});

/** Mounts a fresh RouteTransition per pathname, like the root switching between shells. */
function ReplaceThenMount() {
  const { pathname } = useLocation();
  return (
    <RouteTransition key={pathname} fill={false} animateOnMount={pathname !== "/home"}>
      <CaptureNavigate />
    </RouteTransition>
  );
}
