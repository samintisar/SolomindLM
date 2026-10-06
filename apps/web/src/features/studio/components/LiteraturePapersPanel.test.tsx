import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedPaper } from "../types/rankedPaper";
import { LiteraturePapersPanel } from "./LiteraturePapersPanel";

const api = vi.hoisted(() => ({
  data: undefined as unknown,
  exportBibtex: vi.fn(),
}));

vi.mock("../services/literatureTablesApi", () => ({
  useRankedPapersForSession: () => api.data,
}));
vi.mock("../../sources/services/documentsApi", () => ({
  useGetExistingPapers: () => ({ dois: [], titleHashes: [] }),
  useBulkUpload: () => vi.fn(),
}));
vi.mock("../utils/paperExport", () => ({
  exportPapersToBibtex: api.exportBibtex,
  exportPapersToCsv: vi.fn(),
  exportPapersToExcel: vi.fn(),
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const PAPER: RankedPaper = {
  title: "Attention Is All You Need",
  abstract: "We propose the Transformer.",
  authors: ["Ashish Vaswani"],
  year: 2017,
  url: "https://arxiv.org/abs/1706.03762",
  source: "arxiv",
  score: 0.92,
};

function panel() {
  return (
    <LiteraturePapersPanel sessionId={"s1" as never} notebookId={"n1" as never} onClose={vi.fn()} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.data = { query: "transformers", papers: [PAPER] };
});

describe("LiteraturePapersPanel", () => {
  it("shows a loading state, then the ranked papers", () => {
    api.data = undefined;
    const { rerender } = render(panel());
    expect(screen.getByText("Loading ranked papers…")).toBeInTheDocument();
    api.data = { query: "transformers", papers: [PAPER] };
    rerender(panel());
    expect(screen.getByRole("link", { name: PAPER.title })).toBeInTheDocument();
    expect(screen.getByText("Score 0.92")).toBeInTheDocument();
  });

  it("exports BibTeX from the Export menu", async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole("button", { name: "Export papers" }));
    await user.click(await screen.findByRole("menuitem", { name: "BibTeX (.bib)" }));
    expect(api.exportBibtex).toHaveBeenCalledWith([PAPER], "transformers.bib");
  });

  it("selecting a paper shows the bulk bar", async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole("checkbox", { name: `Select ${PAPER.title}` }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 to notebook" })).toBeInTheDocument();
  });

  it("shows the empty state when ranking found nothing", () => {
    api.data = { query: "x", papers: [] };
    render(panel());
    expect(screen.getByText("No ranked papers yet")).toBeInTheDocument();
  });
});
