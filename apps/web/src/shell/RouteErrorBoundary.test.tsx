import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function FailedChunk(): never {
  throw new TypeError("Failed to fetch dynamically imported module");
}

describe("RouteErrorBoundary", () => {
  test("renders children when nothing fails", () => {
    render(
      <RouteErrorBoundary>
        <p>page</p>
      </RouteErrorBoundary>
    );
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  test("shows a reload prompt instead of a blank page when a route fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <RouteErrorBoundary>
        <FailedChunk />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't load.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    vi.mocked(console.error).mockRestore();
  });
});
