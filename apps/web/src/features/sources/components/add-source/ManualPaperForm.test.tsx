import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualPaperForm } from "./ManualPaperForm";

const upload = vi.fn();
vi.mock("../../services/documentsApi", () => ({
  useResolveDoi: () => vi.fn(),
  useUpload: () => upload,
}));

const notebookId = "nb1" as Id<"notebooks">;

function setup() {
  const onDone = vi.fn();
  render(<ManualPaperForm notebookId={notebookId} onDone={onDone} onBusyChange={vi.fn()} />);
  return { onDone };
}

describe("ManualPaperForm", () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it("labels every field, and marks Title and Authors required", () => {
    setup();
    for (const name of ["Abstract", "DOI", "Venue", "Year", "PDF URL"]) {
      expect(screen.getByRole("textbox", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("textbox", { name: "Authors" })).toHaveAttribute(
      "aria-required",
      "true"
    );
  });

  it("disables Add Paper until Title and Authors are filled", async () => {
    setup();
    const submit = screen.getByRole("button", { name: "Add Paper" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "T");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Authors" }), "Ann Lee");
    expect(submit).toBeEnabled();
  });

  it("submits the paper record, then calls onDone", async () => {
    upload.mockResolvedValue({ documentId: "d1" });
    const { onDone } = setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "T");
    await userEvent.type(screen.getByRole("textbox", { name: "Authors" }), "Ann Lee, Bo Chen");
    await userEvent.type(screen.getByRole("textbox", { name: "Year" }), "20x");
    await userEvent.click(screen.getByRole("button", { name: "Add Paper" }));
    expect(upload).toHaveBeenCalledWith({
      notebookId,
      type: "paper_record",
      fileName: "T",
      paperRecord: {
        abstract: "",
        authors: ["Ann Lee", "Bo Chen"],
        doi: undefined,
        venue: undefined,
        publicationYear: 20,
        isOa: false,
        pdfUrl: undefined,
        sourceType: "manual",
      },
    });
    expect(onDone).toHaveBeenCalled();
  });
});
