import type { Id } from "@convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BibtexImportForm } from "./BibtexImportForm";

const parse = vi.fn();
const bulkUpload = vi.fn();
let existing: { dois: string[]; titleHashes: string[] } | undefined;
vi.mock("../../services/documentsApi", () => ({
  useParseBibliography: () => parse,
  useBulkUpload: () => bulkUpload,
  useGetExistingPapers: () => existing,
}));

const notebookId = "nb1" as Id<"notebooks">;
const result = {
  papers: [
    { title: "Alpha", authors: ["Ann Lee"], doi: "10.1/a", publicationYear: 2020 },
    { title: "Beta", authors: ["Bo Chen"] },
  ],
  stats: { total: 2, withDoi: 1, withoutDoi: 1, malformed: 0 },
  warnings: [],
};

function setup() {
  const onDone = vi.fn();
  const view = render(
    <BibtexImportForm notebookId={notebookId} onDone={onDone} onBusyChange={vi.fn()} />
  );
  return { onDone, container: view.container };
}

async function pasteAndParse(text: string) {
  await userEvent.click(screen.getByRole("tab", { name: "Paste text" }));
  await userEvent.click(screen.getByRole("textbox", { name: "Bibliography" }));
  await userEvent.paste(text);
  await userEvent.click(screen.getByRole("button", { name: "Parse bibliography" }));
}

describe("BibtexImportForm", () => {
  beforeEach(() => {
    parse.mockReset();
    bulkUpload.mockReset();
    existing = { dois: [], titleHashes: [] };
    parse.mockResolvedValue(result);
  });

  it("detects RIS in pasted text", async () => {
    setup();
    const text = "TY  - JOUR\nTI  - Alpha\nER  -";
    await pasteAndParse(text);
    expect(parse).toHaveBeenCalledWith({ content: text, format: "ris" });
  });

  it("parses BibTeX as auto and checks every paper", async () => {
    setup();
    const text = "@article{a, title={Alpha}}";
    await pasteAndParse(text);
    expect(parse).toHaveBeenCalledWith({ content: text, format: "auto" });
    expect(await screen.findByRole("checkbox", { name: "Include Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Beta" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Import 2 selected papers" })).toBeInTheDocument();
  });

  it("imports only the selected papers, then calls onDone", async () => {
    bulkUpload.mockResolvedValue({ documentIds: ["d1"] });
    const { onDone } = setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Include Beta" }));
    await userEvent.click(screen.getByRole("button", { name: "Import 1 selected paper" }));
    expect(bulkUpload).toHaveBeenCalledWith({
      notebookId,
      papers: [expect.objectContaining({ title: "Alpha", sourceType: "bibtex" })],
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("deselects everything and disables import", async () => {
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    await userEvent.click(await screen.findByRole("button", { name: "Deselect all" }));
    expect(screen.getByRole("checkbox", { name: "Include Alpha" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Beta" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Import 0 selected papers" })).toBeDisabled();
  });

  it("toggles a paper when its row is clicked", async () => {
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    const checkbox = await screen.findByRole("checkbox", { name: "Include Alpha" });
    expect(checkbox).toBeChecked();
    await userEvent.click(screen.getByText("Alpha"));
    expect(checkbox).not.toBeChecked();
    await userEvent.click(screen.getByText("Alpha"));
    expect(checkbox).toBeChecked();
  });

  it("flags papers without a DOI", async () => {
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(await screen.findByText("1 missing DOI")).toBeInTheDocument();
    expect(screen.getAllByText("No DOI")).toHaveLength(1);
  });

  it("shows a parse failure in an alert", async () => {
    parse.mockRejectedValue(new Error("Unreadable bibliography"));
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unreadable bibliography");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lists the parser warnings", async () => {
    parse.mockResolvedValue({ ...result, warnings: ["Entry 3 has no title"] });
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(await screen.findByText("Some entries had problems")).toBeInTheDocument();
    expect(screen.getByText("Entry 3 has no title")).toBeInTheDocument();
  });

  it("parses a chosen RIS file as ris", async () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["TY  - JOUR"], "x.ris"));
    await waitFor(() =>
      expect(parse).toHaveBeenCalledWith({ content: "TY  - JOUR", format: "ris" })
    );
  });

  it("ignores an earlier file whose read finishes after a newer file was chosen", async () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    let finishSlowRead: (text: string) => void = () => {};
    const slow = new File(["ignored"], "slow.bib");
    Object.defineProperty(slow, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finishSlowRead = resolve;
        }),
    });
    await userEvent.upload(input, slow);
    await userEvent.upload(input, new File(["@article{b}"], "fast.bib"));
    await waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    finishSlowRead("@article{a}");
    await screen.findByText("fast.bib");
    await new Promise((r) => setTimeout(r, 0));
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith({ content: "@article{b}", format: "auto" });
    expect(screen.queryByText("slow.bib")).not.toBeInTheDocument();
  });

  it("shows a DOI duplicate as already in the notebook and leaves it out of the import", async () => {
    existing = { dois: ["10.1/a"], titleHashes: [] };
    parse.mockResolvedValue({
      ...result,
      papers: [
        { title: "Alpha", authors: ["Ann Lee"], doi: "10.1/A" },
        { title: "Beta", authors: ["Bo Chen"] },
        { title: "Gamma", authors: ["Cy Diaz"], doi: "10.1/g" },
      ],
    });
    bulkUpload.mockResolvedValue({ documentIds: ["d1", "d2"] });
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    const duplicate = await screen.findByRole("checkbox", {
      name: "Alpha, already in notebook",
    });
    expect(duplicate).toBeDisabled();
    expect(duplicate).toBeChecked();
    expect(screen.getByText("In notebook")).toBeInTheDocument();
    expect(screen.getByText("1 already in notebook")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(duplicate).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Import 2 selected papers" }));
    expect(bulkUpload).toHaveBeenCalledWith({
      notebookId,
      papers: [
        expect.objectContaining({ title: "Beta" }),
        expect.objectContaining({ title: "Gamma" }),
      ],
    });
  });

  it("matches duplicates by title and first author surname", async () => {
    existing = { dois: [], titleHashes: ["beta|bo chen"] };
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(
      await screen.findByRole("checkbox", { name: "Beta, already in notebook" })
    ).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Include Alpha" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Import 1 selected paper" })).toBeEnabled();
  });

  it("holds the import back until the notebook check has loaded", async () => {
    existing = undefined;
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(await screen.findByText("Checking your notebook...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking your notebook...");
    expect(screen.getByRole("button", { name: "Import 2 selected papers" })).toBeDisabled();
    expect(screen.queryByText(/already in notebook/)).not.toBeInTheDocument();
  });

  it("explains when every paper is already in the notebook", async () => {
    existing = { dois: ["10.1/a"], titleHashes: ["beta|bo chen"] };
    setup();
    await pasteAndParse("@article{a, title={Alpha}}");
    expect(await screen.findByText("Nothing new to import")).toBeInTheDocument();
    expect(
      screen.getByText("All papers from this file are already in your notebook.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();
  });
});
