import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import { DiscoverSourcesDialog } from "./DiscoverSourcesDialog";

const limits = { sourceLimit: 100, isLoading: false };
const discover = vi.fn();
const createDocument = vi.fn();
const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useUserLimits: () => limits,
}));
vi.mock("../../services/documentsApi", () => ({
  useUnifiedDiscovery: () => discover,
  useCreateDocument: () => createDocument,
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => toast,
}));
vi.mock("@/hooks/useSessionStorage", async () => {
  const { useState } = await import("react");
  return {
    useSessionStorage: <T,>(_key: string, init: T) => useState<T>(init),
  };
});

const web: UnifiedDiscoveryResult = {
  id: "w1",
  title: "Web page",
  url: "https://ex.com/a",
  snippet: "About things",
  score: 0.9,
  sourceType: "web",
  metadata: {},
};
const paper: UnifiedDiscoveryResult = {
  id: "p1",
  title: "A paper",
  url: "https://openalex.org/W1",
  snippet: "Abstract",
  score: 0.7,
  sourceType: "academic",
  metadata: {
    authors: ["Ann Lee"],
    publicationYear: 2020,
    doi: "10.1/p",
    openAlexId: "W1",
    openAccess: true,
  },
};

const response = (sources: UnifiedDiscoveryResult[], warnings: string[] = []) => ({
  sources,
  totalCount: sources.length,
  sourceTypeCounts: {},
  warnings,
});

function notebookSource(i: number, over: Partial<Source> = {}): Source {
  return {
    id: `s${i}`,
    title: `Source ${i}`,
    type: "WEB",
    date: "Oct 3",
    selected: true,
    url: `https://notebook.example/${i}`,
    ...over,
  } as Source;
}

type Props = React.ComponentProps<typeof DiscoverSourcesDialog>;

function renderDialog(over: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onOpenChange: vi.fn(),
    onAddSource: vi.fn(),
    notebookSources: [],
    userId: "u1",
    noteId: "nb1",
    onDocumentUploaded: vi.fn(),
    onAddSourcesClick: vi.fn(),
    ...over,
  };
  const utils = render(<DiscoverSourcesDialog {...props} />);
  return { props, ...utils };
}

const searchBox = () => screen.getByRole("textbox", { name: "Search sources" });

async function search(text = "transformers") {
  await userEvent.type(searchBox(), `${text}{Enter}`);
  await screen.findByText(/^\d+ results?$/);
}

const checkbox = (title: string) => screen.getByRole("checkbox", { name: `Include ${title}` });

