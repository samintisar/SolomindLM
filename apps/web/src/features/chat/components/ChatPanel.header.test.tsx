import type { Doc } from "@convex/_generated/dataModel";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { ChatPanel } from "./ChatPanel";

const conversations = [
  { _id: "c1", title: "Photosynthesis", updatedAt: 2 },
  { _id: "c2", title: "Cell cycle", updatedAt: 1 },
] as unknown as Doc<"conversations">[];

const chat = {
  messages: [] as unknown[],
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
  conversations,
  onSelectConversation: vi.fn(),
  onCreateConversation: vi.fn(),
  onRenameConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  consumeResearchExecuteStream: vi.fn(),
};

vi.mock("../useChatStreaming", () => ({ useChatStreamingContext: () => chat }));
vi.mock("../../sources/useSourcesContext", () => ({ useSourcesContext: () => ({ sources: [] }) }));
vi.mock("@/features/auth/hooks/useHttpAuthToken", () => ({ useHttpAuthToken: () => null }));
vi.mock("@/features/sources/components/AcademicDiscoveryFiltersSection", () => ({
  buildAcademicDiscoveryApiFilters: () => ({}),
}));
vi.mock("../../notebooks/services/notebooksApi", () => ({ useUpdateNotebook: () => vi.fn() }));
vi.mock("../../sources/services/documentsApi", () => ({ useAddExternalSources: () => vi.fn() }));
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
  CHAT_DEFAULT_SOURCE_FILTERS: ["notebook"],
  DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS: ["notebook", "web"],
  ChatInput: () => <div data-onboarding="chat-input" />,
}));
vi.mock("./ChatEmptyState", () => ({ ChatEmptyState: () => null }));
vi.mock("./ConfigureChatModal", () => ({
  ConfigureChatModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Configure chat" /> : null,
}));
vi.mock("./MessageBubble", () => ({ MessageBubble: () => null }));
vi.mock("./ReferenceTooltip", () => ({ ReferenceTooltip: () => null }));
vi.mock("./ResearchPlanMessage", () => ({ ResearchPlanMessage: () => null }));
vi.mock("./LiteratureReviewMessage", () => ({ LiteratureReviewMessage: () => null }));

function setup() {
  render(
    <ToastProvider>
      <ChatPanel
        isLeftOpen={false}
        isRightOpen={false}
        toggleLeft={vi.fn()}
        toggleRight={vi.fn()}
        notebookId={"n1" as never}
      />
    </ToastProvider>
  );
}

const historyDialog = () => screen.queryByRole("dialog", { name: "Thread history" });

async function openHistory() {
  await userEvent.click(screen.getByRole("button", { name: "Thread history" }));
  return screen.findByRole("dialog", { name: "Thread history" });
}

beforeEach(() => {
  localStorage.clear();
  chat.onSelectConversation.mockReset();
  chat.onRenameConversation.mockReset().mockResolvedValue(undefined);
  chat.onDeleteConversation.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatPanel header", () => {
  test("icon buttons keep their labels and e2e hooks", () => {
    setup();
    for (const name of ["Open Sources", "Open Studio", "Thread history", "Chat options"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", name);
    }
    expect(screen.getByRole("button", { name: "Open Studio" })).toHaveAttribute(
      "data-onboarding",
      "studio-panel-toggle"
    );
    // Empty thread: the new-chat button explains why it is a no-op.
    expect(screen.getByRole("button", { name: "Already in a new chat" })).toBeInTheDocument();
  });

  test("history popover lists threads and closes when one is selected", async () => {
    setup();
    const dialog = await openHistory();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cell cycle" }));
    expect(chat.onSelectConversation).toHaveBeenCalledWith("c2");
    await waitFor(() => expect(historyDialog()).not.toBeInTheDocument());
  });

  test("Escape in the rename input cancels the rename, not the popover", async () => {
    setup();
    const dialog = await openHistory();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Thread actions for Cell cycle" })
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const input = await screen.findByRole("textbox", { name: "Rename thread" });
    await waitFor(() => expect(input).toHaveFocus());

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Rename thread" })).not.toBeInTheDocument();
    expect(historyDialog()).toBeInTheDocument();
    expect(chat.onRenameConversation).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(historyDialog()).not.toBeInTheDocument());
  });

  test("the delete confirm keeps the popover open until it resolves", async () => {
    setup();
    const dialog = await openHistory();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Thread actions for Cell cycle" })
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");

    // Escape while the confirm is up must not close (and unmount) the list that owns it.
    await userEvent.keyboard("{Escape}");
    expect(historyDialog()).toBeInTheDocument();

    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(chat.onDeleteConversation).toHaveBeenCalledWith("c2"));
    expect(historyDialog()).toBeInTheDocument();
  });

  test("options menu opens configure and toggles the pin", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Chat options" }));
    expect(await screen.findByRole("menuitem", { name: "Export chat" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Save to note" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Pin chat" }));
    expect(JSON.parse(localStorage.getItem("chat-pinned-ids") ?? "[]")).toEqual(["c1"]);

    await userEvent.click(screen.getByRole("button", { name: "Chat options" }));
    expect(await screen.findByRole("menuitem", { name: "Unpin chat" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Configure chat" }));
    expect(await screen.findByRole("dialog", { name: "Configure chat" })).toBeInTheDocument();
  });
});
