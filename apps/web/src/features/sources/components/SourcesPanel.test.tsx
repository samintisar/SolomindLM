import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SourcesPanel } from "./SourcesPanel";

const source = {
  id: "doc1",
  title: "Paper",
  type: "PDF",
  status: "completed",
  selected: true,
};

// Stable references: the panel's focus effect depends on `sources`, so a fresh array per render would loop.
const sourcesContext = {
  sources: [source],
  onToggleSource: vi.fn(),
  onToggleAll: vi.fn(),
  onAddSource: vi.fn(),
  onDeleteSource: vi.fn(),
  onDeleteSelectedSources: vi.fn(),
  onRenameSource: vi.fn(),
};
vi.mock("../useSourcesContext", () => ({ useSourcesContext: () => sourcesContext }));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/shared/ui/useConfirmDialog", () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(), ConfirmDialogComponent: () => null }),
}));
vi.mock("../hooks/useSourceContent", () => ({
  useSourceContent: () => ({
    onContentUpdate: vi.fn(),
    onLoadingStart: vi.fn(),
    getContent: () => "content",
    isLoading: () => false,
    hasError: () => false,
    handleCopySourceMarkdown: vi.fn(),
    handleDownloadSourceMarkdown: vi.fn(),
  }),
}));
vi.mock("../hooks/useSourceSearch", () => ({
  useSourceSearch: (sources: unknown[]) => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
    filteredSources: sources,
  }),
}));
vi.mock("../hooks/useSourceUpload", () => ({ useSourceUpload: () => ({}) }));
vi.mock("../services/documentsApi", () => ({
  useDocument: () => undefined,
  useDocumentContent: () => undefined,
  useIngestFromGoogleDrive: () => vi.fn(),
  useRefreshNotebookRemoteSources: () => vi.fn(),
  useRefreshRemoteSource: () => vi.fn(),
}));
vi.mock("./add-source/AddSourceDialog", () => ({ AddSourceDialog: () => null }));
vi.mock("./discover/DiscoverSourcesDialog", () => ({ DiscoverSourcesDialog: () => null }));
vi.mock("./GoogleDrivePicker", () => ({
  GoogleDrivePicker: () => null,
  isGoogleDrivePickerConfigured: false,
}));
vi.mock("./SourcesPanelHeader", () => ({
  SourcesPanelHeader: ({ onBackToList }: { onBackToList: () => void }) => (
    <button type="button" onClick={onBackToList}>
      back to list
    </button>
  ),
}));
vi.mock("./SourceList", () => ({
  SourceList: ({ onViewSource }: { onViewSource: (id: string) => void }) => (
    <button type="button" onClick={() => onViewSource("doc1")}>
      open doc1
    </button>
  ),
}));
vi.mock("./SourceViewer", () => ({
  SourceViewer: ({ focus }: { focus?: unknown }) => (
    <div data-testid="viewer" data-focus={JSON.stringify(focus ?? null)} />
  ),
}));

const focusOf = () => JSON.parse(screen.getByTestId("viewer").dataset.focus ?? "null");

describe("SourcesPanel citation focus", () => {
  test("hands a citation's passage and page to the viewer", () => {
    render(
      <SourcesPanel
        isOpen
        onClose={vi.fn()}
        focusSourceRequest={{ documentId: "doc1", seq: 1, quote: "q", pageNumber: 7 }}
      />
    );

    expect(focusOf()).toMatchObject({ seq: 1, quote: "q", pageNumber: 7 });
  });

  test("does not replay the citation when the source is reopened by hand", async () => {
    const user = userEvent.setup();
    render(
      <SourcesPanel
        isOpen
        onClose={vi.fn()}
        focusSourceRequest={{ documentId: "doc1", seq: 1, quote: "q", pageNumber: 7 }}
      />
    );
    expect(focusOf()).toMatchObject({ pageNumber: 7 });

    await user.click(screen.getByRole("button", { name: "back to list" }));
    await user.click(screen.getByRole("button", { name: "open doc1" }));

    expect(focusOf()).toBeNull();
  });
});
