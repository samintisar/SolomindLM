# Studio Create Dialogs (PR 7 of #264) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Studio create dialogs onto the design system (`Dialog`, `Field`, `ToggleGroup`, `Tabs`, `Select`, `Textarea`) at 0 design-lint findings, so all 13 files join `MIGRATED` and `features/studio` drops from 202 to 73 findings.

**Architecture:**
- **One shared shell** in `features/studio/components/customize/`:
  - `StudioCustomizeDialog` wraps `Dialog` + `DialogContent`. Its children (the form) mount only while it's open, so every open starts from the defaults.
  - `StudioCustomizeHeader`, `StudioCustomizeBody` and `StudioCustomizeFooter` give every dialog the same header (type tile, title, description, Discover Prompts, Close), a scrolling body and a Cancel + Generate footer.
- **Shared fields** in the same folder:
  - `OptionToggleGroup`: label + single-select `ToggleGroup`, for count, difficulty, length and the like.
  - `PromptField`: the prompt `Textarea` plus "Save as reusable prompt", which opens `SaveAsPromptModal` as a nested dialog.
  - `OptionCard`: a clickable format or style card, built on `Card variant="interactive"`.
  - `PromptFormatPicker`: the two-step "format grid → prompt" flow that Report and Spreadsheets share.
  - `InfographicStyleThumbnail`: the style previews, exempt from three design rules.
- **Nested dialogs:**
  - Discover prompts and Save as prompt become real Radix `Dialog`s. Each has a `DialogTrigger`, so focus goes back to its button when it closes.
  - They portal to `<body>`. Radix stacks them over the Customize dialog: Escape and outside clicks close only the top one, and Radix `aria-hidden`s the dialog below.
- **`embedded` (landing hero mock-up):**
  - The shell renders a frame `div` over the mock-up and portals a **non-modal** `DialogContent` into it with `container`.
  - The frame's `translate-x-0` makes it the containing block for the content's `position: fixed`. This is the `/dev/design` `Frame` trick.
  - The frame paints the scrim itself, because Radix draws no overlay for non-modal dialogs.
- **`theme="light"` (auth page):** dialogs portal out of the page's `.auth-form-light` wrapper, so the auth page pins light tokens with `DialogContent theme="light"`. A small context passes the same theme to the nested prompt dialogs.
- **`preview` (landing and sign-in mock-ups):**
  - It's an explicit boolean on the seven mock-up dialogs, passed to the shell, and kept separate from `embedded`:
    - `embedded` is about where the dialog renders (inside the landing mock-up).
    - `preview` is about what it offers. The sign-in page shows full-screen dialogs that are still previews.
  - The shell puts it in a context. `StudioCustomizeHeader` then drops "Discover Prompts", and `PromptField` drops "Save as reusable prompt": both need a signed-in prompt library.
  - `LandingHeroMockup` passes `embedded preview`, and `AuthPage` passes `theme="light" preview` (Task 11).

**Tech Stack:** React 19.2, Tailwind v4, shadcn/ui on Radix (`Dialog`, `ToggleGroup`, `Tabs`, `Select`, `Checkbox`, `Card`, `Item`, `InputGroup`, `Empty`, `Alert`), Vitest + Testing Library, Playwright (`--list` only).

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`, "### 7. Create dialogs".

**Working directory:** worktree `.worktrees/studio` (`C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb\.worktrees\studio`), new branch `feature/studio-dialogs` from `origin/main` (Task 0).
- **One web test file:** `bun run test <path>`, from `apps/web`.
- **Design lint for files:** `bunx eslint --max-warnings 0 <files>`, from `apps/web`. It must print nothing.
- **Typecheck:** `bun run typecheck:web`, from the root.
- **Editing:**
  - Serena is bound to the main checkout, so edit this worktree with Edit/Write and check `git status` afterwards.
  - The edit hook runs Biome on each file. If Biome reports CRLF or formatting, run `bunx biome format --write <files>`.
- **Never kill processes by name.** Kill by PID only.
- **No browser tools in Tasks 0–12.** The browser pane is shared, and the controller does Task 13.

**Task order and why it differs from the brief:** the prompt dialogs (Tasks 1–2) come before the shell.
- The shell's `PromptField` and header are built on their final APIs (`trigger`, `onOpen`).
- A hand-rolled `fixed` overlay nested inside a Radix `DialogContent` gets trapped by the content's transform. That's the reason `CustomizeMindMapModal` couldn't use `Dialog`.
- **Mid-branch caveat:** between Task 2 and the migration of each Customize dialog, the old hand-rolled overlays (`z-110`/`z-120`) sit above the new `z-100` prompt dialogs. This is expected inside the branch; the PR is squash-merged.

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`, `docs/design/principles.md`, checked against `@shadcn/lint` for this plan):
- Primitives get layout and sizing classes only (`w-full`, `flex-1`, `h-36`, `resize-none`, `sm:max-w-4xl`, `mx-6`).
- **No spacing classes on `FieldGroup`, `DialogFooter`, `TabsContent`, `Item` or `ItemGroup`.** These are verified lint errors (`gap-*`, `px-*`, `pt-*`, `pb-*`).
  - Wrap them in a plain `div` that carries the padding.
  - `FieldGroup className="grid sm:grid-cols-2"` is allowed, and it keeps its own gap.
- No arbitrary `[...]` values, no palette colours, no `dark:`, no `bg-black/…` overlays, no `z-[…]`.
- `style` may only set custom properties.
- A raw `<button>` gets no border (ring or fill only).
- Smallest text is `text-xs` (13px).
- Content is in the serif body face, which `Textarea`, card descriptions and prompt previews inherit. Controls are sans (`font-sans` on raw labels and meta text).
- A raw `div`/`span`/`button` may carry any token classes.

---

## Contracts that must keep working

| What | Used by | Detail |
|---|---|---|
| Dialog headings | `e2e/studio/tool-grid.spec.ts`, `*-generation.spec.ts`, `prompt-library.spec.ts` | `DialogTitle` text exactly: "Create report", "Customize Flashcards", "Customize Quiz", "Customize Audio Overview", "Customize Infographic", "Customize Written Questions", "Create spreadsheet", "Customize Mind Map" |
| Generate buttons | e2e | "Generate Audio", "Generate Mind Map", "Generate Quiz", "Generate Written Questions", "Generate" (infographic, matched as a substring, so no other button in that dialog may contain "generate"), "Generate Cards", "Generate Report", "Generate Spreadsheet" |
| Report format click | `report-generation.spec.ts`, `studio-lifecycle.spec.ts` | today `getByRole("heading", { level: 4, name: "Summary" })`. Task 8 updates it to the card's button. |
| Spreadsheet format click | `spreadsheet-generation.spec.ts` | `getByText("Data Table", { exact: true })` must stay a clickable element inside the card's button |
| Flashcards focus box | `prompt-library.spec.ts` | placeholder starts `e.g. Focus on 'Relational Algebra'` |
| Save as reusable prompt | `prompt-library.spec.ts`, `CustomizeMindMapModal.test.tsx` | a button named `/save as reusable prompt/i`, disabled while the prompt is blank |
| Save as Prompt dialog | `prompt-library.spec.ts`, `SaveAsPromptModal.test.tsx` | heading "Save as Prompt"; test ids `save-as-prompt-tool-label` (text "Flashcards"), `save-as-prompt-close`, `save-as-prompt-visibility-toggle` (with `aria-checked` "false"/"true"); placeholders "e.g., Focus on key concepts for exam prep", "Briefly describe what this prompt does...", "Enter your custom prompt..."; "/2000"; buttons "Save Prompt" and "Cancel" |
| Prompt library | `prompt-library.spec.ts` | heading "Prompt library"; test ids `discover-prompts-tab-public` / `discover-prompts-tab-my` with `aria-selected`; placeholder "Search prompts..."; "Most saved" |
| Discover button | `prompt-library.spec.ts`, `CustomizeMindMapModal.test.tsx` | a button named `/discover prompts/i`. The test mocks `./StudioModalDiscoverPromptsButton`. |
| Close / Cancel | `CustomizeMindMapModal.test.tsx` | every Customize dialog has buttons "Close" and "Cancel", and each calls `onClose` |
| No-sources confirm | generation e2e | Generate with no sources opens the `AlertDialog` over the still-open Customize dialog. Radix `aria-hidden`s the dialog below, so `getByRole("button", { name: "Cancel" })` stays unique. |
| Config types | `hooks/flows/*`, `hooks/useStudioHandlers.ts` | `AudioConfig`, `FlashcardConfig`, `InfographicConfig`, `MindMapConfig`, `QuizConfig`, `SpreadsheetConfig` and `WrittenQuestionsConfig` stay unchanged and exported from the same files |
| Props | `StudioPanel.tsx`, `AuthPage.tsx`, `LandingHeroMockup.tsx` | `isOpen`, `onClose`, `onGenerate`/`onSelectFormat` and `embedded` are kept. Optional `theme` and `preview` are added. `StudioPanel` passes neither, so the real app keeps Discover and Save. |
| Cite | `LiteraturePapersPanel.tsx`, `views/LiteratureTableView.tsx`, `views/LiteratureReportView.tsx` | `CitePaperModal` props unchanged. `CitationStylePicker` keeps `value`/`onChange`/`disabled`/`className` and gains `id`. |

---

## File map

All paths are under `apps/web/src/features/studio/` unless they say otherwise.

| File | Change | Responsibility |
|---|---|---|
| `components/customize/dialogTheme.ts` | **new** | `StudioDialogTheme`, context, `useStudioDialogTheme()` |
| `components/SaveAsPromptModal.tsx` (+ test) | rewrite | `Dialog` + `Field`s + `Checkbox`; optional `trigger`/`onOpen`; the form inside `DialogContent` (fixes prompt edits snapping back) |
| `components/DiscoverStudioPromptsModal.tsx` (+ **new** test) | rewrite | `Dialog` + `Tabs variant="line"` + `InputGroup` search + `Select` sort + `Item` cards + `Empty`; uncontrolled with a `trigger`; `AlertDialog` before deleting one of "My Prompts" |
| `components/StudioModalDiscoverPromptsButton.tsx` | rewrite | `Button variant="outline" size="sm"` as the library's trigger |
| `studioTypeStyle.ts` (+ test) | modify | export `StudioTypeKey`, add `studioTypeStyleForKey` |
| `components/customize/StudioCustomizeDialog.tsx` (+ test) | **new** | shell, header, body, footer; `embedded` frame; `theme` |
| `components/customize/options.ts` | **new** | `ToggleOption`, `COUNT_OPTIONS`, `DIFFICULTY_OPTIONS` |
| `components/customize/OptionToggleGroup.tsx` (+ test) | **new** | labelled single-select `ToggleGroup` |
| `components/customize/PromptField.tsx` (+ test) | **new** | prompt `Textarea` + Save as reusable prompt |
| `components/customize/OptionCard.tsx` (+ test) | **new** | clickable format/style card |
| `components/customize/PromptFormatPicker.tsx` | **new** | Report/Spreadsheets two-step flow |
| `components/customize/InfographicStyleThumbnail.tsx` | **new** | style previews (rules exempt) |
| `components/CustomizeQuizModal.tsx`, `CustomizeFlashcardsModal.tsx`, `CustomizeWrittenQuestionsModal.tsx`, `CustomizeMindMapModal.tsx`, `CustomizeAudioModal.tsx`, `CustomizeReportModal.tsx`, `CustomizeSpreadsheetsModal.tsx`, `CustomizeInfographicModal.tsx` (+ a test each) | rewrite | each is the shell + a `…Form` holding its state |
| `components/CitePaperModal.tsx`, `CitationStylePicker.tsx` (+ **new** tests) | rewrite | `Dialog` + `Field`; `Select` |
| `apps/web/src/features/auth/AuthPage.tsx` | modify | `theme="light" preview` on its 7 Customize dialogs |
| `apps/web/src/features/landing/components/LandingHeroMockup.tsx` | modify | `preview` on its 7 Customize dialogs (prop only; landing styling stays #263's) |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | modify | `MIGRATED` entries, thumbnail override, lower baseline |
| `e2e/studio/prompt-library.spec.ts`, `report-generation.spec.ts`, `studio-lifecycle.spec.ts` | modify | selectors for tabs, the checkbox, report cards and the scoped Cancel |

---

### Task 0: Branch and baseline

- [ ] **Step 1: Branch.** From the worktree root:

```bash
git fetch origin
git status --short          # must be clean apart from untracked .superpowers/
git switch -c feature/studio-dialogs origin/main
bun install                 # a real install: a stale node_modules junction breaks design lint on pre-push
```

- [ ] **Step 2: Record today's counts.** From `apps/web`:

```bash
D=src/features/studio/components
bunx eslint -f json $D/CustomizeAudioModal.tsx $D/CustomizeFlashcardsModal.tsx $D/CustomizeInfographicModal.tsx $D/CustomizeMindMapModal.tsx $D/CustomizeQuizModal.tsx $D/CustomizeReportModal.tsx $D/CustomizeSpreadsheetsModal.tsx $D/CustomizeWrittenQuestionsModal.tsx $D/DiscoverStudioPromptsModal.tsx $D/SaveAsPromptModal.tsx $D/StudioModalDiscoverPromptsButton.tsx $D/CitePaperModal.tsx $D/CitationStylePicker.tsx > /tmp/dialogs-before.json; echo $?
```

Expected: exit 0, with 129 findings in total:
- `no-arbitrary-values` 56, `soft-surfaces` 52, `no-raw-colors` 14, `no-inline-styles` 4 and `no-unknown-classes` 3;
- Infographic 59, Discover 19, Audio 10, Written 10, SaveAs 9, Report 7, Spreadsheets 7, Cite 3, Button 3, Quiz 1, Flashcards 1, MindMap 0, Picker 0.

`design-lint-baseline.json` has `features/studio` = 95 + 5 + 28 + 7 + 67 = 202. No commit.

---

### Task 1: Save as Prompt on `Dialog`

**Files:**
- Create: `apps/web/src/features/studio/components/customize/dialogTheme.ts`
- Rewrite: `apps/web/src/features/studio/components/SaveAsPromptModal.tsx`
- Rewrite: `apps/web/src/features/studio/components/SaveAsPromptModal.test.tsx`
- Modify: `e2e/studio/prompt-library.spec.ts` (Save as Prompt part)

**What changes:**
- **Dialog:**
  - The hand-rolled overlay (`z-[130]`, `bg-black/60`, `max-h-[85vh]`) becomes `Dialog`.
  - `isOpen`, `onClose`, `studioTool`, `initialPromptText` and `notebookId` keep their meaning.
  - New optional `trigger` + `onOpen`. `PromptField` (Task 4) passes its button, so Radix returns focus there when the dialog closes.
- **Form state:**
  - The form lives inside `DialogContent`, so each open starts from `initialPromptText`.
  - **Bug fixed:** today `if (isOpen && promptText !== initialPromptText) setPromptText(initialPromptText)` runs on every render, so typing in "Prompt Text" snaps straight back.
- **Visibility:**
  - The hand-rolled `role="switch"` becomes the `Checkbox` primitive, with a static label "Share in the public library" and the same two descriptions. The project has no `Switch` primitive (Decision 5).
  - It keeps `data-testid="save-as-prompt-visibility-toggle"`; Radix Checkbox renders `aria-checked`.
- **Counters:** the `text-[11px]` counters become `text-xs`. The prompt text loses `font-mono` (it's content, so serif).

- [ ] **Step 1: Create `customize/dialogTheme.ts`.**

```ts
import { createContext, useContext } from "react";

/** `light` pins the light-theme tokens (`.auth-form-light`) on a dialog that portals to <body>. */
export type StudioDialogTheme = "default" | "light";

export const StudioDialogThemeContext = createContext<StudioDialogTheme>("default");

/**
 * The theme of the Customize dialog around a nested prompt dialog (Discover, Save as prompt), so
 * on the always-light auth page both use light tokens.
 */
export function useStudioDialogTheme(): StudioDialogTheme {
  return useContext(StudioDialogThemeContext);
}
```

- [ ] **Step 2: Write the new test file**, replacing `SaveAsPromptModal.test.tsx` completely:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioTool } from "../services/promptsApi";
import { SaveAsPromptModal } from "./SaveAsPromptModal";

const api = vi.hoisted(() => ({
  createPrompt: vi.fn(),
  publishPrompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../services/promptsApi", () => ({
  useCreatePrompt: () => api.createPrompt,
  usePublishPrompt: () => api.publishPrompt,
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: api.success, error: api.error }),
}));

