import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoiForm } from "./DoiForm";

const resolveDoi = vi.fn();
const upload = vi.fn();
vi.mock("../../services/documentsApi", () => ({
  useResolveDoi: () => resolveDoi,
  useUpload: () => upload,
}));

const notebookId = "nb1" as Id<"notebooks">;
const resolved = {
  title: "Paper",
  authors: ["Ann Lee"],
  publicationYear: 2020,
  venue: "Nature",
};

function setup() {
  const onDone = vi.fn();
  render(<DoiForm notebookId={notebookId} onDone={onDone} onBusyChange={vi.fn()} />);
  return { onDone };
}

async function resolvePreview() {
  await userEvent.type(screen.getByRole("textbox", { name: "DOI" }), "10.1/x{Enter}");
}

describe("DoiForm", () => {
  beforeEach(() => {
    resolveDoi.mockReset();
    upload.mockReset();
  });

  it("resolves on Enter and shows a preview", async () => {
    resolveDoi.mockResolvedValue(resolved);
    setup();
    await resolvePreview();
    expect(resolveDoi).toHaveBeenCalledWith({ doi: "10.1/x" });
    expect(await screen.findByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("Ann Lee")).toBeInTheDocument();
  });

  it("shows an alert when the DOI cannot be resolved", async () => {
    resolveDoi.mockResolvedValue(null);
    setup();
    await resolvePreview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not resolve DOI. Please check the DOI and try again."
    );
  });

  it("adds the previewed paper, then calls onDone", async () => {
    resolveDoi.mockResolvedValue(resolved);
    upload.mockResolvedValue({ documentId: "d1" });
    const { onDone } = setup();
    await resolvePreview();
    await userEvent.click(await screen.findByRole("button", { name: "Add to notebook" }));
    expect(upload).toHaveBeenCalledWith({
      notebookId,
      type: "paper_record",
      fileName: "Paper",
      paperRecord: expect.objectContaining({
        authors: ["Ann Lee"],
        publicationYear: 2020,
        venue: "Nature",
      }),
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the error and stays open when the upload rejects", async () => {
    resolveDoi.mockResolvedValue(resolved);
    upload.mockRejectedValue(new Error("nope"));
    const { onDone } = setup();
    await resolvePreview();
    await userEvent.click(await screen.findByRole("button", { name: "Add to notebook" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
    expect(onDone).not.toHaveBeenCalled();
  });
});
