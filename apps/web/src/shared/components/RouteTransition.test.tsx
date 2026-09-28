import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { RouteTransition } from "./RouteTransition";

let navigate: ReturnType<typeof useNavigate>;

function CaptureNavigate() {
  navigate = useNavigate();
  return <span data-testid="page" />;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteTransition fill={false}>
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
});