const onClose = vi.fn();

function renderOpen(initialPromptText = "Focus on key concepts", studioTool: StudioTool = "flashcards") {
  return render(
    <SaveAsPromptModal
      isOpen
      onClose={onClose}
      studioTool={studioTool}
      initialPromptText={initialPromptText}
    />
  );
}

const titleInput = () => screen.getByPlaceholderText(/e.g., Focus on key concepts/);
const promptBox = () => screen.getByPlaceholderText(/Enter your custom prompt/);
const saveButton = () => screen.getByRole("button", { name: /Save Prompt/i });

beforeEach(() => {
  vi.clearAllMocks();
  api.createPrompt.mockResolvedValue("prompt123");
  api.publishPrompt.mockResolvedValue(undefined);
});

describe("SaveAsPromptModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SaveAsPromptModal
        isOpen={false}
        onClose={onClose}
        studioTool="flashcards"
        initialPromptText="x"
      />
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens prefilled with the Customize dialog's text and its tool", () => {
    renderOpen("Focus on key concepts for exam prep");
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Flashcards");
    expect(promptBox()).toHaveValue("Focus on key concepts for exam prep");
  });

  it("labels each studio tool", () => {
    const { rerender } = renderOpen("Test", "report");
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Reports");
    rerender(<SaveAsPromptModal isOpen onClose={onClose} studioTool="quiz" initialPromptText="Test" />);
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Quizzes");
    rerender(<SaveAsPromptModal isOpen onClose={onClose} studioTool="audio" initialPromptText="Test" />);
    expect(screen.getByTestId("save-as-prompt-tool-label")).toHaveTextContent("Audio");
  });

  it("lets the prompt text be edited", async () => {
    const user = userEvent.setup();
    renderOpen("Start");
    await user.type(promptBox(), " and more");
    expect(promptBox()).toHaveValue("Start and more");
  });

  it("shows character counts", () => {
    renderOpen("Initial prompt text");
    expect(screen.getByText("0/100")).toBeInTheDocument();
    expect(screen.getByText("0/300")).toBeInTheDocument();
    expect(screen.getByText("19/2000")).toBeInTheDocument();
  });

  it("keeps Save disabled until there is a title and a prompt", async () => {
    const user = userEvent.setup();
    renderOpen("Valid prompt text");
    expect(saveButton()).toBeDisabled();
    await user.type(titleInput(), "My Prompt");
    expect(saveButton()).toBeEnabled();
  });

  it("keeps Save disabled when the prompt text is empty", async () => {
    const user = userEvent.setup();
    renderOpen("");
    await user.type(titleInput(), "My Title");
    expect(saveButton()).toBeDisabled();
  });

  it("switches between private and public", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    const toggle = screen.getByTestId("save-as-prompt-visibility-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Only you can see and use this prompt/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Anyone can discover and use this prompt/)).toBeInTheDocument();
    expect(screen.getByText(/Your prompt will be visible in the public library/)).toBeInTheDocument();
  });

  it("saves a private prompt with trimmed fields, then closes", async () => {
    const user = userEvent.setup();
    renderOpen("  Prompt body  ");
    await user.type(titleInput(), "  My prompt  ");
    await user.click(saveButton());
    expect(api.createPrompt).toHaveBeenCalledWith({
      title: "My prompt",
      description: undefined,
      promptText: "Prompt body",
      studioTool: "flashcards",
      notebookId: undefined,
    });
    expect(api.publishPrompt).not.toHaveBeenCalled();
    expect(api.success).toHaveBeenCalledWith("Prompt saved to your library!");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("publishes the saved prompt when shared publicly", async () => {
    const user = userEvent.setup();
    renderOpen("Prompt body");
    await user.type(titleInput(), "Shared");
    await user.click(screen.getByTestId("save-as-prompt-visibility-toggle"));
    await user.click(saveButton());
    expect(api.publishPrompt).toHaveBeenCalledWith("prompt123");
    expect(api.success).toHaveBeenCalledWith("Prompt saved and published to the library!");
  });

  it("closes from Cancel, the close button and Escape", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByTestId("save-as-prompt-close"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("caps the title, description and prompt lengths", async () => {
    const user = userEvent.setup();
    renderOpen("Test");
    await user.type(titleInput(), "x".repeat(101));
    expect(titleInput()).toHaveValue("x".repeat(100));
    expect(screen.getByText("100/100")).toBeInTheDocument();
    const description = screen.getByPlaceholderText(/Briefly describe/);
    fireEvent.change(description, { target: { value: "y".repeat(300) } });
    expect(screen.getByText("300/300")).toBeInTheDocument();
    expect(promptBox()).toHaveAttribute("maxlength", "2000");
  });
});
```

- [ ] **Step 3: Run it and make sure it fails.** `bun run test src/features/studio/components/SaveAsPromptModal.test.tsx`. Expected: FAIL (no `dialog` role, no `aria-checked` on the old switch, and the edit snaps back).

- [ ] **Step 4: Rewrite `SaveAsPromptModal.tsx`.**

```tsx
import { Bookmark, Eye, X } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/contexts/useToast";
import { type StudioTool, useCreatePrompt, usePublishPrompt } from "../services/promptsApi";
import { useStudioDialogTheme } from "./customize/dialogTheme";

interface SaveAsPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTool: StudioTool;
  /** Pre-filled prompt text from the Customize dialog. */
  initialPromptText: string;
  /** Optional notebook ID to associate with the prompt. */
  notebookId?: string;
  /** The button that opens it. Radix returns focus there when the dialog closes. */
  trigger?: React.ReactElement;
  /** Called when `trigger` is clicked. */
  onOpen?: () => void;
}

const TOOL_LABELS: Record<StudioTool, string> = {
  report: "Reports",
  spreadsheet: "Spreadsheets",
  infographic: "Infographics",
  flashcards: "Flashcards",
  quiz: "Quizzes",
  audio: "Audio",
  writtenQuestions: "Written Questions",
  mindmap: "Mind Maps",
};

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 300;
const PROMPT_MAX = 2000;

export const SaveAsPromptModal: React.FC<SaveAsPromptModalProps> = ({
  isOpen,
  onClose,
  studioTool,
  initialPromptText,
  notebookId,
  trigger,
  onOpen,
}) => {
  const theme = useStudioDialogTheme();
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        else onClose();
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        data-testid="save-as-prompt-modal"
        showCloseButton={false}
        size="wide"
        padding="none"
        theme={theme}
        className="sm:max-w-lg"
      >
        <SavePromptForm
          studioTool={studioTool}
          initialPromptText={initialPromptText}
          notebookId={notebookId}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
};

interface SavePromptFormProps {
  studioTool: StudioTool;
  initialPromptText: string;
  notebookId?: string;
  onClose: () => void;
}

// Lives inside DialogContent, which Radix unmounts on close: every open starts from the Customize
// dialog's current text, and edits made here stick.
function SavePromptForm({ studioTool, initialPromptText, notebookId, onClose }: SavePromptFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState(initialPromptText);
  const [makePublic, setMakePublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const createPrompt = useCreatePrompt();
  const publishPrompt = usePublishPrompt();
  const { success, error: showError } = useToast();
  const id = useId();

  const handleSave = async () => {
    if (!title.trim()) {
      showError("Please enter a title");
      return;
    }
    if (!promptText.trim()) {
      showError("Please enter prompt text");
      return;
    }
    setIsSaving(true);
    try {
      // Create the prompt (always private at first), then publish it if asked.
      const promptId = await createPrompt({
        title: title.trim(),
        description: description.trim() || undefined,
        promptText: promptText.trim(),
        studioTool,
        notebookId,
      });
      if (makePublic && promptId) {
        await publishPrompt(promptId);
        success("Prompt saved and published to the library!");
      } else {
        success("Prompt saved to your library!");
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-start gap-3 px-6 pt-6 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p data-testid="save-as-prompt-tool-label" className="font-sans text-xs text-muted-foreground">
            {TOOL_LABELS[studioTool]}
          </p>
          <DialogTitle>Save as Prompt</DialogTitle>
          <DialogDescription>Keep it in your library to reuse later.</DialogDescription>
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close" data-testid="save-as-prompt-close">
            <X />
          </Button>
        </DialogClose>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-title`}>
              Title <span aria-hidden className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Focus on key concepts for exam prep"
              maxLength={TITLE_MAX}
              required
            />
            <CharacterCount length={title.length} max={TITLE_MAX} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-description`}>Description (optional)</FieldLabel>
            <Input
              id={`${id}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this prompt does..."
              maxLength={DESCRIPTION_MAX}
            />
            <CharacterCount length={description.length} max={DESCRIPTION_MAX} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-prompt`}>
              Prompt text <span aria-hidden className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id={`${id}-prompt`}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter your custom prompt..."
              maxLength={PROMPT_MAX}
              className="h-32 resize-none"
            />
            <CharacterCount length={promptText.length} max={PROMPT_MAX} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-public`}
              data-testid="save-as-prompt-visibility-toggle"
              checked={makePublic}
              onCheckedChange={(checked) => setMakePublic(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${id}-public`}>Share in the public library</FieldLabel>
              <FieldDescription>
                {makePublic
                  ? "Anyone can discover and use this prompt"
                  : "Only you can see and use this prompt"}
              </FieldDescription>
            </FieldContent>
          </Field>
          {makePublic && (
            <Alert>
              <Eye />
              <AlertDescription>
                Your prompt will be visible in the public library. Other users can save and rate it.
                You can always unpublish it later from the "My Prompts" tab.
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </div>

      <div className="px-6 pt-2 pb-6">
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving || !title.trim() || !promptText.trim()}
          >
            {isSaving ? <Spinner data-icon="inline-start" /> : <Bookmark data-icon="inline-start" />}
            {isSaving ? "Saving..." : "Save Prompt"}
          </Button>
        </DialogFooter>
      </div>
    </>
  );
}

function CharacterCount({ length, max }: { length: number; max: number }) {
  return (
    <p className="text-right font-sans text-xs tabular-nums text-muted-foreground">{`${length}/${max}`}</p>
  );
}
```

- [ ] **Step 5: Update `e2e/studio/prompt-library.spec.ts`** (the Save as Prompt describe block).
  - **Line 112:** delete `await expect(page.getByText("Private")).toBeVisible();`. The description check on the next line covers the state.
  - **Line 122:** delete `await expect(page.getByText("Public")).toBeVisible();`. Both lines were strict-mode hazards anyway, because "Public" also appears as a substring of the hint.
  - **Line 148:** replace `await page.getByRole("button", { name: "Cancel" }).click();` with:

```ts
      await page
        .getByRole("dialog", { name: /save as prompt/i })
        .getByRole("button", { name: "Cancel" })
        .click();
```

- [ ] **Step 6: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components/SaveAsPromptModal.test.tsx src/features/studio/components/CustomizeMindMapModal.test.tsx`. Expected: PASS. The MindMap test still passes: it uses `isOpen`/`onClose` without `trigger`.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/SaveAsPromptModal.tsx`. Expected: no output.
  - From the root: `bun run typecheck:web`.
  - From the root: `bunx playwright test --list e2e/studio/prompt-library.spec.ts`. Expected: it lists the tests with no compile error.
- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/studio/components/customize/dialogTheme.ts apps/web/src/features/studio/components/SaveAsPromptModal.tsx apps/web/src/features/studio/components/SaveAsPromptModal.test.tsx e2e/studio/prompt-library.spec.ts
git commit -m "feat(studio): Save as prompt is a real dialog, and its prompt text can be edited" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prompt library (Discover) on `Dialog` + `Tabs`

**Files:**
- Rewrite: `apps/web/src/features/studio/components/DiscoverStudioPromptsModal.tsx`
- Rewrite: `apps/web/src/features/studio/components/StudioModalDiscoverPromptsButton.tsx`
- Create: `apps/web/src/features/studio/components/DiscoverStudioPromptsModal.test.tsx`
- Modify: `e2e/studio/prompt-library.spec.ts` (Discover part)

**What changes:**
- **API:**
  - `DiscoverStudioPromptsModal` becomes uncontrolled, with a `trigger` prop: `{ studioTool, onApplyPrompt, trigger }`.
  - Its only caller is `StudioModalDiscoverPromptsButton`, whose props (`studioTool`, `onApplyPrompt`) are unchanged.
- **Layout:**
  - The underline tabs become `Tabs` + `TabsList variant="line"`.
  - The hand-rolled sort menu becomes `Select`; search becomes `InputGroup`; cards become `Item variant="outline"`.
  - Loading uses `Spinner`; empty states use `Empty`.
  - The 10–11px text becomes `text-xs`, and the yellow star hover is dropped.
- **Behaviour kept:**
  - "Use" fills the parent's prompt and closes.
  - Save, rate, report, publish and unpublish work as before, including the toasts.
- **Delete asks first:**
  - Deleting one of "My Prompts" opens an `AlertDialog`: "Delete this prompt?" with Cancel and a destructive Delete.
  - Only Delete runs the mutation. It's a third nested layer, over the library and the Customize dialog, and Radix stacks it like the others.
- **Behaviour changed:**
  - Rating and reporting rows are per card now (before, one at a time across the list).
  - Tab, search and sort reset on each open.

- [ ] **Step 1: Write the failing test** `DiscoverStudioPromptsModal.test.tsx`:

```tsx
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
});
```

- [ ] **Step 2: Run it and make sure it fails.** `bun run test src/features/studio/components/DiscoverStudioPromptsModal.test.tsx`. Expected: FAIL (the `trigger` prop doesn't exist).

- [ ] **Step 3: Rewrite `DiscoverStudioPromptsModal.tsx`.**

```tsx
import {
  Bookmark,
  Eye,
  EyeOff,
  Flag,
  Library,
  MessageSquareQuote,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@/shared/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useToast } from "@/shared/contexts/useToast";
import {
  type PromptSortBy,
  type PublicPrompt,
  type StudioTool,
  useDeletePrompt,
  useMyPrompts,
  usePublicPrompts,
  usePublishPrompt,
  useRatePrompt,
  useReportPrompt,
  useSavePublicPrompt,
  useUnpublishPrompt,
} from "../services/promptsApi";
import { useStudioDialogTheme } from "./customize/dialogTheme";

interface DiscoverStudioPromptsModalProps {
  studioTool: StudioTool;
  /** Fills the Customize dialog's prompt field; the library then closes. */
  onApplyPrompt: (promptText: string) => void;
  /** The button that opens the library. Radix returns focus to it on close. */
  trigger: React.ReactElement;
}

const SORT_OPTIONS: { value: PromptSortBy; label: string }[] = [
  { value: "saves", label: "Most saved" },
  { value: "rating", label: "Highest rated" },
  { value: "newest", label: "Newest" },
];

const TOOL_LABELS: Record<StudioTool, string> = {
  report: "Reports",
  spreadsheet: "Spreadsheets",
  infographic: "Infographics",
  flashcards: "Flashcards",
  quiz: "Quizzes",
  audio: "Audio",
  writtenQuestions: "Written Questions",
  mindmap: "Mind Maps",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function DiscoverStudioPromptsModal({
  studioTool,
  onApplyPrompt,
  trigger,
}: DiscoverStudioPromptsModalProps) {
  const [open, setOpen] = useState(false);
  const theme = useStudioDialogTheme();
  const apply = (promptText: string) => {
    onApplyPrompt(promptText);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="wide" padding="none" theme={theme}>
        <div className="flex flex-col gap-1 px-6 pt-6 pr-12">
          <p className="font-sans text-xs text-muted-foreground">{TOOL_LABELS[studioTool]}</p>
          <DialogTitle>Prompt library</DialogTitle>
          <DialogDescription>Use a prompt someone shared, or one you saved.</DialogDescription>
        </div>
        <PromptLibrary studioTool={studioTool} onApply={apply} />
      </DialogContent>
    </Dialog>
  );
}

// Inside DialogContent: the tab, search and sort start fresh on each open.
function PromptLibrary({
  studioTool,
  onApply,
}: {
  studioTool: StudioTool;
  onApply: (promptText: string) => void;
}) {
  const [tab, setTab] = useState<"public" | "my">("public");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<PromptSortBy>("saves");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value === "my" ? "my" : "public")}
      className="mt-4 min-h-0 flex-1 gap-0"
    >
      <TabsList variant="line" className="mx-6">
        <TabsTrigger value="public" data-testid="discover-prompts-tab-public">
          <Library />
          Public
        </TabsTrigger>
        <TabsTrigger value="my" data-testid="discover-prompts-tab-my">
          <Bookmark />
          My Prompts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="public" className="flex min-h-0 flex-col">
        <div className="flex items-center gap-3 px-6 py-3">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              aria-label="Search prompts"
            />
          </InputGroup>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as PromptSortBy)}>
            <SelectTrigger aria-label="Sort prompts">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <PublicPromptsList
            studioTool={studioTool}
            sortBy={sortBy}
            searchQuery={searchQuery}
            onApply={onApply}
          />
        </div>
      </TabsContent>
      <TabsContent value="my" className="min-h-0 overflow-y-auto">
        <div className="px-6 pt-3 pb-6">
          <MyPromptsList studioTool={studioTool} onApply={onApply} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

