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
});
