import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Tabs } from "@/shared/components/ui/tabs";
import { HomeHeader } from "./HomeHeader";

function setup() {
  const props = {
    onTabChange: vi.fn(),
    viewMode: "grid" as const,
    onViewModeChange: vi.fn(),
    sortOption: "date" as const,
    onSortChange: vi.fn(),
    onCreateNotebook: vi.fn(),
    onCreateFolder: vi.fn(),
  };
  const { onTabChange, ...headerProps } = props;
  render(
    <Tabs value="all" onValueChange={onTabChange}>
      <HomeHeader {...headerProps} />
    </Tabs>
  );
  return props;
}

describe("HomeHeader", () => {
  test("New notebook creates a notebook and is the onboarding target", async () => {
    const props = setup();
    const button = screen.getByRole("button", { name: "New notebook" });
    expect(button).toHaveAttribute("data-onboarding", "create-notebook-button");
    await userEvent.click(button);
    expect(props.onCreateNotebook).toHaveBeenCalledOnce();
  });

  test("New folder lives in the create menu", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "More create options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "New folder" }));
    expect(props.onCreateFolder).toHaveBeenCalledOnce();
  });

  test("tabs and view toggle report changes", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("tab", { name: "My notebooks" }));
    expect(props.onTabChange).toHaveBeenCalledWith("mine");
    await userEvent.click(screen.getByRole("radio", { name: "List view" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("list");
  });

  test("sort select reports the chosen option", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("combobox", { name: "Sort notebooks" }));
    await userEvent.click(await screen.findByRole("option", { name: "Title (A–Z)" }));
    expect(props.onSortChange).toHaveBeenCalledWith("title");
  });
});