/** Runs a prompt mutation and reports the outcome as a toast. */
function usePromptAction() {
  const { success, error: showError } = useToast();
  return async (action: () => Promise<unknown>, done: string, failed: string) => {
    try {
      await action();
      success(done);
    } catch (err) {
      showError(err instanceof Error ? err.message : failed);
    }
  };
}

function LoadingPrompts({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 font-sans text-sm text-muted-foreground"
    >
      <Spinner />
      {label}
    </div>
  );
}

function PromptPreview({ text }: { text: string }) {
  return (
    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
      {truncate(text, 120)}
    </p>
  );
}

function PublicPromptsList({
  studioTool,
  sortBy,
  searchQuery,
  onApply,
}: {
  studioTool: StudioTool;
  sortBy: PromptSortBy;
  searchQuery: string;
  onApply: (promptText: string) => void;
}) {
  const trimmedQuery = searchQuery.trim() || undefined;
  const result = usePublicPrompts(studioTool, sortBy, trimmedQuery);
  const savePrompt = useSavePublicPrompt();
  const ratePrompt = useRatePrompt();
  const reportPrompt = useReportPrompt();
  const run = usePromptAction();

  if (result === undefined) return <LoadingPrompts label="Loading prompts..." />;
  const prompts = (result.page as PublicPrompt[] | undefined) ?? [];
  if (prompts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareQuote />
          </EmptyMedia>
          <EmptyTitle>
            {trimmedQuery ? "No prompts match your search" : "No public prompts yet for this tool"}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {prompts.map((prompt) => (
        <li key={prompt._id}>
          <PublicPromptCard
            prompt={prompt}
            onUse={() => onApply(prompt.promptText)}
            onSave={() =>
              void run(() => savePrompt(prompt._id), "Prompt saved to your library", "Failed to save prompt")
            }
            onRate={(rating) =>
              void run(() => ratePrompt(prompt._id, rating), "Rating submitted", "Failed to rate prompt")
            }
            onReport={() =>
              void run(() => reportPrompt(prompt._id), "Prompt reported", "Failed to report prompt")
            }
          />
        </li>
      ))}
    </ul>
  );
}

function PublicPromptCard({
  prompt,
  onUse,
  onSave,
  onRate,
  onReport,
}: {
  prompt: PublicPrompt;
  onUse: () => void;
  onSave: () => void;
  onRate: (rating: number) => void;
  onReport: () => void;
}) {
  const [mode, setMode] = useState<"actions" | "rating" | "reporting">("actions");
  const done = () => setMode("actions");

  let footer: React.ReactNode;
  if (mode === "rating") {
    footer = (
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 font-sans text-xs text-muted-foreground">Rate:</span>
        {[1, 2, 3, 4, 5].map((rating) => (
          <Button
            key={rating}
            variant="ghost"
            size="icon-sm"
            aria-label={`Rate ${rating} out of 5`}
            onClick={() => {
              onRate(rating);
              done();
            }}
          >
            <Star />
          </Button>
        ))}
        <Button variant="ghost" size="xs" onClick={done}>
          Cancel
        </Button>
      </div>
    );
  } else if (mode === "reporting") {
    footer = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-sans text-xs text-muted-foreground">Report this prompt?</span>
        <Button
          variant="ghost-destructive"
          size="xs"
          onClick={() => {
            onReport();
            done();
          }}
        >
          Confirm
        </Button>
        <Button variant="ghost" size="xs" onClick={done}>
          Cancel
        </Button>
      </div>
    );
  } else {
    footer = (
      <>
        <div className="flex items-center gap-3 font-sans text-xs tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Bookmark aria-hidden className="size-3" />
            {formatCount(prompt.saveCount)}
            <span className="sr-only"> saves</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Star aria-hidden className="size-3" />
            {prompt.ratingAverage?.toFixed(1) ?? "—"}
            <span className="sr-only"> average rating</span>
          </span>
        </div>
        <ItemActions>
          <Button variant="secondary" size="xs" onClick={onUse}>
            Use
          </Button>
          <Button variant="ghost" size="xs" onClick={onSave}>
            <Bookmark data-icon="inline-start" />
            Save
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Rate this prompt" onClick={() => setMode("rating")}>
            <Star />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Report this prompt" onClick={() => setMode("reporting")}>
            <Flag />
          </Button>
        </ItemActions>
      </>
    );
  }

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{prompt.title}</ItemTitle>
        {prompt.description && <ItemDescription>{prompt.description}</ItemDescription>}
        <PromptPreview text={prompt.promptText} />
      </ItemContent>
      <ItemFooter>{footer}</ItemFooter>
    </Item>
  );
}

function MyPromptsList({
  studioTool,
  onApply,
}: {
  studioTool: StudioTool;
  onApply: (promptText: string) => void;
}) {
  const result = useMyPrompts(studioTool);
  const publishPrompt = usePublishPrompt();
  const unpublishPrompt = useUnpublishPrompt();
  const deletePrompt = useDeletePrompt();
  const run = usePromptAction();

  if (result === undefined) return <LoadingPrompts label="Loading your prompts..." />;
  const prompts = (result.page as PublicPrompt[] | undefined) ?? [];
  if (prompts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bookmark />
          </EmptyMedia>
          <EmptyTitle>You haven&apos;t saved any prompts yet</EmptyTitle>
          <EmptyDescription>Browse the Public tab to discover and save prompts</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {prompts.map((prompt) => (
        <li key={prompt._id}>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>
                {prompt.title}
                {prompt.visibility === "public" && <Badge variant="secondary">Public</Badge>}
                {prompt.sourcePromptId && <Badge variant="outline">Saved copy</Badge>}
              </ItemTitle>
              <PromptPreview text={prompt.promptText} />
            </ItemContent>
            <ItemFooter>
              <ItemActions>
                <Button variant="secondary" size="xs" onClick={() => onApply(prompt.promptText)}>
                  Use
                </Button>
                {prompt.visibility === "private" ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void run(() => publishPrompt(prompt._id), "Prompt published", "Failed to publish")
                    }
                  >
                    <Eye data-icon="inline-start" />
                    Publish
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void run(() => unpublishPrompt(prompt._id), "Prompt unpublished", "Failed to unpublish")
                    }
                  >
                    <EyeOff data-icon="inline-start" />
                    Unpublish
                  </Button>
                )}
              </ItemActions>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost-destructive" size="icon-sm" aria-label="Delete prompt">
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &ldquo;{prompt.title}&rdquo; is removed from your library. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() =>
                        void run(() => deletePrompt(prompt._id), "Prompt deleted", "Failed to delete")
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </ItemFooter>
          </Item>
        </li>
      ))}
    </ul>
  );
}
```

  - `PublicPrompt._id` is already `Id<"studioPrompts">`, so the mutations need no cast and the old `Id` import goes.
  - The delete confirmation is the `AlertDialogAction variant="destructive"` pattern from `/dev/design` (`DeleteNotebookAlert` in `DesignGallery.tsx`).
  - Keep the toast wording exactly as in the old file.

- [ ] **Step 4: Rewrite `StudioModalDiscoverPromptsButton.tsx`.**

```tsx
import { Compass } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { StudioTool } from "../services/promptsApi";
import { DiscoverStudioPromptsModal } from "./DiscoverStudioPromptsModal";

interface StudioModalDiscoverPromptsButtonProps {
  studioTool: StudioTool;
  onApplyPrompt: (promptText: string) => void;
}

/** Opens the prompt library from a Customize dialog; a chosen prompt fills that dialog's prompt. */
export function StudioModalDiscoverPromptsButton({
  studioTool,
  onApplyPrompt,
}: StudioModalDiscoverPromptsButtonProps) {
  return (
    <DiscoverStudioPromptsModal
      studioTool={studioTool}
      onApplyPrompt={onApplyPrompt}
      trigger={
        <Button variant="outline" size="sm">
          <Compass data-icon="inline-start" />
          {/* Icon-only on phones, where the dialog header is narrow; the name stays for screen readers. */}
          <span className="max-sm:sr-only">Discover Prompts</span>
        </Button>
      }
    />
  );
}
```

- [ ] **Step 5: Update `e2e/studio/prompt-library.spec.ts`** (the Discover Prompts describe block).
  - **Lines 196–200:** replace the three assertions after the heading check with:

```ts
      const library = page.getByRole("dialog", { name: /prompt library/i });
      await expect(library.getByText("Flashcards", { exact: true })).toBeVisible();

      // Should have Public and My Prompts tabs
      await expect(library.getByRole("tab", { name: "Public" })).toBeVisible();
      await expect(library.getByRole("tab", { name: "My Prompts" })).toBeVisible();
```

  - **Line 213:** replace it with `await page.getByRole("tab", { name: "Public" }).click();`. Today's `getByRole("button", { name: /public/i })` can't match a `role="tab"` element.
  - **Line 219:** replace it with `await expect(page.getByRole("combobox", { name: "Sort prompts" })).toHaveText(/most saved/i);`.
- [ ] **Step 6: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components/DiscoverStudioPromptsModal.test.tsx src/features/studio/components/CustomizeMindMapModal.test.tsx`. Expected: PASS.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/DiscoverStudioPromptsModal.tsx src/features/studio/components/StudioModalDiscoverPromptsButton.tsx`. Expected: no output.
  - From the root: `bun run typecheck:web`, then `bunx playwright test --list e2e/studio/prompt-library.spec.ts`.
- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/features/studio/components/DiscoverStudioPromptsModal.tsx apps/web/src/features/studio/components/DiscoverStudioPromptsModal.test.tsx apps/web/src/features/studio/components/StudioModalDiscoverPromptsButton.tsx e2e/studio/prompt-library.spec.ts
git commit -m "feat(studio): the prompt library is a dialog with tabs, a select and item cards; deleting asks first" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Customize shell

**Files:**
- Modify: `apps/web/src/features/studio/studioTypeStyle.ts` and `studioTypeStyle.test.ts`
- Create: `apps/web/src/features/studio/components/customize/StudioCustomizeDialog.tsx`
- Test: `apps/web/src/features/studio/components/customize/StudioCustomizeDialog.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - In `studioTypeStyle.test.ts`, add `studioTypeStyleForKey` to the import, then add:

```ts
  it("styles a type by key, for the Customize dialog headers", () => {
    const style = studioTypeStyleForKey("quiz");
    expect(style.tileClass).toBe("bg-studio-quiz/10 text-studio-quiz");
    expect(style.icon).toBe(HelpCircle);
  });
```

  (Add `HelpCircle` to the `lucide-react` import.)

  - Create `customize/StudioCustomizeDialog.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./StudioCustomizeDialog";

vi.mock("../StudioModalDiscoverPromptsButton", () => ({
  StudioModalDiscoverPromptsButton: ({ onApplyPrompt }: { onApplyPrompt: (text: string) => void }) => (
    <button type="button" onClick={() => onApplyPrompt("from library")}>
      Discover Prompts
    </button>
  ),
}));

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Clicked {n}
    </button>
  );
}

function Form({ onApplied = vi.fn(), onBack }: { onApplied?: (t: string) => void; onBack?: () => void }) {
  return (
    <>
      <StudioCustomizeHeader
        kind="quiz"
        title="Customize Quiz"
        description="Pick options."
        promptLibrary={{ studioTool: "quiz", onApplyPrompt: onApplied }}
        onBack={onBack}
      />
      <StudioCustomizeBody>
        <Counter />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <button type="button">Generate Quiz</button>
      </StudioCustomizeFooter>
    </>
  );
}

describe("StudioCustomizeDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <StudioCustomizeDialog open={false} onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a dialog named by its title and described by its description", () => {
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Customize Quiz" });
    expect(dialog).toHaveAccessibleDescription("Pick options.");
    expect(within(dialog).getByRole("button", { name: "Generate Quiz" })).toBeInTheDocument();
  });

  it("closes from Close, Cancel and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={onClose}>
        <Form />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("hands a library prompt to the form", async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form onApplied={onApplied} />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(onApplied).toHaveBeenCalledWith("from library");
  });

  it("shows Back on a second step", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form onBack={onBack} />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Back to formats" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("starts the form fresh on every open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    await user.click(screen.getByRole("button", { name: "Clicked 0" }));
    expect(screen.getByRole("button", { name: "Clicked 1" })).toBeInTheDocument();
    rerender(
      <StudioCustomizeDialog open={false} onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    rerender(
      <StudioCustomizeDialog open onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.getByRole("button", { name: "Clicked 0" })).toBeInTheDocument();
  });

  it("renders inside its positioned parent when embedded, with no page overlay", async () => {
    render(
      <div data-testid="mock-frame" className="relative">
        <StudioCustomizeDialog open embedded onClose={vi.fn()}>
          <Form />
        </StudioCustomizeDialog>
      </div>
    );
    const mock = screen.getByTestId("mock-frame");
    expect(await within(mock).findByRole("dialog", { name: "Customize Quiz" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=dialog-overlay]")).toBeNull();
  });

  it("hides the prompt library in previews", () => {
    render(
      <StudioCustomizeDialog open preview onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Quiz" })).toBeInTheDocument();
  });

  it("pins light tokens for the auth page", async () => {
    render(
      <StudioCustomizeDialog open theme="light" onClose={vi.fn()}>
        <Form />
      </StudioCustomizeDialog>
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Customize Quiz" })).toHaveClass("auth-form-light")
    );
  });
});
```

