import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockCreateNotebook = vi.fn();
const mockUpdateNotebook = vi.fn();
const mockDeleteNotebook = vi.fn();
const mockHandleLimitError = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../services/notebooksApi", () => ({
  useCreateNotebook: () => mockCreateNotebook,
  useUpdateNotebook: () => mockUpdateNotebook,
  useDeleteNotebook: () => mockDeleteNotebook,
}));

vi.mock("@/shared/hooks/useLimitErrorToast", () => ({
  useLimitErrorToast: () => ({ handleLimitError: mockHandleLimitError }),
}));

vi.mock("@/utils/platformDetection", () => ({
  isNativeShell: () => false,
}));

const { useNotebookCRUD } = await import("./useNotebookCRUD");

describe("useNotebookCRUD", () => {
  const setNotebookTitle = vi.fn();
  const onRequireAuth = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotebook.mockResolvedValue({ id: "nb-new" });
    mockUpdateNotebook.mockResolvedValue(undefined);
    mockDeleteNotebook.mockResolvedValue(undefined);
    mockHandleLimitError.mockResolvedValue({ isLimitError: false });
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("calls onRequireAuth when creating while unauthenticated", async () => {
    const { result } = renderHook(() =>
      useNotebookCRUD({
        isAuthenticated: false,
        user: null,
        activeNotebookId: null,
        setNotebookTitle,
        onRequireAuth,
      })
    );

    await act(async () => {
      await result.current.handleCreateNotebook();
    });

    expect(onRequireAuth).toHaveBeenCalledWith("Sign in to create a notebook.");
    expect(mockCreateNotebook).not.toHaveBeenCalled();
  });

  it("creates notebook and navigates when authenticated", async () => {
    const { result } = renderHook(() =>
      useNotebookCRUD({
        isAuthenticated: true,
        user: { id: "u1" },
        activeNotebookId: null,
        setNotebookTitle,
      })
    );

    await act(async () => {
      await result.current.handleCreateNotebook();
    });

    expect(mockCreateNotebook).toHaveBeenCalledWith({
      title: "Untitled Notebook",
      coverColor: "bg-yellow-500",
      icon: "Folder",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/notebook/nb-new");
  });

  it("updates title and syncs active notebook title", async () => {
    const { result } = renderHook(() =>
      useNotebookCRUD({
        isAuthenticated: true,
        user: { id: "u1" },
        activeNotebookId: "nb-1",
        setNotebookTitle,
      })
    );

    await act(async () => {
      await result.current.handleUpdateNotebook("nb-1", { title: "Renamed" });
    });

    expect(mockUpdateNotebook).toHaveBeenCalledWith("nb-1", { title: "Renamed" });
    expect(setNotebookTitle).toHaveBeenCalledWith("Renamed");
  });

  it("deletes notebook and navigates home when active", async () => {
    const { result } = renderHook(() =>
      useNotebookCRUD({
        isAuthenticated: true,
        user: { id: "u1" },
        activeNotebookId: "nb-1",
        setNotebookTitle,
      })
    );

    await act(async () => {
      await result.current.handleDeleteNotebook("nb-1");
    });

    expect(mockDeleteNotebook).toHaveBeenCalledWith("nb-1");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
