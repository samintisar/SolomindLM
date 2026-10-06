import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverStudioPromptsModal } from "./DiscoverStudioPromptsModal";

const api = vi.hoisted(() => ({
  usePublicPrompts: vi.fn(),
  myPage: [] as unknown[],
  savePrompt: vi.fn(),
  ratePrompt: vi.fn(),
  reportPrompt: vi.fn(),
  publishPrompt: vi.fn(),
  unpublishPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../services/promptsApi", () => ({
  usePublicPrompts: api.usePublicPrompts,
  useMyPrompts: () => ({ page: api.myPage }),
  useSavePublicPrompt: () => api.savePrompt,
  useRatePrompt: () => api.ratePrompt,
  useReportPrompt: () => api.reportPrompt,
  usePublishPrompt: () => api.publishPrompt,
  useUnpublishPrompt: () => api.unpublishPrompt,
  useDeletePrompt: () => api.deletePrompt,
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: api.success, error: api.error }),
}));

const PROMPT = {
  _id: "p1",
  userId: "u1",
  title: "Exam drill",
  description: "Short answers only",
  promptText: "Quiz me like a final exam",
  studioTool: "flashcards",
  visibility: "public",
  status: "active",
  saveCount: 1200,
  ratingAverage: 4.5,
  createdAt: 0,
  updatedAt: 0,
};

function renderLibrary() {
  const onApplyPrompt = vi.fn();
  render(
    <DiscoverStudioPromptsModal
      studioTool="flashcards"
      onApplyPrompt={onApplyPrompt}
      trigger={<button type="button">Open library</button>}
    />
  );
  return { onApplyPrompt };
}

async function openLibrary(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open library" }));
  return screen.getByRole("dialog", { name: "Prompt library" });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.usePublicPrompts.mockReturnValue({ page: [PROMPT] });
  api.myPage = [];
  for (const fn of [api.savePrompt, api.ratePrompt, api.reportPrompt, api.deletePrompt]) {
    fn.mockResolvedValue(undefined);
  }
});