- [ ] **Step 2: Run them and make sure they fail.** From `apps/web`: `bun run test src/features/studio/studioTypeStyle.test.ts src/features/studio/components/customize/StudioCustomizeDialog.test.tsx`. Expected: FAIL (the exports are missing).

- [ ] **Step 3: Implement `studioTypeStyle.ts`.**
  - Change `type StudioTypeKey =` to `export type StudioTypeKey =`.
  - Append:

```ts
/** Icon and colour classes for a Studio type key (the Customize dialogs' header tiles). */
export function studioTypeStyleForKey(key: StudioTypeKey): StudioTypeStyle {
  return STYLES[key];
}
```

- [ ] **Step 4: Create `customize/StudioCustomizeDialog.tsx`.**

```tsx
import { ChevronLeft, X } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FieldGroup } from "@/shared/components/ui/field";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import { type StudioTypeKey, studioTypeStyleForKey } from "../../studioTypeStyle";
import { StudioModalDiscoverPromptsButton } from "../StudioModalDiscoverPromptsButton";
import { type StudioDialogTheme, StudioDialogThemeContext } from "./dialogTheme";

const PreviewContext = createContext(false);

/**
 * True inside a marketing preview (the landing and sign-in mock-ups). There, the header drops
 * "Discover Prompts" and PromptField drops "Save as reusable prompt": both need a signed-in library.
 */
export function useStudioCustomizePreview(): boolean {
  return useContext(PreviewContext);
}

interface StudioCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Preview mock-ups (the landing hero): the dialog opens inside the nearest positioned ancestor,
   * non-modal, instead of covering the page.
   */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page); the dialog portals to <body>. */
  theme?: StudioDialogTheme;
  /**
   * A marketing preview (landing and sign-in mock-ups): hides the prompt-library actions. It's
   * separate from `embedded`, because the sign-in page's previews open full-screen.
   */
  preview?: boolean;
  /** The wider panel, for dialogs with a grid of format or style cards. */
  wide?: boolean;
  /** The dialog's form. Mounted only while open, so every open starts from its defaults. */
  children: ReactNode;
}

/** The shell every Studio Customize dialog shares. Children render the header, body and footer. */
export function StudioCustomizeDialog({
  open,
  onClose,
  embedded = false,
  theme = "default",
  preview = false,
  wide = false,
  children,
}: StudioCustomizeDialogProps) {
  // Embedded: a frame over the mock-up that the dialog portals into. Its translate makes it the
  // containing block for the content's `position: fixed`, so the dialog centres in the mock-up
  // (the /dev/design Frame trick). It paints the scrim itself, since non-modal Radix dialogs draw
  // none, and stays mounted so the closing fade has somewhere to render.
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  return (
    <>
      {embedded && (
        <div
          ref={setFrame}
          data-slot="studio-customize-frame"
          className={cn(
            "absolute inset-0 z-50 translate-x-0",
            open
              ? "bg-overlay backdrop-blur-xs duration-200 animate-in fade-in-0"
              : "pointer-events-none"
          )}
        />
      )}
      <Dialog
        open={open && (!embedded || frame !== null)}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        modal={!embedded}
      >
        <DialogContent
          container={embedded ? frame : undefined}
          showCloseButton={false}
          size="wide"
          padding="none"
          theme={theme}
          className={cn(wide && "sm:max-w-4xl")}
        >
          <StudioDialogThemeContext.Provider value={theme}>
            <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
          </StudioDialogThemeContext.Provider>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface StudioCustomizeHeaderProps {
  kind: StudioTypeKey;
  /** Kept word for word: e2e tests find the dialogs by these headings. */
  title: string;
  description: string;
  /** Adds "Discover Prompts" (not in previews); a chosen library prompt goes to `onApplyPrompt`. */
  promptLibrary?: { studioTool: StudioTool; onApplyPrompt: (promptText: string) => void };
  /** The second step of a two-step dialog: a Back button before the icon. */
  onBack?: () => void;
}

export function StudioCustomizeHeader({
  kind,
  title,
  description,
  promptLibrary,
  onBack,
}: StudioCustomizeHeaderProps) {
  const { icon: Icon, tileClass } = studioTypeStyleForKey(kind);
  const preview = useStudioCustomizePreview();
  return (
    <div className="flex items-start gap-3 px-6 pt-6 pb-4">
      {onBack && (
        <Button variant="ghost" size="icon-sm" aria-label="Back to formats" onClick={onBack}>
          <ChevronLeft />
        </Button>
      )}
      <span
        aria-hidden
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tileClass)}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {promptLibrary && !preview && (
          <StudioModalDiscoverPromptsButton
            studioTool={promptLibrary.studioTool}
            onApplyPrompt={promptLibrary.onApplyPrompt}
          />
        )}
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X />
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}

/** The scrolling middle of a Customize dialog; its children are form fields. */
export function StudioCustomizeBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-4">
      <FieldGroup>{children}</FieldGroup>
    </div>
  );
}

/** Cancel, then the dialog's Generate button (its children). */
export function StudioCustomizeFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 pt-2 pb-6">
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        {children}
      </DialogFooter>
    </div>
  );
}
```

  - **How `embedded` works:**
    - In the landing hero, each Customize component is a direct child of the mock-up root, `div.relative.isolate.overflow-hidden` (`LandingHeroMockup.tsx` around line 171). So the frame's `absolute inset-0` covers exactly the mock-up.
    - `frame` is set from the ref callback on the first commit. The `open && frame !== null` guard stops Radix from falling back to `document.body` for a null container.
    - Non-modal Radix dialogs still close on Escape and on a pointer-down outside the content, and a click on the frame's scrim counts as outside.
- [ ] **Step 5: Run the tests until they pass**, then:
  - from `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/customize/StudioCustomizeDialog.tsx`;
  - from the root: `bun run typecheck:web`.
- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/features/studio/studioTypeStyle.ts apps/web/src/features/studio/studioTypeStyle.test.ts apps/web/src/features/studio/components/customize/StudioCustomizeDialog.tsx apps/web/src/features/studio/components/customize/StudioCustomizeDialog.test.tsx
git commit -m "feat(studio): one Dialog shell for the Customize dialogs, embeddable in preview mock-ups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Knip flags these exports as unused until Tasks 5–9 use them. That's expected inside the branch.

---

### Task 4: Shared fields

**Files:**
- Create: `apps/web/src/features/studio/components/customize/options.ts`
- Create: `customize/OptionToggleGroup.tsx` (+ `OptionToggleGroup.test.tsx`)
- Create: `customize/PromptField.tsx` (+ `PromptField.test.tsx`)
- Create: `customize/OptionCard.tsx` (+ `OptionCard.test.tsx`)

- [ ] **Step 1: Write the failing tests.**

`customize/OptionToggleGroup.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionToggleGroup } from "./OptionToggleGroup";
import { COUNT_OPTIONS } from "./options";

describe("OptionToggleGroup", () => {
  it("shows the options as a labelled single choice", () => {
    render(
      <OptionToggleGroup label="Number of questions" value="standard" options={COUNT_OPTIONS} onValueChange={vi.fn()} />
    );
    const group = screen.getByRole("radiogroup", { name: "Number of questions" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Fewer",
      "Standard",
      "More",
    ]);
    expect(within(group).getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
  });

  it("reports a new choice", async () => {
    const onValueChange = vi.fn();
    render(
      <OptionToggleGroup label="Number of questions" value="standard" options={COUNT_OPTIONS} onValueChange={onValueChange} />
    );
    await userEvent.click(screen.getByRole("radio", { name: "More" }));
    expect(onValueChange).toHaveBeenCalledWith("more");
  });

  it("ignores a click on the chosen option, so something is always chosen", async () => {
    const onValueChange = vi.fn();
    render(
      <OptionToggleGroup label="Number of questions" value="standard" options={COUNT_OPTIONS} onValueChange={onValueChange} />
    );
    await userEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
```

`customize/PromptField.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromptField } from "./PromptField";

vi.mock("../../services/promptsApi", () => ({
  useCreatePrompt: () => vi.fn(),
  usePublishPrompt: () => vi.fn(),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function Harness() {
  const [value, setValue] = useState("");
  return (
    <PromptField
      label="Area of focus"
      placeholder="e.g. Focus on normal forms"
      value={value}
      onChange={setValue}
      studioTool="quiz"
    />
  );
}

describe("PromptField", () => {
  it("labels the box and only allows saving once there is text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Area of focus"), "Normal forms");
    expect(save).toBeEnabled();
  });

  it("opens Save as Prompt with the text, and returns focus to the button when it closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Area of focus"), "Normal forms");
    const save = screen.getByRole("button", { name: /save as reusable prompt/i });
    await user.click(save);
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter your custom prompt/)).toHaveValue("Normal forms");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(save).toHaveFocus());
  });

  it("hides Save as reusable prompt in previews", () => {
    render(
      <StudioCustomizeDialog open preview onClose={vi.fn()}>
        <DialogTitle>Preview</DialogTitle>
        <DialogDescription>A marketing mock-up.</DialogDescription>
        <Harness />
      </StudioCustomizeDialog>
    );
    expect(screen.getByLabelText("Area of focus")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save as reusable prompt/i })).not.toBeInTheDocument();
  });
});
```

(This test also imports `DialogDescription` and `DialogTitle` from `@/shared/components/ui/dialog`, and `StudioCustomizeDialog` from `./StudioCustomizeDialog`.)

`customize/OptionCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionCard } from "./OptionCard";

describe("OptionCard", () => {
  it("is a button named by its title and described by its description", async () => {
    const onSelect = vi.fn();
    render(<OptionCard title="Summary" description="A concise synthesis." onSelect={onSelect} />);
    const card = screen.getByRole("button", { name: "Summary" });
    expect(card).toHaveAccessibleDescription("A concise synthesis.");
    expect(card).not.toHaveAttribute("aria-pressed");
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("marks the chosen card in a single-choice picker", () => {
    render(<OptionCard title="Debate" description="Two hosts." selected onSelect={vi.fn()} />);
    const card = screen.getByRole("button", { name: "Debate" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card.closest("[data-slot=card]")).toHaveAttribute("data-selected", "true");
  });

  it("keeps its corner action separate from selecting", async () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(
      <OptionCard
        title="Briefing Doc"
        description="Key insights."
        onSelect={onSelect}
        action={
          <button type="button" onClick={onEdit}>
            Edit the Briefing Doc prompt
          </button>
        }
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit the Briefing Doc prompt" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and make sure they fail.** `bun run test src/features/studio/components/customize`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**

`customize/options.ts`:

```ts
/** One choice in an OptionToggleGroup. */
export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

export const COUNT_OPTIONS = [
  { value: "fewer", label: "Fewer" },
  { value: "standard", label: "Standard" },
  { value: "more", label: "More" },
] as const satisfies readonly ToggleOption<"fewer" | "standard" | "more">[];

export const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const satisfies readonly ToggleOption<"easy" | "medium" | "hard">[];
```

`customize/OptionToggleGroup.tsx`:

```tsx
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import type { ToggleOption } from "./options";

interface OptionToggleGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly ToggleOption<T>[];
  onValueChange: (value: T) => void;
}

/** A labelled segmented choice (count, difficulty, length…). One option is always chosen. */
export function OptionToggleGroup<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: OptionToggleGroupProps<T>) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={label}
        value={value}
        onValueChange={(next) => {
          // Radix sends "" when the chosen item is clicked again; keep the choice.
          if (next) onValueChange(next as T);
        }}
        className="w-full"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  );
}
```

`customize/PromptField.tsx`:

```tsx
import { Bookmark } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/components/ui/field";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import { SaveAsPromptModal } from "../SaveAsPromptModal";
import { useStudioCustomizePreview } from "./StudioCustomizeDialog";

interface PromptFieldProps {
  label: string;
  description?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** The prompt library that "Save as reusable prompt" saves into. */
  studioTool: StudioTool;
  /** A taller box, for long instructions (Report, Spreadsheet). */
  tall?: boolean;
}

/** A Customize dialog's free-text prompt, with "Save as reusable prompt" under it (not in previews). */
export function PromptField({
  label,
  description,
  placeholder,
  value,
  onChange,
  studioTool,
  tall = false,
}: PromptFieldProps) {
  const id = useId();
  const [saveOpen, setSaveOpen] = useState(false);
  const preview = useStudioCustomizePreview();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("resize-none", tall ? "h-56" : "h-36")}
      />
      {/* The wrapper takes Field's full-width child rule, so the button keeps its own width. */}
      {!preview && (
        <div>
          <SaveAsPromptModal
            isOpen={saveOpen}
            onOpen={() => setSaveOpen(true)}
            onClose={() => setSaveOpen(false)}
            studioTool={studioTool}
            initialPromptText={value}
            trigger={
              <Button variant="ghost" size="sm" disabled={!value.trim()}>
                <Bookmark data-icon="inline-start" />
                Save as reusable prompt
              </Button>
            }
          />
        </div>
      )}
    </Field>
  );
}
```

`customize/OptionCard.tsx`:

```tsx
import { type ReactNode, useId } from "react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

interface OptionCardProps {
  title: string;
  description: string;
  onSelect: () => void;
  /** Single-choice pickers mark the chosen card. Omit it for cards that act straight away. */
  selected?: boolean;
  /** Shown above the title (the infographic style thumbnails). */
  media?: ReactNode;
  /** A second action in the top-right corner, outside the main button (Edit prompt). */
  action?: ReactNode;
}

