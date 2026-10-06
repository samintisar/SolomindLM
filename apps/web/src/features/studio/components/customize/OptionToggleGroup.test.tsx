import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionToggleGroup } from "./OptionToggleGroup";
import { COUNT_OPTIONS } from "./options";

describe("OptionToggleGroup", () => {
  it("shows the options as a labelled single choice", () => {
    render(
      <OptionToggleGroup
        label="Number of questions"
        value="standard"
        options={COUNT_OPTIONS}
        onValueChange={vi.fn()}
      />
    );
    const group = screen.getByRole("radiogroup", { name: "Number of questions" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.textContent)
    ).toEqual(["Fewer", "Standard", "More"]);
    expect(within(group).getByRole("radio", { name: "Standard" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("reports a new choice", async () => {
    const onValueChange = vi.fn();
    render(
      <OptionToggleGroup
        label="Number of questions"
        value="standard"
        options={COUNT_OPTIONS}
        onValueChange={onValueChange}
      />
    );
    await userEvent.click(screen.getByRole("radio", { name: "More" }));
    expect(onValueChange).toHaveBeenCalledWith("more");
  });

  it("ignores a click on the chosen option, so something is always chosen", async () => {
    const onValueChange = vi.fn();
    render(
      <OptionToggleGroup
        label="Number of questions"
        value="standard"
        options={COUNT_OPTIONS}
        onValueChange={onValueChange}
      />
    );
    await userEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
