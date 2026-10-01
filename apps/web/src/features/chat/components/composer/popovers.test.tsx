import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { FiltersPopover } from "./FiltersPopover";
import { ResearchDatabaseMenu } from "./ResearchDatabaseMenu";

describe("ResearchDatabaseMenu", () => {
  test("the trigger names the current database", () => {
    render(<ResearchDatabaseMenu value="arxiv" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Research databases: ArXiv" })).toBeInTheDocument();
  });

  test("selects PubMed and closes the popover", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    await userEvent.click(await screen.findByRole("radio", { name: /PubMed/ }));
    expect(onChange).toHaveBeenCalledWith("pubmed");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("checks the current database and exposes its description", async () => {
    render(<ResearchDatabaseMenu value="pubmed" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    const radio = await screen.findByRole("radio", { name: "PubMed" });
    expect(radio).toBeChecked();
    expect(radio).toHaveAccessibleDescription("39M+ biomedical and life-science literature");
    expect(screen.getByRole("radio", { name: "All Papers" })).not.toBeChecked();
  });

  test("a disabled trigger cannot be opened", async () => {
    render(<ResearchDatabaseMenu value="all" onChange={vi.fn()} disabled />);
    const trigger = screen.getByRole("button", { name: /^Research databases/ });
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("FiltersPopover", () => {
  test("toggles a channel but never removes the last one", async () => {
    const onSourceFilterChange = vi.fn();
    const { rerender } = render(
      <FiltersPopover
        mode="chat"
        sourceFilters={["notebook", "web"]}
        onSourceFilterChange={onSourceFilterChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Web" }));
    expect(onSourceFilterChange).toHaveBeenLastCalledWith(["notebook"]);

    onSourceFilterChange.mockClear();
    rerender(
      <FiltersPopover
        mode="chat"
        sourceFilters={["notebook"]}
        onSourceFilterChange={onSourceFilterChange}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Notebook sources" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Web" })).toBeEnabled();
  });

  test("turning a channel on adds it", async () => {
    const onSourceFilterChange = vi.fn();
    render(
      <FiltersPopover
        mode="chat"
        sourceFilters={["notebook"]}
        onSourceFilterChange={onSourceFilterChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "News" }));
    expect(onSourceFilterChange).toHaveBeenCalledWith(["notebook", "news"]);
  });

  test("the academic section shows only while the Academic channel is on", async () => {
    const props = {
      mode: "deepResearch" as const,
      onSourceFilterChange: vi.fn(),
      onAcademicDiscoveryFiltersChange: vi.fn(),
    };
    const { rerender } = render(<FiltersPopover {...props} sourceFilters={["notebook"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByRole("checkbox", { name: "Academic" });
    expect(screen.queryByText("Academic papers")).not.toBeInTheDocument();

    rerender(<FiltersPopover {...props} sourceFilters={["notebook", "academic"]} />);
    expect(await screen.findByText("Academic papers")).toBeInTheDocument();
  });

  test("literature mode shows the academic filters and no channel checkboxes", async () => {
    render(
      <FiltersPopover
        mode="literatureReview"
        sourceFilters={["notebook"]}
        onAcademicDiscoveryFiltersChange={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByText("Academic papers")).toBeInTheDocument();
    expect(screen.queryByText("Source channels")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Web" })).not.toBeInTheDocument();
  });

  test("flags active academic filters on the trigger", () => {
    const { rerender } = render(
      <FiltersPopover
        mode="literatureReview"
        sourceFilters={["notebook"]}
        onAcademicDiscoveryFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();

    rerender(
      <FiltersPopover
        mode="literatureReview"
        sourceFilters={["notebook"]}
        academicDiscoveryFilters={{ openAccessOnly: true }}
        onAcademicDiscoveryFiltersChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Filters (active)" })).toBeInTheDocument();
  });

  test("academic filters count as active in chat only while the Academic channel is on", () => {
    const props = {
      mode: "chat" as const,
      academicDiscoveryFilters: { openAccessOnly: true },
      onSourceFilterChange: vi.fn(),
      onAcademicDiscoveryFiltersChange: vi.fn(),
    };
    const { rerender } = render(<FiltersPopover {...props} sourceFilters={["notebook"]} />);
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();

    rerender(<FiltersPopover {...props} sourceFilters={["notebook", "academic"]} />);
    expect(screen.getByRole("button", { name: "Filters (active)" })).toBeInTheDocument();
  });
});
