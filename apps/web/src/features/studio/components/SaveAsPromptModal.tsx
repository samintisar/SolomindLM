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
function SavePromptForm({
  studioTool,
  initialPromptText,
  notebookId,
  onClose,
}: SavePromptFormProps) {
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
          <p
            data-testid="save-as-prompt-tool-label"
            className="font-sans text-xs text-muted-foreground"
          >
            {TOOL_LABELS[studioTool]}
          </p>
          <DialogTitle>Save as Prompt</DialogTitle>
          <DialogDescription>Keep it in your library to reuse later.</DialogDescription>
        </div>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            data-testid="save-as-prompt-close"
          >
            <X />
          </Button>
        </DialogClose>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-title`}>
              Title{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
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
              Prompt text{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
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
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Bookmark data-icon="inline-start" />
            )}
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
