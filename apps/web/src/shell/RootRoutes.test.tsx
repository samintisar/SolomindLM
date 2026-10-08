import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { loadAppShell } from "./loadAppShell";
import { RootRoutes } from "./RootRoutes";

vi.mock("./useRootRedirects", () => ({ useRootRedirects: () => {} }));
vi.mock("./isPublicPath", () => ({
  isPublicPath: (path: string) => path === "/" || path === "/faq",
}));
vi.mock("./PublicShell", () => ({
  PublicShell: ({ animateOnMount }: { animateOnMount: boolean }) => (
    <div data-testid="public-shell" data-animate={String(animateOnMount)} />
  ),
}));
vi.mock("./loadAppShell", () => ({
  loadAppShell: vi.fn(async () => ({
    default: ({ animateOnMount }: { animateOnMount: boolean }) => (
      <div data-testid="app-shell" data-animate={String(animateOnMount)} />
    ),
  })),
}));

let navigate: ReturnType<typeof useNavigate>;

function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CaptureNavigate />
      <RootRoutes />
    </MemoryRouter>
  );
}

describe("RootRoutes", () => {
  beforeEach(() => {
    vi.mocked(loadAppShell).mockClear();
  });

  test("renders public paths in the public shell without loading the app shell", () => {
    renderAt("/faq");
    expect(screen.getByTestId("public-shell")).toHaveAttribute("data-animate", "false");
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(loadAppShell).not.toHaveBeenCalled();
  });

  test("loads the app shell for app paths, unfaded on first load", async () => {
    renderAt("/home");
    expect(await screen.findByTestId("app-shell")).toHaveAttribute("data-animate", "false");
  });

  test("fades the app shell in when the visitor crosses over from a public page", async () => {
    renderAt("/");
    act(() => navigate("/home"));
    expect(await screen.findByTestId("app-shell")).toHaveAttribute("data-animate", "true");
  });

  test("fades the public shell in when the visitor crosses back", async () => {
    renderAt("/home");
    await screen.findByTestId("app-shell");
    act(() => navigate("/faq"));
    expect(screen.getByTestId("public-shell")).toHaveAttribute("data-animate", "true");
  });

  test("keeps the public shell unfaded while moving between public pages", () => {
    renderAt("/");
    act(() => navigate("/faq"));
    expect(screen.getByTestId("public-shell")).toHaveAttribute("data-animate", "false");
  });
});