/** A clickable card with a title and a short description: Studio formats and styles. */
export function OptionCard({ title, description, onSelect, selected, media, action }: OptionCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Card variant="interactive" data-selected={selected || undefined} className="h-full">
      <button
        type="button"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        onClick={onSelect}
        className="flex h-full flex-col gap-2 rounded-2xl p-4 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {media}
        <span
          id={titleId}
          className={cn("font-sans text-sm font-semibold text-foreground", action && "pr-8")}
        >
          {title}
        </span>
        <span id={descriptionId} className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </button>
      {action && <div className="absolute top-2 right-2">{action}</div>}
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests until they pass**, then:
  - from `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/customize`;
  - from the root: `bun run typecheck:web`.
- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/studio/components/customize
git commit -m "feat(studio): shared Customize fields: option toggle group, prompt field, option card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Quiz and Flashcards

**Files:**
- Rewrite: `apps/web/src/features/studio/components/CustomizeQuizModal.tsx`
- Rewrite: `apps/web/src/features/studio/components/CustomizeFlashcardsModal.tsx`
- Create: `CustomizeQuizModal.test.tsx`, `CustomizeFlashcardsModal.test.tsx` (same folder)

**Options:**
- Quiz: count Fewer/Standard/More, difficulty Easy/Medium/Hard, and "Area of focus".
- Flashcards: the same options. Its focus field is `topic`.
- Generate labels: "Generate Quiz" and "Generate Cards".

- [ ] **Step 1: Write the failing tests.**

`CustomizeQuizModal.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizeQuizModal } from "./CustomizeQuizModal";

vi.mock("./StudioModalDiscoverPromptsButton", () => ({
  StudioModalDiscoverPromptsButton: ({
    studioTool,
    onApplyPrompt,
  }: {
    studioTool: string;
    onApplyPrompt: (text: string) => void;
  }) => (
    <button type="button" onClick={() => onApplyPrompt(`library prompt for ${studioTool}`)}>
      Discover Prompts
    </button>
  ),
}));
vi.mock("../services/promptsApi", () => ({ useCreatePrompt: () => vi.fn(), usePublishPrompt: () => vi.fn() }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

function renderQuiz(isOpen = true) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  const utils = render(<CustomizeQuizModal isOpen={isOpen} onClose={onClose} onGenerate={onGenerate} />);
  return { ...utils, onGenerate, onClose };
}

const pick = (group: string, option: string) =>
  userEvent.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option }));

describe("CustomizeQuizModal", () => {
  it("generates with the defaults", async () => {
    const { onGenerate } = renderQuiz();
    expect(screen.getByRole("dialog", { name: "Customize Quiz" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledWith({ count: "standard", difficulty: "medium", focus: "" });
  });

  it("generates with the chosen options and focus", async () => {
    const { onGenerate } = renderQuiz();
    await pick("Number of questions", "More");
    await pick("Difficulty", "Hard");
    await userEvent.type(screen.getByLabelText("Area of focus"), "Normal forms");
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledWith({ count: "more", difficulty: "hard", focus: "Normal forms" });
  });

  it("fills the focus from the prompt library", async () => {
    renderQuiz();
    await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
    expect(screen.getByLabelText("Area of focus")).toHaveValue("library prompt for quiz");
  });

  it("starts from the defaults each time it opens", async () => {
    const { rerender, onClose, onGenerate } = renderQuiz();
    await pick("Difficulty", "Hard");
    rerender(<CustomizeQuizModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />);
    rerender(<CustomizeQuizModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  });

  it("hides the prompt-library actions in previews", async () => {
    const onGenerate = vi.fn();
    render(<CustomizeQuizModal isOpen preview onClose={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Discover Prompts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save as reusable prompt/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });
});
```

`CustomizeFlashcardsModal.test.tsx`:
- Use the same three `vi.mock`s and the `pick` helper, with these differences:
  - render `CustomizeFlashcardsModal`;
  - the dialog name is "Customize Flashcards" and the button is "Generate Cards";
  - the count group is "Number of cards";
  - the config key is `topic`;
  - the library text is `"library prompt for flashcards"`.
- Keep the placeholder check that `e2e/studio/prompt-library.spec.ts` depends on.
- Add the nested-dialog test. For it, **don't** mock `SaveAsPromptModal`: the real one runs on the mocked `promptsApi`.

```tsx
  it("keeps the e2e placeholder on the focus box", () => {
    renderFlashcards();
    expect(screen.getByPlaceholderText(/e\.g\. Focus on 'Relational Algebra'/)).toBeInTheDocument();
  });

  it("Escape in Save as Prompt closes only that dialog", async () => {
    const { onClose } = renderFlashcards();
    await userEvent.type(screen.getByLabelText("Area of focus"), "Exam prep");
    await userEvent.click(screen.getByRole("button", { name: /save as reusable prompt/i }));
    expect(screen.getByRole("dialog", { name: "Save as Prompt" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Save as Prompt" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("dialog", { name: "Customize Flashcards" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
```

  (Import `waitFor` too. `renderFlashcards` mirrors `renderQuiz`.)

- [ ] **Step 2: Run them and make sure they fail.** `bun run test src/features/studio/components/CustomizeQuizModal.test.tsx src/features/studio/components/CustomizeFlashcardsModal.test.tsx`

- [ ] **Step 3: Rewrite `CustomizeQuizModal.tsx`.**

```tsx
import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogTheme";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import { COUNT_OPTIONS, DIFFICULTY_OPTIONS } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

interface CustomizeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: QuizConfig) => void;
  /** When true, opens inside a positioned parent (a preview mock-up) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface QuizConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  focus: string;
}

export const CustomizeQuizModal: React.FC<CustomizeQuizModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
  >
    <QuizForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function QuizForm({ onGenerate }: { onGenerate: (config: QuizConfig) => void }) {
  const [count, setCount] = useState<QuizConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<QuizConfig["difficulty"]>("medium");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="quiz"
        title="Customize Quiz"
        description="Choose how many questions, how hard they are, and what to focus on."
        promptLibrary={{ studioTool: "quiz", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid sm:grid-cols-2">
          <OptionToggleGroup
            label="Number of questions"
            value={count}
            options={COUNT_OPTIONS}
            onValueChange={setCount}
          />
          <OptionToggleGroup
            label="Difficulty"
            value={difficulty}
            options={DIFFICULTY_OPTIONS}
            onValueChange={setDifficulty}
          />
        </FieldGroup>
        <PromptField
          label="Area of focus"
          placeholder="e.g. Create a 'Final Exam' style review or focus on 'Boyce-Codd Normal Form'..."
          value={focus}
          onChange={setFocus}
          studioTool="quiz"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ count, difficulty, focus })}>Generate Quiz</Button>
      </StudioCustomizeFooter>
    </>
  );
}
```

- [ ] **Step 4: Rewrite `CustomizeFlashcardsModal.tsx`** with the same structure. Its differences:
  - The props interface is `CustomizeFlashcardsModalProps` (the same fields, including `embedded`, `theme` and `preview`). The component passes `preview={preview}` to the shell, as Quiz does.
  - The config type is exported unchanged:

```ts
export interface FlashcardConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}
```

  - The form is `FlashcardsForm`, with state `count`, `difficulty` and `topic`.
  - **Header:** `kind="flashcard"`, `title="Customize Flashcards"`, `description="Choose how many cards to make, how hard they are, and what to focus on."` and `promptLibrary={{ studioTool: "flashcards", onApplyPrompt: setTopic }}`.
  - The first toggle group's label is `"Number of cards"`.
  - **`PromptField`:** `label="Area of focus"`, `placeholder="e.g. Focus on 'Relational Algebra' or 'Keep card fronts under 3 words'..."` and `studioTool="flashcards"`.
  - **Footer:** `<Button onClick={() => onGenerate({ count, difficulty, topic })}>Generate Cards</Button>`.
- [ ] **Step 5: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components`.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/CustomizeQuizModal.tsx src/features/studio/components/CustomizeFlashcardsModal.tsx`.
  - From the root: `bun run typecheck:web`.
- [ ] **Step 6: Commit.** `feat(studio): Quiz and Flashcards dialogs on the shared shell` (with the `Co-Authored-By` line, as in Task 1).

---

### Task 6: Written Questions and Mind Map

**Files:**
- Rewrite: `apps/web/src/features/studio/components/CustomizeWrittenQuestionsModal.tsx`
- Rewrite: `apps/web/src/features/studio/components/CustomizeMindMapModal.tsx`
- Create: `CustomizeWrittenQuestionsModal.test.tsx`
- Modify: `CustomizeMindMapModal.test.tsx`

**Options:**
- **Written Questions:** count Fewer/Standard/More, type Short/Essay, difficulty Easy/Medium/Hard, and "Area of focus".
  - Today these are three `text-[10px]` columns with `min-h-7`. They become three `OptionToggleGroup`s in `FieldGroup className="grid lg:grid-cols-3"` in the wide panel.
  - They are stacked below `lg`, where three segmented rows don't fit.
- **Mind Map:** only the prompt. Its props have no `embedded`/`theme`, and stay so (it's not used in the mock-ups). The hand-rolled overlay and its comment go away.

- [ ] **Step 1: Write the failing tests.**
  - **`CustomizeWrittenQuestionsModal.test.tsx`:** the same mocks and `pick` helper as the Quiz test. Cover:
    - defaults → `{ count: "standard", difficulty: "medium", questionType: "short", focus: "" }` from "Generate Written Questions";
    - pick "Number of questions" → "Fewer", "Question type" → "Essay" and "Difficulty" → "Easy", type a focus → the matching config;
    - Discover fills "Area of focus" with `"library prompt for writtenQuestions"`.
  - **`CustomizeMindMapModal.test.tsx`:** keep all six tests and add:

```tsx
  it("starts with an empty prompt each time it opens", async () => {
    const onGenerate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<CustomizeMindMapModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    await userEvent.type(screen.getByLabelText("Custom prompt"), "Draft");
    rerender(<CustomizeMindMapModal isOpen={false} onClose={onClose} onGenerate={onGenerate} />);
    rerender(<CustomizeMindMapModal isOpen onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByLabelText("Custom prompt")).toHaveValue("");
  });
```

- [ ] **Step 2: Run them and make sure the new ones fail.**

- [ ] **Step 3: Rewrite `CustomizeWrittenQuestionsModal.tsx`.**
  - It uses the same imports as Quiz, plus `type ToggleOption` from `./customize/options`.
  - Keep `WrittenQuestionsConfig` exactly as it is.
  - Add `theme?: StudioDialogTheme` and `preview?: boolean` to the props, and pass `wide` to the shell.

```tsx
const QUESTION_TYPE_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "essay", label: "Essay" },
] as const satisfies readonly ToggleOption<WrittenQuestionsConfig["questionType"]>[];

export const CustomizeWrittenQuestionsModal: React.FC<CustomizeWrittenQuestionsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <WrittenQuestionsForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function WrittenQuestionsForm({ onGenerate }: { onGenerate: (config: WrittenQuestionsConfig) => void }) {
  const [count, setCount] = useState<WrittenQuestionsConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<WrittenQuestionsConfig["difficulty"]>("medium");
  const [questionType, setQuestionType] = useState<WrittenQuestionsConfig["questionType"]>("short");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="written"
        title="Customize Written Questions"
        description="Choose how many questions, their type and difficulty, and what to focus on."
        promptLibrary={{ studioTool: "writtenQuestions", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid lg:grid-cols-3">
          <OptionToggleGroup label="Number of questions" value={count} options={COUNT_OPTIONS} onValueChange={setCount} />
          <OptionToggleGroup label="Question type" value={questionType} options={QUESTION_TYPE_OPTIONS} onValueChange={setQuestionType} />
          <OptionToggleGroup label="Difficulty" value={difficulty} options={DIFFICULTY_OPTIONS} onValueChange={setDifficulty} />
        </FieldGroup>
        <PromptField
          label="Area of focus"
          placeholder="e.g. Focus on 'Database Normalization' concepts or create a comprehensive review..."
          value={focus}
          onChange={setFocus}
          studioTool="writtenQuestions"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ count, difficulty, questionType, focus })}>
          Generate Written Questions
        </Button>
      </StudioCustomizeFooter>
    </>
  );
}
```

  The props interface `CustomizeWrittenQuestionsModalProps` is `{ isOpen; onClose; onGenerate: (config: WrittenQuestionsConfig) => void; embedded?: boolean; theme?: StudioDialogTheme; preview?: boolean }`, with the same doc comments as Quiz's.

- [ ] **Step 4: Rewrite `CustomizeMindMapModal.tsx`.**

```tsx
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

export interface MindMapConfig {
  customPrompt: string;
}

interface CustomizeMindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: MindMapConfig) => void;
}

export function CustomizeMindMapModal({ isOpen, onClose, onGenerate }: CustomizeMindMapModalProps) {
  return (
    <StudioCustomizeDialog open={isOpen} onClose={onClose}>
      <MindMapForm onGenerate={onGenerate} />
    </StudioCustomizeDialog>
  );
}

// Inside DialogContent, which unmounts on close: every open starts with an empty prompt.
function MindMapForm({ onGenerate }: { onGenerate: (config: MindMapConfig) => void }) {
  const [customPrompt, setCustomPrompt] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="mindmap"
        title="Customize Mind Map"
        description="Map the main topics of your selected sources."
        promptLibrary={{ studioTool: "mindmap", onApplyPrompt: setCustomPrompt }}
      />
      <StudioCustomizeBody>
        <PromptField
          label="Custom prompt"
          description="Optional. Say what the map should focus on or how to organize it. Only your selected sources are used."
          placeholder="e.g. Focus on the cardiac cycle, or organize by cause and effect..."
          value={customPrompt}
          onChange={setCustomPrompt}
          studioTool="mindmap"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ customPrompt })}>Generate Mind Map</Button>
      </StudioCustomizeFooter>
    </>
  );
}
```

- [ ] **Step 5: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components`.
  - From `apps/web`: `bunx eslint --max-warnings 0` on both dialog files.
  - From the root: `bun run typecheck:web`.
- [ ] **Step 6: Commit.** `feat(studio): Written Questions and Mind Map dialogs on the shared shell` (with the `Co-Authored-By` line).

---

### Task 7: Audio Overview

**Files:**
- Rewrite: `apps/web/src/features/studio/components/CustomizeAudioModal.tsx`
- Create: `CustomizeAudioModal.test.tsx`

**Options:**
- Format is one of four cards: Deep Dive, Brief, Critique and Debate. Keep the `FORMATS` array as it is.
- Length is Short/Default/Long, and the focus box is labelled "What should the AI hosts focus on in this episode?".
- The teal header (`bg-teal-500/10`, `text-teal-700 dark:text-teal-400`) becomes the `audio` type tile. `max-h-[85vh]` and `text-[13px]` go away.

- [ ] **Step 1: Write the failing test.** Use the Quiz test's mocks. Cover:
  - defaults → "Generate Audio" calls `onGenerate({ formatId: "deep_dive", length: "default", focus: "" })`;
  - `screen.getByRole("button", { name: "Deep Dive" })` has `aria-pressed="true"`;
  - clicking the "Debate" card, then picking "Length" → "Long" and typing a focus → `{ formatId: "debate", length: "long", focus: "…" }`, and "Debate" is now `aria-pressed="true"` while "Deep Dive" is `"false"`;
  - Discover fills the focus with `"library prompt for audio"`.
- [ ] **Step 2: Run it and make sure it fails.**
- [ ] **Step 3: Rewrite.** Keep `FORMATS` (with its `AudioFormat` interface) and `AudioConfig` unchanged.

```tsx
import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogTheme";
import { OptionCard } from "./customize/OptionCard";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import type { ToggleOption } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

// interface AudioFormat + const FORMATS: AudioFormat[] = [...] stay exactly as they are today.

const LENGTH_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "default", label: "Default" },
  { value: "long", label: "Long" },
] as const satisfies readonly ToggleOption<AudioConfig["length"]>[];

const FOCUS_PLACEHOLDER = [
  "Things to try",
  '• Focus on a specific source ("only cover the article about Italy")',
  "• Focus on a specific topic (\"just discuss the novel's main character\")",
  '• Target a specific audience ("explain to someone new to biology")',
].join("\n");

interface CustomizeAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: AudioConfig) => void;
  embedded?: boolean;
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface AudioConfig {
  formatId: string;
  length: "short" | "default" | "long";
  focus: string;
}

