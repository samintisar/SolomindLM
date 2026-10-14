import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ShareNotebookModal } from "./ShareNotebookModal";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

const setPublic = vi.hoisted(() => vi.fn());
vi.mock("../../services/notebooksApi", () => ({
  useShareLinks: () => [],
  useCreateShareLink: () => vi.fn(),
  useRevokeShareLinkWithOptimisticUpdate: () => vi.fn(),
  useSetNotebookPublic: () => setPublic,
}));

describe("ShareNotebookModal: Make public", () => {
  beforeEach(() => {
    setPublic.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  test("the switch reflects the notebook's visibility", () => {
    render(<ShareNotebookModal notebookId="n1" isPublic onClose={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Make public" })).toBeChecked();
  });

  test("turning it on publishes the notebook", async () => {
    setPublic.mockResolvedValue({ isPublic: true });
    render(<ShareNotebookModal notebookId="n1" isPublic={false} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("switch", { name: "Make public" }));
    expect(setPublic).toHaveBeenCalledWith({ notebookId: "n1", isPublic: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Notebook is now public"));
  });

  test("a failure is reported", async () => {
    setPublic.mockRejectedValue(new Error("Nope"));
    render(<ShareNotebookModal notebookId="n1" isPublic onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("switch", { name: "Make public" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nope"));
  });
});
