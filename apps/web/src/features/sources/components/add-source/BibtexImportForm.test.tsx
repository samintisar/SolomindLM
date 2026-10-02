import type { Id } from "@convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BibtexImportForm } from "./BibtexImportForm";

const parse = vi.fn();
const bulkUpload = vi.fn();
vi.mock("../../services/documentsApi", () => ({
  useParseBibliography: () => parse,
  useBulkUpload: () => bulkUpload,
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

  it("parses a chosen RIS file as ris", async () => {
    const { container } = setup();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["TY  - JOUR"], "x.ris"));
    await waitFor(() =>
      expect(parse).toHaveBeenCalledWith({ content: "TY  - JOUR", format: "ris" })
    );
  });
});
