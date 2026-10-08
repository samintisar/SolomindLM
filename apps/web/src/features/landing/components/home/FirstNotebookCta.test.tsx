import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FirstNotebookCta } from "./FirstNotebookCta";

describe("FirstNotebookCta", () => {
  it("has one action, and it starts sign-up", async () => {
    const onGetStarted = vi.fn();
    render(<FirstNotebookCta onGetStarted={onGetStarted} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Create my first notebook/ }));
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it("uses the page's copy when given", () => {
    render(
      <FirstNotebookCta
        onGetStarted={vi.fn()}
        body="Custom promise."
        ctaLabel="Create free account"
      />
    );
    expect(screen.getByText("Custom promise.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create free account/ })).toBeInTheDocument();
  });
});
