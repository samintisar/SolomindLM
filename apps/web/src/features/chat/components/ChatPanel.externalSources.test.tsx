import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import type { RefHandlers } from "../utils/messageRendering.utils";
import { ChatPanel } from "./ChatPanel";

const externalSources = [
  { title: "Paper A", url: "https://a.example", snippet: "a", sourceType: "academic" },
  { title: "Paper B", url: "https://b.example", snippet: "b", sourceType: "web" },
];

const chat = {
  messages: [
    {
      id: "m1",
      role: "assistant",
      content: "Answer",
      externalSources,
      references: [
        {
          id: 7,
          sourceId: "w",
          sourceTitle: "Web Page",
          sourceUrl: "https://w.example",
          content: "Web excerpt",
          chunkIndex: 0,
        },
      ],
    },
  ] as unknown as Message[],
  isChatStreaming: false,
  remoteGenerationBlocksSend: false,
  onSendMessage: vi.fn(),
  onStopChat: vi.fn(),
  onSetFeedback: vi.fn(),
  onRetry: vi.fn(),
  onSaveChatOptimistic: vi.fn(),
  sourceCount: 0,
  sourceSummary: undefined,
  suggestions: [],
  isLoadingSuggestions: false,
  activeConversationId: "c1",
  conversations: [],
  onSelectConversation: vi.fn(),
  onCreateConversation: vi.fn(),
  onRenameConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  consumeResearchExecuteStream: vi.fn(),
};
const addExternalSources = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
  }) => <div>{data.map((item, i) => itemContent(i, item))}</div>,
}));
vi.mock("../useChatStreaming", () => ({ useChatStreamingContext: () => chat }));
vi.mock("../../sources/useSourcesContext", () => ({ useSourcesContext: () => ({ sources: [] }) }));
vi.mock("@/features/auth/hooks/useHttpAuthToken", () => ({ useHttpAuthToken: () => null }));
vi.mock("@/shared/hooks/useLimitErrorToast", () => ({
  useLimitErrorToast: () => ({ handleLimitError: async () => ({ isLimitError: false }) }),
}));
vi.mock("@/features/sources/components/AcademicDiscoveryFiltersSection", () => ({
  buildAcademicDiscoveryApiFilters: () => ({}),
}));
vi.mock("../../notebooks/services/notebooksApi", () => ({ useUpdateNotebook: () => vi.fn() }));
vi.mock("../../sources/services/documentsApi", () => ({
  useAddExternalSources: () => addExternalSources,
}));
vi.mock("../hooks/useComposerClearance", () => ({ useComposerClearance: () => undefined }));
vi.mock("../hooks/useStartLiteratureReview", () => ({
  useStartLiteratureReview: () => ({ startLiteratureReview: vi.fn(), isStarting: false }),
}));
vi.mock("../services/chatApi", () => ({ CONVEX_SITE_URL: "http://convex.test" }));
vi.mock("../services/literatureReviewApi", () => ({ useLiteratureReviewSession: () => null }));
vi.mock("../services/researchApi", () => ({
  useApproveResearchPlan: () => vi.fn(),
  useRejectResearchPlan: () => vi.fn(),
}));
vi.mock("../services/userNotesApi", () => ({ useSaveChat: () => vi.fn() }));
vi.mock("./ChatInput", () => ({
  ChatInput: () => <div data-onboarding="chat-input" />,
}));
vi.mock("./ChatEmptyState", () => ({ ChatEmptyState: () => null }));
vi.mock("./ConfigureChatModal", () => ({ ConfigureChatModal: () => null }));
vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("./MessageBubble", () => ({
  MessageBubble: ({
    externalSources: sources,
    onOpenExternalSources,
    refHandlers,
  }: {
    externalSources: unknown[];
    onOpenExternalSources: (sources: unknown[]) => void;
    refHandlers: RefHandlers;
  }) => (
    <>
      <button type="button" onClick={() => onOpenExternalSources(sources)}>
        open sources
      </button>
      <button type="button" onClick={(e) => refHandlers.onRefToggle(1, "m1", e.currentTarget)}>
        cite 1
      </button>
    </>
  ),
}));
vi.mock("./ResearchPlanMessage", () => ({ ResearchPlanMessage: () => null }));
vi.mock("./LiteratureReviewMessage", () => ({ LiteratureReviewMessage: () => null }));

function setup() {
  render(
    <ChatPanel
      isLeftOpen={false}
      isRightOpen={false}
      toggleLeft={vi.fn()}
      toggleRight={vi.fn()}
      notebookId={"n1" as never}
    />
  );
}

const dialog = () => screen.queryByRole("dialog", { name: "Sources" });

async function openAndSelect() {
  await userEvent.click(screen.getByRole("button", { name: "open sources" }));
  await screen.findByRole("dialog", { name: "Sources" });
  await userEvent.click(screen.getByRole("checkbox", { name: /include paper a/i }));
}

beforeEach(() => {
  addExternalSources.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ChatPanel external sources dialog", () => {
  test("adds the selection, toasts the count and closes", async () => {
    addExternalSources.mockResolvedValue(["d1"]);
    setup();
    await openAndSelect();
    await userEvent.click(screen.getByRole("button", { name: /^add 1/i }));
    expect(addExternalSources).toHaveBeenCalledWith({
      notebookId: "n1",
      sources: [expect.objectContaining({ title: "Paper A", url: "https://a.example" })],
    });
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith("Added 1 source");
    expect(toastError).not.toHaveBeenCalled();
  });

  test("reports when every source was already in the notebook", async () => {
    addExternalSources.mockResolvedValue([]);
    setup();
    await openAndSelect();
    await userEvent.click(screen.getByRole("button", { name: /^add 1/i }));
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(toastSuccess).toHaveBeenCalledWith("Already in this notebook");
  });

  test("on failure toasts, stays open and keeps the selection", async () => {
    addExternalSources.mockRejectedValue(new Error("boom"));
    setup();
    await openAndSelect();
    await userEvent.click(screen.getByRole("button", { name: /^add 1/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't add sources. Please try again.")
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /include paper a/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /^add 1/i })).toBeEnabled();
  });
});

describe("ChatPanel citation popover", () => {
  async function openCitation() {
    await userEvent.click(screen.getByRole("button", { name: "cite 1" }));
    expect(await screen.findByRole("dialog", { name: "Reference 1" })).toHaveTextContent(
      "Web Page"
    );
  }

  test("adds a cited web source to the notebook and toasts", async () => {
    addExternalSources.mockResolvedValue(["d1"]);
    setup();
    await openCitation();
    await userEvent.click(screen.getByRole("button", { name: "Add to notebook" }));
    expect(addExternalSources).toHaveBeenCalledWith({
      notebookId: "n1",
      sources: [
        { title: "Web Page", url: "https://w.example", snippet: "Web excerpt", sourceType: "web" },
      ],
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Added to notebook"));
  });

  test("toasts when adding a cited source fails", async () => {
    addExternalSources.mockRejectedValue(new Error("boom"));
    setup();
    await openCitation();
    await userEvent.click(screen.getByRole("button", { name: "Add to notebook" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't add this source. Please try again.")
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add to notebook" })).toBeEnabled();
  });
});
