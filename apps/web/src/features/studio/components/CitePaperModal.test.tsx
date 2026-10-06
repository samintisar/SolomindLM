import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedPaper } from "../types/rankedPaper";
import { CitePaperModal } from "./CitePaperModal";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

const PAPER: RankedPaper = {
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  abstract: "",
  url: "https://arxiv.org/abs/1706.03762",
  source: "arxiv",
  score: 1,
};

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("CitePaperModal", () => {
  it("shows the reference and the in-text citation in APA 7th by default", () => {
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Cite Paper" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Citation style" })).toHaveTextContent("APA 7th");
    expect(screen.getByText(/Attention Is All You Need/)).toBeInTheDocument();
    expect(screen.getByText("(Ashish & Noam, 2017)")).toBeInTheDocument();
  });

  it("numbers the in-text citation in a numbered style", async () => {
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Citation style" }));
    await userEvent.click(await screen.findByRole("option", { name: "IEEE" }));
    expect(screen.getByRole("combobox", { name: "Citation style" })).toHaveTextContent("IEEE");
    expect(screen.getByText("[1]")).toBeInTheDocument();
    expect(screen.queryByText("(Ashish & Noam, 2017)")).not.toBeInTheDocument();
  });

  it("copies the full citation", async () => {
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy Citation" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Attention Is All You Need"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Citation copied"));
  });

  it("says so when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy In-Text" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy to the clipboard"));
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
