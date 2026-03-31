import { createContext, useContext, ReactNode } from 'react';
import { NotebookItem, FolderItem } from '@/shared/types/index';
import { useSubscriptionStatus } from '../billing/services/subscriptionApi';

export interface NotebookContextType {
  // Derived data
  notebookList: NotebookItem[];
  featuredNotebooks: NotebookItem[];
  recentNotebooks: NotebookItem[];
  activeNotebook: NotebookItem | undefined;

  // URL helpers
  urlNotebookId: string | null;
  urlFolderId: string | null;
  currentView: string;

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

  // Navigation
  logoClick: () => void;
  getStarted: () => void;
  billingClick: () => void;
  billingBack: () => void;

  // Notebook title (for Header rename)
  notebookTitle: string;
  setNotebookTitle: (title: string) => void;

  // Subscription
  subscriptionStatus: ReturnType<typeof useSubscriptionStatus>;

  // Auth helpers for child components to trigger login modal
  onRequireAuth: (errorMessage: string) => void;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

interface NotebookProviderProps {
  children: ReactNode;
  value: NotebookContextType;
}

export function NotebookProvider({ children, value }: NotebookProviderProps) {
  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  );
}

export function useNotebookContext() {
  const context = useContext(NotebookContext);
  if (!context) throw new Error('useNotebookContext must be used within NotebookProvider');
  return context;
}
