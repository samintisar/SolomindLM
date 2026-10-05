import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InfographicNote } from "@/shared/types/index";
import { InfographicView } from "./InfographicView";

function makeNote(overrides: Partial<InfographicNote> = {}): InfographicNote {
  return {
    id: "i1",
    title: "Water cycle",
    preview: "",
    type: "infographic",
    status: "completed",
    imageUrl: "https://example.test/water.png",
    metadata: { sourceDocumentIds: [] },
    ...overrides,
  };
}

describe("InfographicView", () => {
  it("shows a spinner, the status line and the current step while generating", () => {
    render(
      <InfographicView
        note={makeNote({
          status: "generating",
          imageUrl: undefined,
          metadata: { sourceDocumentIds: [], currentStep: "Drawing the layout" },
        })}
      />
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Generating your infographic…")).toBeInTheDocument();
    expect(screen.getByText("Drawing the layout")).toBeInTheDocument();
  });

  it("shows the unavailable state with the error when generation failed", () => {
    render(
      <InfographicView
        note={makeNote({
          status: "failed",
          imageUrl: undefined,
          metadata: { sourceDocumentIds: [], error: "Image model timed out" },
        })}
      />
    );

    expect(screen.getByText("Infographic unavailable")).toBeInTheDocument();
    expect(screen.getByText("Image model timed out")).toBeInTheDocument();
  });

  it("fades the image in from a blur once it has loaded", () => {
    render(<InfographicView note={makeNote()} />);

    const img = screen.getByRole("img", { name: "Water cycle" });
    expect(img).toHaveClass("opacity-0", "blur-md");
    expect(img).not.toHaveClass("opacity-100");
    // Only opacity may fade under reduced motion.
    expect(img).toHaveClass("motion-reduce:blur-none", "motion-reduce:scale-100");

    fireEvent.load(img);

    expect(img).toHaveClass("opacity-100", "blur-none", "scale-100");
    expect(img).not.toHaveClass("opacity-0");
  });

  it("shows a skeleton behind the image until it has loaded", () => {
    const { container } = render(<InfographicView note={makeNote()} />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    fireEvent.load(screen.getByRole("img", { name: "Water cycle" }));
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
  });

  it("falls back to the unavailable state when the image fails to load", () => {
    render(<InfographicView note={makeNote()} />);

    fireEvent.error(screen.getByRole("img", { name: "Water cycle" }));

    expect(screen.getByText("Infographic unavailable")).toBeInTheDocument();
    expect(screen.getByText("The image could not be loaded")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("registers download and fullscreen controls when completed, and clears them on failure", () => {
    const registerControls = vi.fn();
    const { rerender } = render(
      <InfographicView note={makeNote()} registerControls={registerControls} />
    );

    expect(registerControls).toHaveBeenLastCalledWith({
      download: expect.any(Function),
      toggleFullscreen: expect.any(Function),
    });

    rerender(
      <InfographicView
        note={makeNote({ status: "failed", imageUrl: undefined })}
        registerControls={registerControls}
      />
    );

    expect(registerControls).toHaveBeenLastCalledWith(null);
  });

  it("clears the controls when the image errors", () => {
    const registerControls = vi.fn();
    render(<InfographicView note={makeNote()} registerControls={registerControls} />);

    fireEvent.error(screen.getByRole("img", { name: "Water cycle" }));

    expect(registerControls).toHaveBeenLastCalledWith(null);
  });
});
