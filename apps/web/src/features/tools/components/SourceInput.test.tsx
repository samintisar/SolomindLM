import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceInput, type SourceState } from "./SourceInput";

const pdf = vi.hoisted(() => ({ extractPdfText: vi.fn() }));
vi.mock("../lib/extractPdfText", () => pdf);

type Extracted = { text: string; pagesRead: number; totalPages: number };

const words = (n: number, word = "cell") => Array.from({ length: n }, () => word).join(" ");

/** An extraction the test resolves by hand, to finish reads out of order. */
function deferredExtraction() {
  let resolve!: (value: Extracted) => void;
  const promise = new Promise<Extracted>((r) => {
    resolve = r;
  });
  return { promise, finish: (text: string) => resolve({ text, pagesRead: 1, totalPages: 1 }) };
}

function choosePdf(name: string) {
  const input = screen.getByLabelText("Choose a PDF");
  fireEvent.change(input, {
    target: { files: [new File(["%PDF"], name, { type: "application/pdf" })] },
  });
}

describe("SourceInput", () => {
  beforeEach(() => pdf.extractPdfText.mockReset());

  it("stops a file dropped outside the drop zone from opening in the tab", () => {
    render(<SourceInput onChange={() => {}} />);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"] } });
    document.body.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    const textDrop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(textDrop, "dataTransfer", { value: { types: ["text/plain"] } });
    document.body.dispatchEvent(textDrop);
    expect(textDrop.defaultPrevented).toBe(false);
  });

  it("ignores an older PDF that finishes after a newer one", async () => {
    const first = deferredExtraction();
    const second = deferredExtraction();
    pdf.extractPdfText.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onChange = vi.fn<(source: SourceState | null) => void>();
    render(<SourceInput onChange={onChange} />);

    choosePdf("old.pdf");
    choosePdf("new.pdf");
    await act(async () => second.finish(words(100, "new")));
    await act(async () => first.finish(words(100, "old")));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: "new.pdf" }));
    expect(screen.getByText("new.pdf")).toBeInTheDocument();
  });

  it("keeps the pasted source when a PDF finishes after switching tabs", async () => {
    const read = deferredExtraction();
    pdf.extractPdfText.mockReturnValueOnce(read.promise);
    const onChange = vi.fn<(source: SourceState | null) => void>();
    const user = userEvent.setup();
    render(<SourceInput onChange={onChange} />);

    choosePdf("slow.pdf");
    await user.click(screen.getByRole("tab", { name: "Paste notes" }));
    fireEvent.change(screen.getByLabelText("Notes to turn into flashcards"), {
      target: { value: words(100) },
    });
    await act(async () => read.finish(words(100, "pdf")));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Pasted notes" }));

    await user.click(screen.getByRole("tab", { name: "Upload PDF" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: "slow.pdf" }));
  });
});
