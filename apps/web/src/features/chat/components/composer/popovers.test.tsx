import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { FiltersPopover } from "./FiltersPopover";
import { PaperScopeMenu } from "./PaperScopeMenu";
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
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  test("clicking the row text selects and closes", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    await userEvent.click(await screen.findByText("Explore research preprints from arXiv"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("arxiv");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  test("arrow keys change the value but keep the popover open", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    const first = await screen.findByRole("radio", { name: "All Papers" });
    first.focus();
    // Hold the key: Radix selects on focus only while an arrow key is down.
    await userEvent.keyboard("{ArrowDown>}");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("pubmed"));
    await userEvent.keyboard("{/ArrowDown}");
    expect(screen.getByRole("radio", { name: "PubMed" })).toBeInTheDocument();
  });

  test("a lost arrow keyup doesn't stop a later click from closing", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    const first = await screen.findByRole("radio", { name: "All Papers" });
    // Arrow keydown with no keyup (e.g. the window lost focus while the key was held).
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await userEvent.click(screen.getByRole("radio", { name: "ArXiv" }));
    expect(onChange).toHaveBeenLastCalledWith("arxiv");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  test("Enter on a radio chooses it and closes", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    const radio = await screen.findByRole("radio", { name: "ArXiv" });
    radio.focus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("arxiv");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  test("Space on a radio chooses it and closes", async () => {
    const onChange = vi.fn();
    render(<ResearchDatabaseMenu value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Research databases/ }));
    const radio = await screen.findByRole("radio", { name: "PubMed" });
    radio.focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith("pubmed");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });

  test("Escape closes and focus returns to the trigger", async () => {
    render(<ResearchDatabaseMenu value="all" onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /^Research databases/ });
    await userEvent.click(trigger);
    await screen.findByRole("radio", { name: "PubMed" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
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

  test("explains why the last channel is locked", async () => {
    render(
      <FiltersPopover mode="chat" sourceFilters={["notebook"]} onSourceFilterChange={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const locked = await screen.findByRole("checkbox", { name: "Notebook sources" });
    expect(locked).toHaveAccessibleDescription("At least one source is required");
    expect(screen.getByRole("checkbox", { name: "Web" })).not.toHaveAccessibleDescription();
  });

  test("shows no lock hint while several channels are on", async () => {
    render(
      <FiltersPopover
        mode="chat"
        sourceFilters={["notebook", "web"]}
        onSourceFilterChange={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByRole("checkbox", { name: "Web" });
    expect(screen.queryByText("At least one source is required")).not.toBeInTheDocument();
  });

  test("clicking a row's label text toggles exactly once", async () => {
    const onSourceFilterChange = vi.fn();
    render(
      <FiltersPopover
        mode="chat"
        sourceFilters={["notebook"]}
        onSourceFilterChange={onSourceFilterChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(await screen.findByText("Finance"));
    expect(onSourceFilterChange).toHaveBeenCalledTimes(1);
    expect(onSourceFilterChange).toHaveBeenCalledWith(["notebook", "finance"]);
  });

  test("without a change handler every checkbox is disabled", async () => {
    render(<FiltersPopover mode="chat" sourceFilters={["notebook", "web"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box).toBeDisabled();
  });

  test("Escape closes and focus returns to the trigger", async () => {
    render(
      <FiltersPopover mode="chat" sourceFilters={["notebook"]} onSourceFilterChange={vi.fn()} />
    );
    const trigger = screen.getByRole("button", { name: "Filters" });
    await userEvent.click(trigger);
    await screen.findByRole("checkbox", { name: "Web" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  test("literature mode without a filter handler renders nothing", () => {
    const { container } = render(<FiltersPopover mode="literatureReview" sourceFilters={[]} />);
    expect(container).toBeEmptyDOMElement();
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
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger).toHaveAccessibleDescription("academic filters applied");
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
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAccessibleDescription(
      "academic filters applied"
    );
  });

  test("the tooltip mentions applied academic filters", async () => {
    render(
      <FiltersPopover
        mode="literatureReview"
        sourceFilters={["notebook"]}
        academicDiscoveryFilters={{ openAccessOnly: true }}
        onAcademicDiscoveryFiltersChange={vi.fn()}
      />
    );
    await userEvent.hover(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findAllByText("Filters · academic filters applied")).not.toHaveLength(0);
  });
});

describe("PaperScopeMenu", () => {
  test("the trigger says how many of the user's papers are used", () => {
    render(<PaperScopeMenu value="papers_and_search" paperCount={4} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Paper scope: Your 4 papers + search" })
    ).toBeInTheDocument();
  });

  test("chooses only the user's papers and closes", async () => {
    const onChange = vi.fn();
    render(<PaperScopeMenu value="papers_and_search" paperCount={2} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Paper scope/ }));
    const radio = await screen.findByRole("radio", { name: "Only your 2 papers" });
    expect(radio).toHaveAccessibleDescription("Review just these papers, with no database search");
    await userEvent.click(radio);
    expect(onChange).toHaveBeenCalledWith("papers_only");
    await waitFor(() => expect(screen.queryByRole("radio")).not.toBeInTheDocument());
  });
});