describe("DiscoverSourcesDialog", () => {
  beforeEach(() => {
    limits.sourceLimit = 100;
    limits.isLoading = false;
    discover.mockReset().mockResolvedValue(response([web, paper]));
    createDocument.mockReset().mockResolvedValue({ documentId: "doc1" });
    toast.error.mockReset();
    toast.success.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens as a named dialog on the empty state", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Discover sources" })).toBeInTheDocument();
    expect(screen.getByText("Find sources to add")).toBeInTheDocument();
  });

  it("searches with the default filters and lists unchecked results", async () => {
    renderDialog();
    await search();
    expect(discover).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "transformers",
        sourceTypes: ["web"],
        maxResults: 20,
        sortBy: "relevance",
      })
    );
    expect(checkbox("Web page")).not.toBeChecked();
    expect(checkbox("A paper")).not.toBeChecked();
    expect(screen.getByText("2 results")).toBeInTheDocument();
  });

  it("toggles a row from its title, but not from its open link", async () => {
    renderDialog();
    await search();
    await userEvent.click(screen.getByText("Web page"));
    expect(checkbox("Web page")).toBeChecked();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();

    // fireEvent, not userEvent: user-event emulates label activation for any non-control target,
    // while browsers (and jsdom) skip it when the click lands on interactive content like a link.
    fireEvent.click(screen.getByRole("link", { name: "Open Web page in new tab" }));
    expect(checkbox("Web page")).toBeChecked();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
  });

  it("selects all and clears", async () => {
    renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(checkbox("Web page")).toBeChecked();
    expect(checkbox("A paper")).toBeChecked();
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();
  });

  it("skips results already in the notebook when selecting all", async () => {
    renderDialog({ notebookSources: [notebookSource(1, { url: "https://ex.com/a" })] });
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(checkbox("A paper")).toBeChecked();
    expect(checkbox("Web page")).toBeDisabled();
    expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
  });

  it("selects only what fits and notes the overflow", async () => {
    limits.sourceLimit = 1;
    renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    expect(screen.queryByText(/fits? in this notebook/)).not.toBeInTheDocument();

    const unchecked = [checkbox("Web page"), checkbox("A paper")].find(
      (box) => box.getAttribute("aria-checked") === "false"
    );
    await userEvent.click(unchecked as HTMLElement);
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    expect(screen.getByText("Only 1 more source fits in this notebook.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 source" })).toBeEnabled();
  });

  it("adds a paper from its row", async () => {
    const { props } = renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Add A paper" }));
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        notebookId: "nb1",
        type: "paper_record",
        fileName: "A paper",
        paperRecord: expect.objectContaining({ doi: "10.1/p", isOa: true }),
      })
    );
    expect(props.onAddSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc1", type: "PAPER", title: "A paper" })
    );
    expect(props.onDocumentUploaded).toHaveBeenCalledWith("doc1");
  });

  it("adds the selection, toasts once and clears it", async () => {
    renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 2 sources" }));
    expect(createDocument).toHaveBeenCalledTimes(2);
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ type: "url", source: "https://ex.com/a" })
    );
    expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "paper_record" }));
    expect(toast.success).toHaveBeenCalledWith("Added 2 sources");
    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();
  });

  it("keeps failed adds selected", async () => {
    createDocument.mockImplementation(async (data: { type: string }) => {
      if (data.type === "url") throw new Error("Boom");
      return { documentId: "doc1" };
    });
    renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 2 sources" }));
    expect(toast.error).toHaveBeenCalledWith("Boom");
    expect(toast.success).toHaveBeenCalledWith("Added 1 source");
    expect(checkbox("Web page")).toBeChecked();
    expect(checkbox("A paper")).not.toBeChecked();
  });

  it("disables every add at the source limit", async () => {
    renderDialog({ notebookSources: Array.from({ length: 100 }, (_, i) => notebookSource(i)) });
    await search();
    const limited = screen.getAllByRole("button", { name: "Limit reached" });
    expect(limited).toHaveLength(2);
    for (const button of limited) expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Add \d+ sources?$/ })).toBeDisabled();
  });

  it("ignores a stale search response", async () => {
    let resolveFirst: (value: ReturnType<typeof response>) => void = () => undefined;
    discover
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(response([paper]));
    renderDialog();
    await userEvent.type(searchBox(), "first{Enter}");
    expect(discover).toHaveBeenCalledTimes(1);
    await userEvent.clear(searchBox());
    await userEvent.type(searchBox(), "second");
    fireEvent.submit(screen.getByRole("search"));
    await screen.findByText("1 result");
    await act(async () => resolveFirst(response([web])));
    expect(screen.getByRole("checkbox", { name: "Include A paper" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Include Web page" })).not.toBeInTheDocument();
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("shows the empty result state with the first warning", async () => {
    discover.mockResolvedValue({ sources: [], warnings: ["Rate limited, try later"] });
    renderDialog();
    await userEvent.type(searchBox(), "transformers{Enter}");
    expect(await screen.findByText("No sources found")).toBeInTheDocument();
    expect(screen.getByText("Rate limited, try later")).toBeInTheDocument();
  });

  it("shows a search failure as an alert", async () => {
    discover.mockRejectedValue(new Error("Search exploded"));
    renderDialog();
    await userEvent.type(searchBox(), "transformers{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search exploded");
  });

  it("never searches with no source types", async () => {
    renderDialog();
    const types = screen.getByRole("toolbar", { name: "Source types" });
    await userEvent.click(within(types).getByRole("button", { name: "Web" }));
    await search();
    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ sourceTypes: ["web"] }));
  });

  it("blocks closing while an add is in flight", async () => {
    createDocument.mockReturnValue(new Promise(() => undefined));
    const { props } = renderDialog();
    await search();
    await userEvent.click(screen.getByRole("button", { name: "Add A paper" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog", { name: "Discover sources" })).toBeInTheDocument();
  });

  it("closes before handing off to Add sources", async () => {
    const { props } = renderDialog();
    const onOpenChange = vi.mocked(props.onOpenChange);
    const onAddSourcesClick = vi.mocked(props.onAddSourcesClick as () => void);
    await userEvent.click(screen.getByRole("button", { name: "Add sources" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddSourcesClick).toHaveBeenCalled();
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      onAddSourcesClick.mock.invocationCallOrder[0]
    );
  });
});