describe("DiscoverStudioPromptsModal", () => {
  it("opens from its trigger on the Public tab, with search, sort and the tool's prompts", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    expect(within(dialog).getByText("Flashcards", { exact: true })).toBeInTheDocument();
    expect(within(dialog).getByTestId("discover-prompts-tab-public")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(within(dialog).getByPlaceholderText("Search prompts...")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Sort prompts" })).toHaveTextContent(
      "Most saved"
    );
    expect(within(dialog).getByText("Exam drill")).toBeInTheDocument();
    expect(within(dialog).getByText(/1\.2k/)).toBeInTheDocument();
  });

  it("Use fills the prompt and closes the library", async () => {
    const user = userEvent.setup();
    const { onApplyPrompt } = renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Use" }));
    expect(onApplyPrompt).toHaveBeenCalledWith("Quiz me like a final exam");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("rates a prompt", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Rate this prompt" }));
    await user.click(within(dialog).getByRole("button", { name: "Rate 4 out of 5" }));
    expect(api.ratePrompt).toHaveBeenCalledWith("p1", 4);
    await waitFor(() => expect(api.success).toHaveBeenCalledWith("Rating submitted"));
  });

  it("asks before reporting a prompt", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Report this prompt" }));
    expect(within(dialog).getByText("Report this prompt?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(api.reportPrompt).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(api.success).toHaveBeenCalledWith("Prompt reported"));
  });

  it("keeps focus on the card while rating: first star in, Rate this prompt back out", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Rate this prompt" }));
    expect(within(dialog).getByRole("button", { name: "Rate 1 out of 5" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(dialog).getByRole("button", { name: "Rate this prompt" })).toHaveFocus();
  });

  it("keeps focus on the card while reporting: Confirm in, Report this prompt back out", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Report this prompt" }));
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(dialog).getByRole("button", { name: "Report this prompt" })).toHaveFocus();
    expect(api.reportPrompt).not.toHaveBeenCalled();
  });

  it("shows the error when saving a prompt fails", async () => {
    const user = userEvent.setup();
    api.savePrompt.mockRejectedValueOnce(new Error("Already in your library"));
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(api.savePrompt).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Already in your library"));
    expect(api.success).not.toHaveBeenCalled();
  });

  it("trims the search, and spaces alone search for nothing", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    const search = within(dialog).getByPlaceholderText("Search prompts...");
    await user.type(search, "  exam ");
    expect(api.usePublicPrompts).toHaveBeenLastCalledWith("flashcards", "saves", "exam");
    await user.clear(search);
    await user.type(search, "   ");
    expect(api.usePublicPrompts).toHaveBeenLastCalledWith("flashcards", "saves", undefined);
  });

  it("starts each open on the Public tab with an empty search", async () => {
    const user = userEvent.setup();
    renderLibrary();
    let dialog = await openLibrary(user);
    await user.type(within(dialog).getByPlaceholderText("Search prompts..."), "exam");
    await user.click(within(dialog).getByTestId("discover-prompts-tab-my"));
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    dialog = await openLibrary(user);
    expect(within(dialog).getByTestId("discover-prompts-tab-public")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(within(dialog).getByPlaceholderText("Search prompts...")).toHaveValue("");
  });

  it("asks the query again when the sort changes", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByRole("combobox", { name: "Sort prompts" }));
    await user.click(await screen.findByRole("option", { name: "Newest" }));
    expect(api.usePublicPrompts).toHaveBeenLastCalledWith("flashcards", "newest", undefined);
  });

  it("My Prompts shows its empty state and no search", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByTestId("discover-prompts-tab-my"));
    expect(within(dialog).getByTestId("discover-prompts-tab-my")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(within(dialog).getByText(/haven.t saved any prompts yet/)).toBeInTheDocument();
    expect(within(dialog).queryByPlaceholderText("Search prompts...")).not.toBeInTheDocument();
  });

  it("asks before deleting one of my prompts", async () => {
    const user = userEvent.setup();
    api.myPage = [{ ...PROMPT, _id: "m1", title: "My drill", visibility: "private" }];
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByTestId("discover-prompts-tab-my"));

    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));
    const confirm = screen.getByRole("alertdialog", { name: "Delete this prompt?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deletePrompt).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));
    await user.click(
      within(screen.getByRole("alertdialog", { name: "Delete this prompt?" })).getByRole("button", {
        name: "Delete",
      })
    );
    expect(api.deletePrompt).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(api.success).toHaveBeenCalledWith("Prompt deleted"));
  });

  it("Cancel returns focus to the row's delete button", async () => {
    const user = userEvent.setup();
    api.myPage = [{ ...PROMPT, _id: "m1", title: "My drill", visibility: "private" }];
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByTestId("discover-prompts-tab-my"));
    const trash = within(dialog).getByRole("button", { name: "Delete prompt" });
    await user.click(trash);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trash).toHaveFocus());
  });

  it("after a delete, focus moves to the next prompt's delete button", async () => {
    const user = userEvent.setup();
    api.myPage = [
      { ...PROMPT, _id: "m1", title: "My drill", visibility: "private" },
      { ...PROMPT, _id: "m2", title: "My summary", visibility: "private" },
    ];
    renderLibrary();
    const dialog = await openLibrary(user);
    await user.click(within(dialog).getByTestId("discover-prompts-tab-my"));
    const [first, second] = within(dialog).getAllByRole("button", { name: "Delete prompt" });
    await user.click(first);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deletePrompt).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(second).toHaveFocus());
  });

  it("after deleting the only prompt, focus moves to the My Prompts tab", async () => {
    const user = userEvent.setup();
    api.myPage = [{ ...PROMPT, _id: "m1", title: "My drill", visibility: "private" }];
    renderLibrary();
    const dialog = await openLibrary(user);
    const myTab = within(dialog).getByTestId("discover-prompts-tab-my");
    await user.click(myTab);
    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(myTab).toHaveFocus());
  });
});
