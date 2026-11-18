// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateNotebook = vi.fn();
const mockCreateFolder = vi.fn();
const mockUpdateNotebook = vi.fn();
const mockUpdateFolder = vi.fn();
const mockOnRequireAuth = vi.fn();
const mockHandleLimitError = vi.fn();

vi.mock("../services/notebooksApi", () => ({
  useCreateNotebook: () => mockCreateNotebook,
}));

vi.mock("../services/foldersApi", () => ({
  useCreateFolder: () => mockCreateFolder,
}));

vi.mock("../useNotebookContext", () => ({
  useNotebookContext: () => ({
    updateNotebook: mockUpdateNotebook,
    updateFolder: mockUpdateFolder,
    onRequireAuth: mockOnRequireAuth,
  }),
}));

vi.mock("@/shared/hooks/useErrorToast", () => ({
  useErrorToast: () => ({ handleLimitError: mockHandleLimitError }),
}));

const { useNotebookDialogs } = await import("./useNotebookDialogs");

const notebookData = { title: "T", coverColor: "blue", icon: "book" };
const folderData = { name: "F", color: "blue", icon: "folder" };

describe("useNotebookDialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotebook.mockResolvedValue("nb-new");
    mockCreateFolder.mockResolvedValue("f-new");
    mockUpdateNotebook.mockResolvedValue(undefined);
    mockUpdateFolder.mockResolvedValue(undefined);
    mockHandleLimitError.mockResolvedValue({ isLimitError: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("creates the notebook in the given folder and closes the dialog", async () => {
    const { result } = renderHook(() => useNotebookDialogs({ folderId: "folder-1" }));
    act(() => result.current.openCreateNotebook());
    expect(result.current.isCreatingNotebook).toBe(true);

    await act(() => result.current.saveNotebook(notebookData));

    expect(mockCreateNotebook).toHaveBeenCalledWith({ ...notebookData, folderId: "folder-1" });
    expect(result.current.isCreatingNotebook).toBe(false);
  });

  it("updates the notebook being customized", async () => {
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openCustomize("nb-1"));

    await act(() => result.current.saveNotebook(notebookData));

    expect(mockUpdateNotebook).toHaveBeenCalledWith("nb-1", notebookData);
    expect(mockCreateNotebook).not.toHaveBeenCalled();
    expect(result.current.customizingId).toBeNull();
  });

  it("leaves a limit error to the limit toast and keeps the dialog open", async () => {
    mockCreateNotebook.mockRejectedValue(new Error("limit"));
    mockHandleLimitError.mockResolvedValue({ isLimitError: true });
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openCreateNotebook());

    await act(() => result.current.saveNotebook(notebookData));

    expect(mockOnRequireAuth).not.toHaveBeenCalled();
    expect(result.current.isCreatingNotebook).toBe(true);
  });

  it("asks to sign in on an auth error when creating a notebook", async () => {
    mockCreateNotebook.mockRejectedValue(new Error("Unauthenticated"));
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openCreateNotebook());

    await act(() => result.current.saveNotebook(notebookData));

    expect(mockOnRequireAuth).toHaveBeenCalledWith("You need to sign in to create a notebook.");
    expect(result.current.isCreatingNotebook).toBe(false);
  });

  it("rethrows other create errors so the dialog can report them", async () => {
    mockCreateNotebook.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openCreateNotebook());

    await expect(act(() => result.current.saveNotebook(notebookData))).rejects.toThrow("boom");
    expect(result.current.isCreatingNotebook).toBe(true);
  });

  it("creates a folder and asks to sign in on an auth error", async () => {
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openCreateFolder());
    await act(() => result.current.saveFolder(folderData));
    expect(mockCreateFolder).toHaveBeenCalledWith(folderData);
    expect(result.current.isCreatingFolder).toBe(false);

    mockCreateFolder.mockRejectedValue(new Error("Unauthorized"));
    act(() => result.current.openCreateFolder());
    await act(() => result.current.saveFolder(folderData));
    expect(mockOnRequireAuth).toHaveBeenCalledWith("You need to sign in to create a folder.");
    expect(mockHandleLimitError).not.toHaveBeenCalled();
  });

  it("updates the folder being customized", async () => {
    const { result } = renderHook(() => useNotebookDialogs());
    act(() => result.current.openFolderCustomize("f-1"));

    await act(() => result.current.saveFolder(folderData));

    expect(mockUpdateFolder).toHaveBeenCalledWith("f-1", folderData);
    expect(result.current.folderCustomizingId).toBeNull();
  });
});