export const CustomizeAudioModal: React.FC<CustomizeAudioModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <AudioForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function AudioForm({ onGenerate }: { onGenerate: (config: AudioConfig) => void }) {
  const [formatId, setFormatId] = useState("deep_dive");
  const [length, setLength] = useState<AudioConfig["length"]>("default");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="audio"
        title="Customize Audio Overview"
        description="Pick a format and a length, and tell the hosts what to focus on."
        promptLibrary={{ studioTool: "audio", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldSet>
          <FieldLegend variant="label">Format</FieldLegend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((format) => (
              <OptionCard
                key={format.id}
                title={format.title}
                description={format.description}
                selected={formatId === format.id}
                onSelect={() => setFormatId(format.id)}
              />
            ))}
          </div>
        </FieldSet>
        <OptionToggleGroup label="Length" value={length} options={LENGTH_OPTIONS} onValueChange={setLength} />
        <PromptField
          label="What should the AI hosts focus on in this episode?"
          placeholder={FOCUS_PLACEHOLDER}
          value={focus}
          onChange={setFocus}
          studioTool="audio"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ formatId, length, focus })}>Generate Audio</Button>
      </StudioCustomizeFooter>
    </>
  );
}
```

- [ ] **Step 4: Run the checks** (test, eslint, typecheck, as in Task 6).
- [ ] **Step 5: Commit.** `feat(studio): Audio Overview dialog on the shared shell; format cards and a length toggle` (with the `Co-Authored-By` line).

---

### Task 8: Report and Spreadsheets (two-step format picker)

**Files:**
- Create: `apps/web/src/features/studio/components/customize/PromptFormatPicker.tsx`
- Rewrite: `apps/web/src/features/studio/components/CustomizeReportModal.tsx` and `CustomizeSpreadsheetsModal.tsx`
- Create: `CustomizeReportModal.test.tsx` and `CustomizeSpreadsheetsModal.test.tsx`
- Modify: `e2e/studio/report-generation.spec.ts` (lines 22 and 39) and `e2e/studio/studio-lifecycle.spec.ts` (line 27)

**Behaviour:**
- **Grid step:**
  - Report shows 8 cards (Create Your Own, Briefing Doc, Study Guide, Blog Post, Summary, Technical Report, Concept Explainer, Methodology Overview), four per row from `lg`. Spreadsheets shows 5 cards, three per row.
  - Clicking a built-in card generates at once. Report calls `onSelectFormat(id)`. Spreadsheets calls `onGenerate({ spreadsheetType: id, customPrompt: format.prompt })`.
  - Every format with a non-empty `prompt` gets an "Edit the {title} prompt" ghost icon button in its corner, which opens the prompt step prefilled.
- **Prompt step:**
  - It shows the format's title and description in an `Item variant="muted"`, then a tall `PromptField`, then Generate.
  - Report generates with `onSelectFormat(id, prompt)`. Spreadsheets generates with `onGenerate({ spreadsheetType: id, customPrompt: prompt })`.
  - The header shows "Back to formats".
- **Library prompt on the grid:** today it was stored in hidden state and never visible. Now applying a prompt from the grid opens Create Your Own with the prompt filled in (Decision 5).
- **Format cards** become buttons (they were click-only `div`s with no keyboard access).
  - The `h4` goes, so the e2e selectors change to the card button. Its name comes from `aria-labelledby` on the title.
  - The `text-md` (no CSS), `text-[13px]` and `max-h-[90vh]` classes go away.
- **Each open** starts on the grid. That was already true (an explicit `useEffect` reset, now removed).

- [ ] **Step 1: Write the failing tests.** Use the Quiz test's mocks.
  - **`CustomizeReportModal.test.tsx`:**

```tsx
function renderReport() {
  const onSelectFormat = vi.fn();
  render(<CustomizeReportModal isOpen onClose={vi.fn()} onSelectFormat={onSelectFormat} />);
  return { onSelectFormat, dialog: screen.getByRole("dialog", { name: "Create report" }) };
}

it("generates a built-in format straight from its card", async () => {
  const { onSelectFormat, dialog } = renderReport();
  await userEvent.click(within(dialog).getByRole("button", { name: "Summary", exact: true }));
  expect(onSelectFormat).toHaveBeenCalledWith("summary");
});

it("Create Your Own asks for a prompt, then generates with it", async () => {
  const { onSelectFormat, dialog } = renderReport();
  await userEvent.click(within(dialog).getByRole("button", { name: "Create Your Own" }));
  await userEvent.type(screen.getByLabelText("Describe the report you want to create"), "A timeline");
  await userEvent.click(screen.getByRole("button", { name: "Generate Report" }));
  expect(onSelectFormat).toHaveBeenCalledWith("custom", "A timeline");
});

it("Edit opens a built-in format's prompt, and Back returns to the grid", async () => {
  renderReport();
  await userEvent.click(screen.getByRole("button", { name: "Edit the Briefing Doc prompt" }));
  expect(screen.getByLabelText("Describe the report you want to create")).toHaveValue(
    expect.stringMatching(/^Create a comprehensive briefing document/)
  );
  await userEvent.click(screen.getByRole("button", { name: "Back to formats" }));
  expect(screen.getByRole("button", { name: "Summary", exact: true })).toBeInTheDocument();
});

it("a library prompt applied on the grid opens Create Your Own with it", async () => {
  renderReport();
  await userEvent.click(screen.getByRole("button", { name: "Discover Prompts" }));
  expect(screen.getByLabelText("Describe the report you want to create")).toHaveValue(
    "library prompt for report"
  );
  expect(screen.getByText("Create Your Own")).toBeInTheDocument();
});
```

  - **`CustomizeSpreadsheetsModal.test.tsx`**, with the same shape:
    - clicking `screen.getByText("Data Table", { exact: true })` calls `onGenerate` with `expect.objectContaining({ spreadsheetType: "data_extraction" })`, and its `customPrompt` doesn't contain `"{chunk}"`;
    - Create Your Own → type → "Generate Spreadsheet" → `{ spreadsheetType: "custom", customPrompt: "My table" }`;
    - "Edit the Timeline prompt" prefills a prompt matching `/^Analyze this text to identify distinct \*\*Time Periods\*\*/`.

- [ ] **Step 2: Run them and make sure they fail.**

- [ ] **Step 3: Create `customize/PromptFormatPicker.tsx`.**

```tsx
import { Pencil } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/shared/components/ui/item";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import type { StudioTypeKey } from "../../studioTypeStyle";
import { OptionCard } from "./OptionCard";
import { PromptField } from "./PromptField";
import { StudioCustomizeBody, StudioCustomizeFooter, StudioCustomizeHeader } from "./StudioCustomizeDialog";

export interface PromptFormat<Id extends string> {
  id: Id;
  title: string;
  description: string;
  /** The built-in prompt that "Edit" starts from; "" for the Create Your Own format. */
  prompt: string;
}

interface PromptFormatPickerProps<Id extends string> {
  kind: StudioTypeKey;
  title: string;
  description: string;
  studioTool: StudioTool;
  formats: readonly PromptFormat<Id>[];
  /** The Create Your Own format. A library prompt applied on the grid opens it. */
  customFormat: PromptFormat<Id>;
  /** A built-in format's card was clicked: generate at once. */
  onPick: (format: PromptFormat<Id>) => void;
  /** Generate from the prompt step. */
  onGenerate: (formatId: Id, prompt: string) => void;
  promptLabel: string;
  promptPlaceholder: string;
  generateLabel: string;
  /** Cards per row from the `lg` breakpoint. */
  columns: 3 | 4;
}

/**
 * Two steps: a grid of formats, then a prompt for the chosen one (Create Your Own, or a built-in
 * format's prompt to edit). It lives inside DialogContent, so each open starts on the grid.
 */
