import { createContext, useContext } from "react";
import { FolderItem, NotebookItem } from "@/shared/types/index";
import { useSubscriptionStatus } from "../billing/services/subscriptionApi";

export interface NotebookContextType {
  // Derived data
  featuredNotebooks: NotebookItem[];
  recentNotebooks: NotebookItem[];
  activeNotebook: NotebookItem | undefined;
  /** True until the notebooks and folders queries have returned. */
  notebooksLoading: boolean;

  // URL helper
  urlNotebookId: string | null;

  // Folders
  folders: FolderItem[];

  // Notebook handlers
  selectNotebook: (notebook: NotebookItem) => void;
  createNotebook: () => Promise<void>;
  updateNotebook: (id: string, updates: Partial<NotebookItem>) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;

  // Folder handlers
  selectFolder: (folderId: string) => void;
  folderBack: () => void;
  createFolder: () => Promise<void>;
  updateFolder: (id: string, updates: Partial<FolderItem>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveNotebookToFolder: (notebookId: string, folderId: string | null) => Promise<void>;

  // Notebook title (Header shows and renames it)
  notebookTitle: string;

  // Subscription
  subscriptionStatus: ReturnType<typeof useSubscriptionStatus>;

  // Auth helpers for child components to trigger login modal
  isAuthenticated: boolean;
  onRequireAuth: (errorMessage: string) => void;
}

export const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export function useNotebookContext() {
  const context = useContext(NotebookContext);
  if (!context) throw new Error("useNotebookContext must be used within NotebookProvider");
  return context;
}
