import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
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
  await userEvent.type(screen.getByRole("textbox", { name: "DOI or arXiv ID" }), "10.1/x{Enter}");
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

  it("drops the preview when the DOI is edited, so the old paper can't be added", async () => {
    resolveDoi.mockResolvedValue(resolved);
    setup();
    await resolvePreview();
    expect(await screen.findByRole("button", { name: "Add to notebook" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "DOI or arXiv ID" }), "9");
    expect(screen.queryByRole("button", { name: "Add to notebook" })).not.toBeInTheDocument();
    expect(screen.queryByText("Paper")).not.toBeInTheDocument();
  });

  it("shows an alert when the DOI cannot be resolved", async () => {
    resolveDoi.mockResolvedValue(null);
    setup();
    await resolvePreview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not resolve DOI. Please check the DOI and try again."
    );
  });

  it("shows the server's message when resolving fails with a typed error", async () => {
    resolveDoi.mockRejectedValue(
      new ConvexError({
        type: "EXTERNAL_SERVICE_ERROR",
        service: "crossref",
        retryable: true,
        detail: "Couldn't reach the DOI registry to look this paper up. Try again in a minute.",
      })
    );
    setup();
    await resolvePreview();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the DOI registry to look this paper up. Try again in a minute."
    );
  });

  it("does not show raw server errors", async () => {
    resolveDoi.mockRejectedValue(new Error("[CONVEX A(documents/index:resolveDoi)] Server Error"));
    setup();
    await resolvePreview();
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to resolve DOI. Try again.");
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
