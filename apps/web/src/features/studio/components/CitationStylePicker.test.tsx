import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CitationStylePicker } from "./CitationStylePicker";

describe("CitationStylePicker", () => {
  it("shows the current style and reports a new one", async () => {
    const onChange = vi.fn();
    render(<CitationStylePicker value="apa7" onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Select citation style" });
    expect(trigger).toHaveTextContent("APA 7th");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "MLA 9th" }));
    expect(onChange).toHaveBeenCalledWith("mla9");
  });

  it("can be disabled", () => {
    render(<CitationStylePicker value="ieee" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("combobox", { name: "Select citation style" })).toBeDisabled();
  });
});
