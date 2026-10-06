import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomizeReportModal } from "../CustomizeReportModal";

// The real prompt library, with only its data hooks mocked: these tests are about where focus
// lands when the library closes.
const PROMPT = {
  _id: "p1",
  userId: "u1",
  title: "Exam drill",
  description: "Short answers only",
  promptText: "Quiz me like a final exam",
  studioTool: "report",
  visibility: "public",
  status: "active",
  saveCount: 3,
  ratingAverage: 4,
  createdAt: 0,
  updatedAt: 0,
};

vi.mock("../../services/promptsApi", () => ({
  usePublicPrompts: () => ({ page: [PROMPT] }),
  useMyPrompts: () => ({ page: [] }),
  useSavePublicPrompt: () => vi.fn(),
  useRatePrompt: () => vi.fn(),
  useReportPrompt: () => vi.fn(),
  usePublishPrompt: () => vi.fn(),
  useUnpublishPrompt: () => vi.fn(),
  useDeletePrompt: () => vi.fn(),
  useCreatePrompt: () => vi.fn(),
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const PROMPT_LABEL = "Describe the report you want to create";

function renderReport() {
  render(<CustomizeReportModal isOpen onClose={vi.fn()} onSelectFormat={vi.fn()} />);
}

async function openLibrary() {
  await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
  return screen.findByRole("dialog", { name: "Prompt library" });
}

beforeEach(() => vi.clearAllMocks());

describe("PromptFormatPicker with the prompt library", () => {
  it("applying a prompt on the grid focuses the prompt box once the library closes", async () => {
    renderReport();
    const library = await openLibrary();
    await userEvent.click(within(library).getByRole("button", { name: "Use" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Prompt library" })).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("Quiz me like a final exam");
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveFocus();
  });

  it("applying a prompt on the prompt step still returns focus to Discover Prompts", async () => {
    renderReport();
    await userEvent.click(screen.getByRole("button", { name: "Create Your Own" }));
    const library = await openLibrary();
    await userEvent.click(within(library).getByRole("button", { name: "Use" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Prompt library" })).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue("Quiz me like a final exam");
    expect(screen.getByRole("button", { name: "Discover Prompts" })).toHaveFocus();
  });

  it("Escape returns focus to Discover Prompts", async () => {
    renderReport();
    await openLibrary();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Prompt library" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Discover Prompts" })).toHaveFocus();
  });
});
