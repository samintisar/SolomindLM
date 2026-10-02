import type { Id } from "@convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryImportForm } from "./LibraryImportForm";

const parse = vi.fn();
const bulkUpload = vi.fn();
let existing: { dois: string[]; titleHashes: string[] } | undefined;
vi.mock("../../services/documentsApi", () => ({
  useParseBibliography: () => parse,
  useBulkUpload: () => bulkUpload,
  useGetExistingPapers: () => existing,
}));

const notebookId = "nb1" as Id<"notebooks">;
const parsed = {
  papers: [
    { title: "Alpha", authors: ["Ann Lee"], doi: "10.1/A", publicationYear: 2020 },
    { title: "Beta", authors: ["Bo Chen"] },
  ],
  stats: { total: 2, withDoi: 1, withoutDoi: 1, malformed: 0 },
  warnings: [],
};

function setup(source: "zotero" | "mendeley" = "zotero") {
  const onDone = vi.fn();
  const view = render(
    <LibraryImportForm
      notebookId={notebookId}
      source={source}
      onDone={onDone}
      onBusyChange={vi.fn()}
    />
  );
  return { onDone, container: view.container };
}

async function chooseFile(container: HTMLElement, content = "@article{a}") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File([content], "library.bib"));
}

describe("LibraryImportForm", () => {
  beforeEach(() => {
    parse.mockReset();
    bulkUpload.mockReset();
    existing = { dois: ["10.1/a"], titleHashes: [] };
    parse.mockResolvedValue(parsed);
  });

  it("skips papers already in the notebook and imports the rest as zotero", async () => {
    bulkUpload.mockResolvedValue({ documentIds: ["d1"] });
    const { onDone, container } = setup("zotero");
    await chooseFile(container, "@article{a}");
    expect(parse).toHaveBeenCalledWith({ content: "@article{a}", format: "auto" });
    expect(await screen.findByText("1 already in notebook")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 1 paper" }));
    expect(bulkUpload).toHaveBeenCalledWith({
      notebookId,
      papers: [expect.objectContaining({ title: "Beta", sourceType: "zotero" })],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("uses mendeley copy and source type", async () => {
    existing = undefined;
    bulkUpload.mockResolvedValue({ documentIds: [] });
    const { container } = setup("mendeley");
    expect(
      screen.getByText("Export your Mendeley library as BibTeX (.bib), then choose the file.")
    ).toBeInTheDocument();
    await chooseFile(container);
    await userEvent.click(await screen.findByRole("button", { name: "Import 2 papers" }));
    expect(bulkUpload).toHaveBeenCalledWith({
      notebookId,
      papers: [
        expect.objectContaining({ title: "Alpha", sourceType: "mendeley" }),
        expect.objectContaining({ title: "Beta", sourceType: "mendeley" }),
      ],
    });
  });

  it("explains when every paper is already in the notebook", async () => {
    existing = { dois: ["10.1/a"], titleHashes: ["beta|bo chen"] };
    const { container } = setup();
    await chooseFile(container);
    expect(
      await screen.findByText("All papers from this file are already in your notebook.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("shows an alert when parsing fails", async () => {
    parse.mockRejectedValue(new Error("bad file"));
    const { container } = setup();
    await chooseFile(container);
    expect(await screen.findByRole("alert")).toHaveTextContent("bad file");
  });
});