export function PromptFormatPicker<Id extends string>({
  kind,
  title,
  description,
  studioTool,
  formats,
  customFormat,
  onPick,
  onGenerate,
  promptLabel,
  promptPlaceholder,
  generateLabel,
  columns,
}: PromptFormatPickerProps<Id>) {
  const [configuring, setConfiguring] = useState<PromptFormat<Id> | null>(null);
  const [prompt, setPrompt] = useState("");
  const gridLabelId = useId();

  const configure = (format: PromptFormat<Id>, text: string) => {
    setConfiguring(format);
    setPrompt(text);
  };
  const promptLibrary = {
    studioTool,
    onApplyPrompt: (text: string) => configure(configuring ?? customFormat, text),
  };

  if (configuring) {
    return (
      <>
        <StudioCustomizeHeader
          kind={kind}
          title={title}
          description={description}
          promptLibrary={promptLibrary}
          onBack={() => setConfiguring(null)}
        />
        <StudioCustomizeBody>
          <div className="flex flex-col gap-6 duration-300 ease-out animate-in fade-in-0 slide-in-from-right-4">
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>{configuring.title}</ItemTitle>
                <ItemDescription>{configuring.description}</ItemDescription>
              </ItemContent>
            </Item>
            <PromptField
              label={promptLabel}
              placeholder={promptPlaceholder}
              value={prompt}
              onChange={setPrompt}
              studioTool={studioTool}
              tall
            />
          </div>
        </StudioCustomizeBody>
        <StudioCustomizeFooter>
          <Button onClick={() => onGenerate(configuring.id, prompt)}>{generateLabel}</Button>
        </StudioCustomizeFooter>
      </>
    );
  }

  return (
    <>
      <StudioCustomizeHeader kind={kind} title={title} description={description} promptLibrary={promptLibrary} />
      <StudioCustomizeBody>
        <section
          aria-labelledby={gridLabelId}
          className="flex flex-col gap-3 duration-300 ease-out animate-in fade-in-0 slide-in-from-left-4"
        >
          <h3 id={gridLabelId} className="font-sans text-sm font-medium">
            Format
          </h3>
          <div className={cn("grid gap-3 sm:grid-cols-2", columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            {formats.map((format) => (
              <OptionCard
                key={format.id}
                title={format.title}
                description={format.description}
                onSelect={() => (format.id === customFormat.id ? configure(format, "") : onPick(format))}
                action={
                  format.prompt ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit the ${format.title} prompt`}
                      onClick={() => configure(format, format.prompt)}
                    >
                      <Pencil />
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>
      </StudioCustomizeBody>
    </>
  );
}
```

- [ ] **Step 4: Rewrite `CustomizeReportModal.tsx`.**
  - **Data, from today's lines 6–176:**
    - Delete `interface ReportFormat` and `FormatCard`.
    - Change `const FORMATS: ReportFormat[]` and `const SUGGESTED_FORMATS: ReportFormat[]` to `PromptFormat<string>[]`.
    - Delete every `hasEdit: true,` line. Keep every other field and every prompt string **byte for byte**.
    - Pull the first entry out into a named constant, and start `FORMATS` with it:

```ts
const CUSTOM_FORMAT: PromptFormat<string> = {
  id: "custom",
  title: "Create Your Own",
  description: "Craft reports your way by specifying structure, style, tone, and more",
  prompt: "",
};

const FORMATS: PromptFormat<string>[] = [
  CUSTOM_FORMAT,
  // briefing, study_guide, blog_post: unchanged apart from the deleted hasEdit lines
];
```

  - **Component:**

```tsx
const ALL_FORMATS = [...FORMATS, ...SUGGESTED_FORMATS];

export const CustomizeReportModal: React.FC<CustomizeReportModalProps> = ({
  isOpen,
  onClose,
  onSelectFormat,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <PromptFormatPicker
      kind="report"
      title="Create report"
      description="Pick a format, or write your own instructions."
      studioTool="report"
      formats={ALL_FORMATS}
      customFormat={CUSTOM_FORMAT}
      onPick={(format) => onSelectFormat(format.id)}
      onGenerate={(formatId, prompt) => onSelectFormat(formatId, prompt)}
      promptLabel="Describe the report you want to create"
      promptPlaceholder="Tell SolomindLM how to structure and write your report..."
      generateLabel="Generate Report"
      columns={4}
    />
  </StudioCustomizeDialog>
);

interface CustomizeReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat: (formatId: string, customPrompt?: string) => void;
  /** When true, opens inside a positioned parent (the marketing hero preview) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}
```

  Imports: `React` (type), `type StudioDialogTheme`, `PromptFormatPicker`, `type PromptFormat` and `StudioCustomizeDialog`.

- [ ] **Step 5: Rewrite `CustomizeSpreadsheetsModal.tsx`.**
  - **Data:**
    - Keep `SpreadsheetConfig` and `cleanPromptForDisplay` unchanged.
    - Delete `interface SpreadsheetFormat` and `FormatCard`.
    - `SPREADSHEET_FORMATS` becomes `PromptFormat<SpreadsheetConfig["spreadsheetType"]>[]`, with its `hasEdit` lines removed and the prompts unchanged.
    - The first entry becomes `CUSTOM_FORMAT` (`id: "custom"`, title "Create Your Own", today's description, and `prompt: ""`).
  - **Component:**

```tsx
export const CustomizeSpreadsheetsModal: React.FC<CustomizeSpreadsheetsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <PromptFormatPicker
      kind="spreadsheet"
      title="Create spreadsheet"
      description="Pick a table format, or describe your own."
      studioTool="spreadsheet"
      formats={SPREADSHEET_FORMATS}
      customFormat={CUSTOM_FORMAT}
      onPick={(format) => onGenerate({ spreadsheetType: format.id, customPrompt: format.prompt })}
      onGenerate={(spreadsheetType, customPrompt) => onGenerate({ spreadsheetType, customPrompt })}
      promptLabel="Describe the spreadsheet you want to create"
      promptPlaceholder="Tell SolomindLM how to structure and organize your spreadsheet..."
      generateLabel="Generate Spreadsheet"
      columns={3}
    />
  </StudioCustomizeDialog>
);
```

  Add `theme?: StudioDialogTheme` and `preview?: boolean` to `CustomizeSpreadsheetsModalProps`, with the same doc comments as Report's.

- [ ] **Step 6: Update the e2e selectors.**
  - **In `e2e/studio/report-generation.spec.ts`:** replace both occurrences of `await page.getByRole("heading", { level: 4, name: "Summary" }).click();` (lines 22 and 39) with:

```ts
    await page
      .getByRole("dialog", { name: /create report/i })
      .getByRole("button", { name: "Summary", exact: true })
      .click();
```

  - **In `e2e/studio/studio-lifecycle.spec.ts` (line 27):** make the same replacement.
- [ ] **Step 7: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components`.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/CustomizeReportModal.tsx src/features/studio/components/CustomizeSpreadsheetsModal.tsx src/features/studio/components/customize`.
  - From the root: `bun run typecheck:web`, then `bunx playwright test --list e2e/studio`.
- [ ] **Step 8: Commit.** `feat(studio): Report and Spreadsheet dialogs share a keyboard-reachable format picker` (with the `Co-Authored-By` line).

---

### Task 9: Infographic, with exempt style thumbnails

**Files:**
- Create: `apps/web/src/features/studio/components/customize/InfographicStyleThumbnail.tsx`
- Rewrite: `apps/web/src/features/studio/components/CustomizeInfographicModal.tsx`
- Create: `CustomizeInfographicModal.test.tsx`
- Modify: `apps/web/eslint.config.mjs` (the override block)

**Options:**
- Orientation is Landscape/Portrait/Square, and Level of detail is Concise/Standard.
- Visual style is one of 11 cards with a thumbnail. Keep `VISUAL_STYLES` as it is.
- "Describe the infographic you want to create", then "Generate".
- **The style picker becomes a wrapping grid** (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) instead of the Prev/Next carousel (Decision 2). This removes the scroll buttons, `scrollRef`, the `scrollbar-hide` class (which generates no CSS) and the two inline `style`s.
- The "On" pill is replaced by the selected card's ring and `aria-pressed`.

- [ ] **Step 1: Add the ESLint override.**
  - In `apps/web/eslint.config.mjs`, directly after the `ModelBrandIcon.tsx` block, add:

```js
  // Infographic style thumbnails illustrate the generated image's palette (kawaii pastels, clay
  // shadows, anime outlines), not app chrome, like the brand colours in ModelBrandIcon.
  {
    files: ["src/features/studio/components/customize/InfographicStyleThumbnail.tsx"],
    rules: {
      "shadcn/no-raw-colors": "off",
      "shadcn/no-arbitrary-values": "off",
      "solomind/soft-surfaces": "off",
    },
  },
```

  - It must come after the `{ files: MIGRATED, rules: rules("error") }` entry, because later entries win.
  - `no-inline-styles` and `no-unknown-classes` stay on for that file. The thumbnail code below passes both; this was checked against `@shadcn/lint` while writing this plan.

- [ ] **Step 2: Create `customize/InfographicStyleThumbnail.tsx`.** It is today's `VisualStylePreview` with three changes:
  - the `frame` string becomes a `Frame` component with no border and `aria-hidden`;
  - the `scientific` case's inline `style` becomes arbitrary classes;
  - `opacity-[0.45]` becomes `opacity-45`.

```tsx
import type { ReactNode } from "react";

/**
 * Small previews of the infographic visual styles. They illustrate the generated image's palette,
 * not app chrome, so the palette, arbitrary-value and soft-surface design rules are off for this
 * file (apps/web/eslint.config.mjs).
 */
function Frame({ children }: { children?: ReactNode }) {
  return (
    <div aria-hidden className="relative h-16 w-full overflow-hidden rounded-lg bg-muted/40">
      {children}
    </div>
  );
}

export function InfographicStyleThumbnail({ styleId }: { styleId: string }) {
  switch (styleId) {
    case "auto":
      return (
        <Frame>
          <div className="absolute inset-0 bg-linear-to-br from-muted via-background to-primary/20" />
          <div className="absolute inset-x-2 bottom-2 h-2 rounded-sm bg-linear-to-r from-transparent via-primary/35 to-transparent" />
          <div className="absolute left-2 top-2 h-1.5 w-8 rounded-full bg-foreground/15" />
          <div className="absolute right-3 top-4 h-1 w-10 rounded-full bg-foreground/10" />
        </Frame>
      );
    case "sketch_note":
      return (
        <Frame>
          <div className="absolute inset-2 rounded-md border border-dashed border-foreground/25 bg-background/40" />
          <div className="absolute left-3 top-3 h-px w-12 rotate-[-8deg] bg-foreground/30" />
          <div className="absolute bottom-3 right-3 h-6 w-10 rotate-3 rounded-sm border border-foreground/20 bg-secondary/40" />
        </Frame>
      );
    case "kawaii":
      return (
        <Frame>
          <div className="absolute -left-2 bottom-1 h-10 w-14 rounded-full bg-pink-300/35 blur-[2px]" />
          <div className="absolute right-0 top-2 h-9 w-16 rounded-full bg-violet-300/30 blur-[2px]" />
          <div className="absolute left-1/3 top-4 h-7 w-12 rounded-2xl bg-rose-200/50" />
          <div className="absolute bottom-2 left-4 h-5 w-16 rounded-full bg-amber-100/60" />
        </Frame>
      );
    case "professional":
      return (
        <Frame>
          <div className="absolute inset-x-0 top-0 h-2 bg-foreground/80" />
          <div className="absolute left-2 top-4 h-1 w-14 bg-foreground/20" />
          <div className="absolute left-2 top-7 grid w-[calc(100%-1rem)] grid-cols-3 gap-1">
            <div className="col-span-2 h-6 rounded-sm bg-foreground/10" />
            <div className="h-6 rounded-sm bg-foreground/15" />
            <div className="col-span-3 h-4 rounded-sm bg-foreground/8" />
          </div>
        </Frame>
      );
    case "scientific":
      return (
        <Frame>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_14%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground)_14%,transparent)_1px,transparent_1px)] bg-size-[10px_10px] opacity-45" />
          <div className="absolute left-2 top-2 h-8 w-px bg-primary/50" />
          <div className="absolute left-2 bottom-2 right-2 top-8 border-l border-b border-primary/40" />
          <div className="absolute bottom-2 left-3 right-5 h-px bg-primary/35" />
        </Frame>
      );
    case "anime":
      return (
        <Frame>
          <div className="absolute inset-0 bg-linear-to-br from-cyan-400/25 via-background to-fuchsia-500/25" />
          <div className="absolute -right-1 top-1 h-10 w-14 -skew-x-12 rounded-sm bg-blue-500/35" />
          <div className="absolute bottom-2 left-2 h-8 w-20 rounded-md border-2 border-foreground/45 bg-background/30" />
        </Frame>
      );
    case "clay":
      return (
        <Frame>
          <div className="absolute left-3 top-3 h-10 w-14 rounded-2xl bg-orange-200/45 shadow-[inset_0_-4px_0_rgba(0,0,0,0.06)]" />
          <div className="absolute bottom-2 right-4 h-9 w-11 rounded-xl bg-emerald-200/40 shadow-[inset_0_-3px_0_rgba(0,0,0,0.05)]" />
          <div className="absolute left-10 top-8 h-6 w-16 rounded-full bg-sky-200/35 shadow-[inset_0_-2px_0_rgba(0,0,0,0.05)]" />
        </Frame>
      );
    case "editorial":
      return (
        <Frame>
          <div className="absolute inset-x-2 top-2 space-y-1">
            <div className="h-2 w-[85%] rounded-sm bg-foreground/75" />
            <div className="h-1 w-full rounded-full bg-foreground/15" />
            <div className="h-1 w-[92%] rounded-full bg-foreground/12" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 grid grid-cols-3 gap-1.5">
            <div className="col-span-2 space-y-1">
              <div className="h-1 rounded-full bg-foreground/12" />
              <div className="h-1 rounded-full bg-foreground/10" />
              <div className="h-1 rounded-full bg-foreground/10" />
            </div>
            <div className="space-y-1 border-l border-border/60 pl-1.5">
              <div className="h-1 rounded-full bg-foreground/15" />
              <div className="h-1 rounded-full bg-foreground/12" />
            </div>
          </div>
        </Frame>
      );
    case "instructional":
      return (
        <Frame>
          <div className="absolute left-2 top-2 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <div className="mt-0.5 space-y-1">
              <div className="h-1 w-20 rounded-full bg-foreground/18" />
              <div className="h-1 w-14 rounded-full bg-foreground/12" />
            </div>
          </div>
          <div className="absolute left-2 top-9 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-foreground">
              2
            </span>
            <div className="mt-0.5 space-y-1">
              <div className="h-1 w-16 rounded-full bg-foreground/14" />
              <div className="h-1 w-20 rounded-full bg-foreground/10" />
            </div>
          </div>
        </Frame>
      );
    case "bento_grid":
      return (
        <Frame>
          <div className="absolute inset-2 grid grid-cols-4 grid-rows-3 gap-1">
            <div className="col-span-2 row-span-2 rounded-md bg-foreground/12" />
            <div className="rounded-md bg-foreground/10" />
            <div className="rounded-md bg-foreground/10" />
            <div className="col-span-2 rounded-md bg-foreground/8" />
            <div className="rounded-md bg-foreground/14" />
            <div className="rounded-md bg-foreground/10" />
          </div>
        </Frame>
      );
    case "bricks":
      return (
        <Frame>
          <div className="absolute inset-2 space-y-1">
            <div className="flex gap-1">
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
            </div>
            <div className="flex gap-1 pl-3">
              <div className="h-5 flex-1 rounded-sm bg-foreground/12" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/12" />
            </div>
            <div className="flex gap-1">
              <div className="h-5 flex-1 rounded-sm bg-foreground/16" />
              <div className="h-5 flex-1 rounded-sm bg-foreground/14" />
            </div>
          </div>
        </Frame>
      );
    default:
      return <Frame />;
  }
}
```

- [ ] **Step 3: Write the failing test** `CustomizeInfographicModal.test.tsx`. Use the Quiz test's mocks. Cover:
  - **Defaults:** `getByRole("button", { name: "Generate" })` calls `onGenerate({ orientation: "landscape", visualStyle: "auto", detailLevel: "standard", customPrompt: "" })`, and the "Auto-select" card has `aria-pressed="true"`.
  - **Choices:** pick "Orientation" → "Portrait" and "Level of detail" → "Concise", click the "Clay" card, and type a prompt. That gives `{ orientation: "portrait", visualStyle: "clay", detailLevel: "concise", customPrompt: "Blue theme" }`.
  - **Thumbnails:** every one of the 11 style cards contains an `aria-hidden` thumbnail, checked with `expect(card.querySelector("[aria-hidden=true]")).not.toBeNull()` for each `getByRole("button", { name: style })`.
  - **Single "generate" button:** no other button in the dialog has "generate" in its name, so the e2e substring match stays unique. `within(dialog).getAllByRole("button", { name: /generate/i })` has length 1.
- [ ] **Step 4: Run it and make sure it fails.**
- [ ] **Step 5: Rewrite `CustomizeInfographicModal.tsx`.**
  - Keep `VISUAL_STYLES` (and its `VisualStyle` interface) and `InfographicConfig` unchanged.
  - Delete `VisualStylePreview` and `useRef`.

```tsx
const ORIENTATION_OPTIONS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "square", label: "Square" },
] as const satisfies readonly ToggleOption<InfographicConfig["orientation"]>[];

const DETAIL_OPTIONS = [
  { value: "concise", label: "Concise" },
  { value: "standard", label: "Standard" },
] as const satisfies readonly ToggleOption<InfographicConfig["detailLevel"]>[];

export const CustomizeInfographicModal: React.FC<CustomizeInfographicModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <InfographicForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function InfographicForm({ onGenerate }: { onGenerate: (config: InfographicConfig) => void }) {
  const [orientation, setOrientation] = useState<InfographicConfig["orientation"]>("landscape");
  const [visualStyle, setVisualStyle] = useState("auto");
  const [detailLevel, setDetailLevel] = useState<InfographicConfig["detailLevel"]>("standard");
  const [customPrompt, setCustomPrompt] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="infographic"
        title="Customize Infographic"
        description="Pick an orientation, a level of detail and a visual style."
        promptLibrary={{ studioTool: "infographic", onApplyPrompt: setCustomPrompt }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid sm:grid-cols-2">
          <OptionToggleGroup label="Orientation" value={orientation} options={ORIENTATION_OPTIONS} onValueChange={setOrientation} />
          <OptionToggleGroup label="Level of detail" value={detailLevel} options={DETAIL_OPTIONS} onValueChange={setDetailLevel} />
        </FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Visual style</FieldLegend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {VISUAL_STYLES.map((style) => (
              <OptionCard
                key={style.id}
                title={style.label}
                description={style.hint}
                selected={visualStyle === style.id}
                onSelect={() => setVisualStyle(style.id)}
                media={<InfographicStyleThumbnail styleId={style.id} />}
              />
            ))}
          </div>
        </FieldSet>
        <PromptField
          label="Describe the infographic you want to create"
          placeholder={'Guide the style, color, or focus: "Use a blue color theme and highlight the 3 key stats."'}
          value={customPrompt}
          onChange={setCustomPrompt}
          studioTool="infographic"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ orientation, visualStyle, detailLevel, customPrompt })}>
          Generate
        </Button>
      </StudioCustomizeFooter>
    </>
  );
}
```

  - The props interface gains `theme?: StudioDialogTheme` and `preview?: boolean`, with the same doc comments as Quiz's.
  - Imports: `FieldGroup`, `FieldLegend` and `FieldSet` from field, `OptionCard`, `OptionToggleGroup`, `type ToggleOption`, `PromptField`, `InfographicStyleThumbnail`, the shell parts, and `type StudioDialogTheme`.
- [ ] **Step 6: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components`.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/studio/components/CustomizeInfographicModal.tsx src/features/studio/components/customize/InfographicStyleThumbnail.tsx`. Expected: no output.
  - From the root: `bun run typecheck:web`.
- [ ] **Step 7: Commit.** `feat(studio): Infographic dialog on the shared shell; style thumbnails exempt as illustrations` (with the `Co-Authored-By` line). Include `apps/web/eslint.config.mjs` in the commit.

---

### Task 10: Cite Paper and the citation style picker

**Files:**
- Rewrite: `apps/web/src/features/studio/components/CitePaperModal.tsx` and `CitationStylePicker.tsx`
- Create: `CitePaperModal.test.tsx` and `CitationStylePicker.test.tsx`

**Callers (no changes needed):**
- `LiteraturePapersPanel.tsx:190` and `views/LiteratureTableView.tsx:562` mount `CitePaperModal` conditionally with `isOpen`.
  - The table's focus mode is `z-[60]`, below the dialog's `z-100`.
- `views/LiteratureReportView.tsx:141` uses the picker with `className="w-35 @min-[720px]/report-toolbar:w-42"`.
  - It applied to a wrapper before and applies to the trigger now. `cn` puts it after the picker's `w-full`, so it wins.
  - That file is PR 8's; don't touch it.

- [ ] **Step 1: Write the failing tests.**

`CitationStylePicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CitationStylePicker } from "./CitationStylePicker";

describe("CitationStylePicker", () => {
  it("shows the current style and reports a new one", async () => {
    const onChange = vi.fn();
    render(<CitationStylePicker value="apa7" onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Select citation style" });
    expect(trigger).toHaveTextContent("APA 7th");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "MLA 9th" }));
    expect(onChange).toHaveBeenCalledWith("mla9");
  });

  it("can be disabled", () => {
    render(<CitationStylePicker value="ieee" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("combobox", { name: "Select citation style" })).toBeDisabled();
  });
});
```

`CitePaperModal.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedPaper } from "../types/rankedPaper";
import { CitePaperModal } from "./CitePaperModal";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

const PAPER: RankedPaper = {
  title: "Attention Is All You Need",
  authors: ["Vaswani, Ashish", "Shazeer, Noam"],
  year: 2017,
  abstract: "",
  url: "https://arxiv.org/abs/1706.03762",
  source: "arxiv",
  score: 1,
};

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

describe("CitePaperModal", () => {
  it("shows the reference and the in-text citation in APA 7th by default", () => {
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Cite Paper" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Select citation style" })).toHaveTextContent("APA 7th");
    expect(screen.getByText(/Attention Is All You Need/)).toBeInTheDocument();
  });

  it("copies the full citation", async () => {
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy Citation" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Attention Is All You Need"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Citation copied"));
  });

  it("says so when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy In-Text" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy to the clipboard"));
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CitePaperModal paper={PAPER} paperIndex={0} isOpen onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them and make sure they fail.**

- [ ] **Step 3: Rewrite `CitationStylePicker.tsx`.** Keep the `CitationStyle` type and `STYLE_OPTIONS` exactly as they are.

```tsx
export interface CitationStylePickerProps {
  value: CitationStyle;
  onChange: (style: CitationStyle) => void;
  disabled?: boolean;
  /** Layout classes for the trigger (its width). */
  className?: string;
  /** For a FieldLabel's htmlFor. */
  id?: string;
}

export const CitationStylePicker: React.FC<CitationStylePickerProps> = ({
  value,
  onChange,
  disabled = false,
  className,
  id,
}) => (
  <Select value={value} onValueChange={(next) => onChange(next as CitationStyle)} disabled={disabled}>
    <SelectTrigger id={id} aria-label="Select citation style" className={cn("w-full", className)}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="end">
      <SelectGroup>
        {STYLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);
```

  Imports: `type React from "react"`, the `Select` parts from `@/shared/components/ui/select` and `cn`.

- [ ] **Step 4: Rewrite `CitePaperModal.tsx`.**
  - Keep the `engine`, `citation`, `fullCitation` and `inlineCitation` memos exactly as they are.
  - Delete the local `Field`, `CitationBox`, `CopyButton` and `Dialog` helpers.

```tsx
export const CitePaperModal: React.FC<CitePaperModalProps> = ({ paper, paperIndex, isOpen, onClose }) => {
  const [style, setStyle] = useState<CitationStyle>("apa7");
  const { success: toastSuccess, error: toastError } = useToast();
  const styleId = useId();

  // engine / citation / fullCitation / inlineCitation memos: unchanged

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess(`${label} copied`);
    } catch {
      toastError("Couldn't copy to the clipboard");
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-svh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cite Paper</DialogTitle>
          <DialogDescription>Copy a reference or an in-text citation in the style you need.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={styleId}>Citation style</FieldLabel>
            <CitationStylePicker id={styleId} value={style} onChange={setStyle} />
          </Field>
          <CitationOutput
            label="Full citation"
            text={fullCitation}
            copyLabel="Copy Citation"
            onCopy={() => void copy(fullCitation, "Citation")}
          />
          <CitationOutput
            label="In-text citation"
            text={inlineCitation}
            copyLabel="Copy In-Text"
            onCopy={() => void copy(inlineCitation, "In-text citation")}
          />
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
};

function CitationOutput({
  label,
  text,
  copyLabel,
  onCopy,
}: {
  label: string;
  text: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <Field>
      <FieldTitle>{label}</FieldTitle>
      <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">{text}</p>
      {/* The wrapper takes Field's full-width child rule, so the button keeps its own width. */}
      <div>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy data-icon="inline-start" />
          {copyLabel}
        </Button>
      </div>
    </Field>
  );
}
```

  - Imports: `Copy` from lucide, `useId`/`useMemo`/`useState`, `Button`, the `Dialog` parts (`Dialog`, `DialogContent`, `DialogDescription`, `DialogHeader`, `DialogTitle`), `Field`/`FieldGroup`/`FieldLabel`/`FieldTitle`, `useToast`, `type RankedPaper`, `rankedPaperToCitation`, `createCitationEngine`, `type CitationStyle` and `CitationStylePicker`.
  - The `Quote` icon and the hand-rolled close button go; `DialogContent` brings its own close X.
- [ ] **Step 5: Run the checks.**
  - From `apps/web`: `bun run test src/features/studio/components/CitePaperModal.test.tsx src/features/studio/components/CitationStylePicker.test.tsx`.
  - From `apps/web`: `bunx eslint --max-warnings 0` on both files.
  - From the root: `bun run typecheck:web`.
- [ ] **Step 6: Commit.** `feat(studio): Cite Paper on Dialog and the citation style picker on Select` (with the `Co-Authored-By` line).

---

### Task 11: Preview call sites (landing and sign-in mock-ups)

**Files:**
- Modify: `apps/web/src/features/auth/AuthPage.tsx` (the seven Customize elements, lines 374–428)
- Modify: `apps/web/src/features/landing/components/LandingHeroMockup.tsx` (the seven Customize elements, lines 507–554)

**Why:**
- **Both pages are marketing mock-ups.** "Discover Prompts" and "Save as reusable prompt" need a signed-in prompt library (saving fails signed out), so both pass `preview`. The shell hides those actions through its context (Task 3).
- **The auth page is always light.** Its root is `div.auth-form-light` (line 461). Its Customize dialogs used to render inside that wrapper; now they portal to `<body>`, where `<html class="dark">` would turn them dark. So it also passes `theme="light"`.
- **The landing page needs no theme.** `embedded` keeps the dialog inside the mock-up, which inherits the landing page's theme.
- `LandingHeroMockup.tsx` isn't in `MIGRATED`. Adding a boolean prop changes no design-lint count.

- [ ] **Step 1: `AuthPage.tsx`.** Add `theme="light"` and `preview` to each of the seven elements: `<CustomizeReportModal`, `<CustomizeFlashcardsModal`, `<CustomizeQuizModal`, `<CustomizeAudioModal`, `<CustomizeWrittenQuestionsModal`, `<CustomizeInfographicModal` and `<CustomizeSpreadsheetsModal`. For example:

```tsx
      <CustomizeReportModal
        theme="light"
        preview
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={() => {
          afterPreviewAction();
        }}
      />
```

- [ ] **Step 2: `LandingHeroMockup.tsx`.** Add `preview` after `embedded` on the same seven elements. For example:

```tsx
      <CustomizeReportModal
        embedded
        preview
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={previewNoop}
      />
```

- [ ] **Step 3: Run the checks.**
  - From the root: `bun run typecheck:web`.
  - From `apps/web`: `bunx eslint --max-warnings 0 src/features/auth/AuthPage.tsx` (that file is in `MIGRATED`).
  - From `apps/web`: `bun run test src/features/auth src/features/landing`.
  - `git grep -n "preview$" apps/web/src/features/auth/AuthPage.tsx apps/web/src/features/landing/components/LandingHeroMockup.tsx | wc -l`. Expected: 14.
- [ ] **Step 4: Commit.** `feat(studio): preview mock-ups hide the prompt library; sign-in previews stay light` (with the `Co-Authored-By` line).

---

### Task 12: Lock in, gates and commit

**Files:**
- Modify: `apps/web/eslint.config.mjs`
- Modify: `apps/web/design-lint-baseline.json` (through the script)

- [ ] **Step 1: Add to `MIGRATED`.** In `apps/web/eslint.config.mjs`, after the last Studio entry (`"src/features/studio/components/spreadsheet/**/*.tsx",` or whichever Studio entry is last on `main`), add:

```js
  "src/features/studio/components/customize/**/*.tsx",
  "src/features/studio/components/Customize*Modal.tsx",
  "src/features/studio/components/DiscoverStudioPromptsModal.tsx",
  "src/features/studio/components/SaveAsPromptModal.tsx",
  "src/features/studio/components/StudioModalDiscoverPromptsButton.tsx",
  "src/features/studio/components/CitePaperModal.tsx",
  "src/features/studio/components/CitationStylePicker.tsx",
```

  - `**/*.test.tsx` is globally ignored by this config.
  - The thumbnail override from Task 9 sits after the `MIGRATED` entry, so it still wins.

- [ ] **Step 2: Lower the baseline.** From the root: `bun run lint:design`, then `bun run lint:design:update`.
  - Expected: `features/studio` drops by 129, from 202 to **73**:

    | Rule | Before | After |
    |---|---|---|
    | `shadcn/no-arbitrary-values` | 95 | 39 |
    | `shadcn/no-inline-styles` | 5 | 1 |
    | `shadcn/no-raw-colors` | 28 | 14 |
    | `shadcn/no-unknown-classes` | 7 | 4 |
    | `solomind/soft-surfaces` | 67 | 15 |

  - Nothing else may change. The remaining 73 are PR 8's literature files.
  - If a count is off, find the file: `bunx eslint -f json src/features/studio`, from `apps/web`.

- [ ] **Step 3: Run the gates** from the root, one at a time:
  - `bun run typecheck:web`
  - `bun run typecheck:convex`
  - `bun run lint`
  - `bun run lint:design`
  - `bun run knip`. Every new export is used by now. If Knip names one, delete the export, don't silence it.
  - `bun run test:web`
  - `bunx playwright test --list`. Expected: it lists every spec and compiles.
  - `git grep -n "z-\[1[0-9][0-9]\]\|bg-black/60\|scrollbar-hide" apps/web/src/features/studio/components`. Expected: no output.
- [ ] **Step 4: Commit.**

```bash
git add apps/web/eslint.config.mjs apps/web/design-lint-baseline.json
git commit -m "chore(web): Studio create dialogs join MIGRATED; baseline drops by 129" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Visual check and PR (controller)

**Generating costs credits.** Never click a Generate button in a real notebook. Also, don't press "Save Prompt", "Publish" or "Delete" in the prompt library, because they write data.

These are free:
- opening and closing dialogs and switching options;
- typing;
- the landing page, where Generate is a no-op;
- the sign-in page, where Generate just closes the dialog and shows a toast.

**Checks:**
- **Setup:**
  - Point the session checkout at the branch head.
  - Use your own background tab on this worktree's dev server.
  - Check at 1440px and 375px, in light and dark, with reduced motion on and off.
- **Notebook Studio panel:** open each of the 8 Customize dialogs from the Create grid. Check:
  - the type tile colour matches the grid;
  - the title, description, Discover Prompts (icon-only at 375px) and Close;
  - toggling options, typing, and Cancel, Close, Escape and a scrim click;
  - Report and Spreadsheets: Edit → the prompt step → Back. Discover → Use on the grid opens Create Your Own filled in.
  - Infographic: the style grid and thumbnails in both themes.
- **Nesting:**
  - Discover over a Customize dialog: tabs, search, the sort select, Escape closes only the library, and focus returns to "Discover Prompts".
  - My Prompts: the delete button opens "Delete this prompt?" over the library. Press **Cancel** only; don't delete a real prompt.
  - Save as reusable prompt: edit the prompt text (it must stick), tick "Share in the public library" (the hint appears), then Cancel.
- **Landing (`/`):** hero → Studio tab → each of the 7 tools. Check:
  - the dialog sits **inside** the mock-up with the scrim over it only;
  - the page still scrolls;
  - Escape and a scrim click close it;
  - **no "Discover Prompts" and no "Save as reusable prompt"**;
  - Generate is a no-op, so it costs nothing.
- **Sign-in (`/sign-in`, in a signed-out tab):** the Studio preview dialogs are light even with the app in dark mode, and they show no "Discover Prompts" and no "Save as reusable prompt".
- **Literature table / papers panel:** "Cite" opens Cite Paper. Change the style, copy both citations, and press Escape.

**PR:**
- Push and open it with the title `feat(studio): create dialogs on the design system (#264, 7/8)`.
- The body covers:
  - the shell and shared fields;
  - the Radix nesting and the `embedded`/`theme`/`preview` handling (mock-ups hide the prompt library);
  - the delete confirmation in My Prompts;
  - the fixes (prompt text in Save as Prompt now editable; format cards keyboard-reachable; a library prompt applied on the Report/Spreadsheet grid now shows up);
  - the e2e selector updates;
  - the baseline drop (202 → 73);
  - screenshots at 1440 and 390 in light and dark;
  - `Part of #264`, links to the spec and this plan, and the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Ask the user before merging.

---

## Self-review

**Spec coverage (§7 and the brief):**
- **Every Customize dialog uses Dialog, Field, Label, Textarea, ToggleGroup and Select, with layout-only classes:**
  - Tasks 3–9: `Field`/`FieldLabel` (which is `Label`), `Textarea` in `PromptField`, and `ToggleGroup` in `OptionToggleGroup`.
  - `Select` appears where a dialog has a select: Discover sort and the citation picker. No Customize dialog has one.
- **Option chips become ToggleGroup items:** Task 4 (`OptionToggleGroup`), used in Tasks 5, 6, 7 and 9.
- **Discover prompts:** `bg-black/60` modal → `Dialog`, underline tabs → `Tabs`, 10–11px → `text-xs`, all in Task 2.
- **Infographic thumbnails:** they move to `InfographicStyleThumbnail.tsx` with three rules off (Task 9). The rest of that dialog is migrated normally.
- **SaveAsPromptModal, StudioModalDiscoverPromptsButton, CitePaperModal and CitationStylePicker:** Tasks 1, 2 and 10.
- **The shell and the call sites:**
  - One shell plus shared fields (Tasks 3–4).
  - Exported config types and props are kept; `theme` and `preview` are optional (Tasks 5–9).
  - Call sites:
    - `StudioPanel` is unchanged, so the real app keeps the prompt library.
    - `LandingHeroMockup` gains `preview` (`embedded` works via the frame and `container`, Task 3).
    - `AuthPage` gains `theme="light" preview` (Task 11).
  - `HomePage`/`FolderView` render `CustomizeNotebookModal`/`CustomizeFolderModal`, which are unrelated.
- **`CustomizeMindMapModal`** moves onto the shared shell (Task 6), now that the nested prompt dialogs are Radix dialogs (Tasks 1–2).
- **Form state:** it lives inside `DialogContent`.
  - Every open starts fresh, as the user decided (Decision 1). Each form tests it: the shell, Quiz and Mind Map tests.
- **Previews hide the prompt library (Decision 3):**
  - The shell's `preview` context drives it. The header skips Discover and `PromptField` skips Save.
  - Tests: the shell, `PromptField` and Quiz preview tests.
  - Wiring: the Task 11 call sites, and the Task 13 landing and sign-in checks.
- **Delete confirmation (Decision 4):** an `AlertDialog` in Task 2, with a Cancel-then-Delete test.
- **Nested dialogs:**
  - Radix stacks them, and Escape closes only the top one (Flashcards test, Task 5).
  - Focus returns to the trigger (PromptField test, Task 4).
  - Applying from Discover fills the parent's prompt (MindMap, Quiz and Report tests, and the shell test).
- **Tests:**
  - shell, fields and card tests;
  - one per dialog, asserting the emitted config;
  - Discover, SaveAs, Cite and picker tests;
  - e2e selector updates (Tasks 1, 2 and 8).
- **Gates:** per-task ESLint with `--max-warnings 0`. Then `MIGRATED`, `lint:design:update`, `knip`, `typecheck:web`, `lint`, `test:web` and `playwright --list` (Task 12).
- **Visual check** without generating (Task 13).

**Placeholder scan:**
- Every code step shows code.
- Four steps say "unchanged" or "byte for byte" about existing data. Each names exactly what to keep and what to delete:
  - the Report/Spreadsheet prompt arrays, minus `hasEdit`;
  - Audio's `FORMATS`;
  - Infographic's `VISUAL_STYLES`;
  - the Cite memos.
- Tests that mirror another task's test spell out their differences: Flashcards, Written and Spreadsheets.

**Type consistency:**
- `StudioDialogTheme` and `useStudioDialogTheme`/`StudioDialogThemeContext` come from `customize/dialogTheme.ts` (Tasks 1, 2 and 3).
- `StudioTypeKey` and `studioTypeStyleForKey` (Task 3) are used by the header and `PromptFormatPicker`. The header's `kind` values `quiz`, `flashcard`, `written`, `mindmap`, `audio`, `report`, `spreadsheet` and `infographic` all exist in `STYLES`.
- `ToggleOption`, `COUNT_OPTIONS` and `DIFFICULTY_OPTIONS` (Task 4) are used in Tasks 5–9.
- The `SaveAsPromptModal` props `isOpen`/`onClose`/`onOpen`/`trigger` (Task 1) match their use in `PromptField` (Task 4).
- The `DiscoverStudioPromptsModal` props `studioTool`/`onApplyPrompt`/`trigger` (Task 2) match the button.
- `StudioCustomizeHeader`'s `promptLibrary: { studioTool, onApplyPrompt }` and `onBack` are used as defined.
- `preview?: boolean`:
  - It's declared on the shell and the seven mock-up dialogs (Quiz, Flashcards, Written, Audio, Report, Spreadsheets, Infographic). Each passes `preview={preview}` to the shell. Mind Map has none, since it's not in a mock-up.
  - `useStudioCustomizePreview` is exported from `StudioCustomizeDialog.tsx` and read by the header and `PromptField`. That's no import cycle: the shell file doesn't import `PromptField`.
- `PromptFormat<Id>` uses `prompt: string`, never optional, so `format.prompt` is a string in `onPick` and in the Edit action.
- The button names in the tests match the components:
  - "Back to formats", "Close", "Cancel" and "Edit the {title} prompt";
  - "Rate N out of 5", "Rate this prompt" and "Report this prompt";
  - "Delete prompt", the alert dialog "Delete this prompt?", and its "Cancel" and "Delete";
  - "Sort prompts" and "Select citation style".

## Decisions

The user decided these on 2026-10-06.

1. **Drafts start fresh on every open:** each form lives inside `DialogContent`.
2. **The infographic style picker is a wrapping grid**, not the Prev/Next carousel.
3. **The landing and sign-in mock-ups hide "Discover Prompts" and "Save as reusable prompt":**
   - through an explicit `preview` prop, kept separate from `embedded`, because sign-in previews are full-screen;
   - `LandingHeroMockup` passes `embedded preview`, and `AuthPage` passes `theme="light" preview`.
4. **Deleting one of "My Prompts" asks first:** an `AlertDialog`, "Delete this prompt?", with Cancel and a destructive Delete.
5. **Defaults kept:**
   - the existing `Checkbox` for prompt visibility (no new `Switch` primitive);
   - Studio type-colour header tiles;
   - a one-line description under each title, and Cancel in every footer;
   - a library prompt applied on the Report/Spreadsheet format grid opens Create Your Own filled in.
