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
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  const myTabRef = useRef<HTMLButtonElement>(null);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value === "my" ? "my" : "public")}
      className="mt-4 min-h-0 flex-1"
    >
      <TabsList variant="line" className="mx-6">
        <TabsTrigger value="public" data-testid="discover-prompts-tab-public">
          <Library />
          Public
        </TabsTrigger>
        <TabsTrigger value="my" data-testid="discover-prompts-tab-my" ref={myTabRef}>
          <Bookmark />
          My Prompts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="public" className="flex min-h-0 flex-col">
        <div className="flex items-center gap-3 px-6 pt-1 pb-3">
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
        <div className="px-6 pt-1 pb-6">
          <MyPromptsList studioTool={studioTool} onApply={onApply} tabRef={myTabRef} />
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
              void run(
                () => savePrompt(prompt._id),
                "Prompt saved to your library",
                "Failed to save prompt"
              )
            }
            onRate={(rating) =>
              void run(
                () => ratePrompt(prompt._id, rating),
                "Rating submitted",
                "Failed to rate prompt"
              )
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rate this prompt"
            onClick={() => setMode("rating")}
          >
            <Star />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Report this prompt"
            onClick={() => setMode("reporting")}
          >
            <Flag />
          </Button>
        </ItemActions>
      </>
    );
  }

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          <span className="line-clamp-1">{prompt.title}</span>
        </ItemTitle>
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
  tabRef,
}: {
  studioTool: StudioTool;
  onApply: (promptText: string) => void;
  /** The My Prompts tab: where focus lands after deleting the last prompt. */
  tabRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const result = useMyPrompts(studioTool);
  const publishPrompt = usePublishPrompt();
  const unpublishPrompt = useUnpublishPrompt();
  const deletePrompt = useDeletePrompt();
  const run = usePromptAction();
  // One confirmation for the whole list. `pendingDelete` outlives `confirmOpen` so the title stays
  // put while the dialog animates out.
  const [pendingDelete, setPendingDelete] = useState<PublicPrompt | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes when the confirmation closes: the row's delete button on Cancel; after a
  // delete (whose row is about to go), the next row's delete button, or the tab.
  const returnFocusTo = useRef<HTMLElement | null>(null);

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
    <>
      <ul className="flex flex-col gap-3">
        {prompts.map((prompt) => (
          <li key={prompt._id}>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>
                  <span className="line-clamp-1">{prompt.title}</span>
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
                        void run(
                          () => publishPrompt(prompt._id),
                          "Prompt published",
                          "Failed to publish"
                        )
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
                        void run(
                          () => unpublishPrompt(prompt._id),
                          "Prompt unpublished",
                          "Failed to unpublish"
                        )
                      }
                    >
                      <EyeOff data-icon="inline-start" />
                      Unpublish
                    </Button>
                  )}
                </ItemActions>
                <Button
                  ref={(el) => {
                    if (el) deleteButtons.current.set(prompt._id, el);
                    else deleteButtons.current.delete(prompt._id);
                  }}
                  variant="ghost-destructive"
                  size="icon-sm"
                  aria-label="Delete prompt"
                  onClick={(e) => {
                    returnFocusTo.current = e.currentTarget;
                    setPendingDelete(prompt);
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 />
                </Button>
              </ItemFooter>
            </Item>
          </li>
        ))}
      </ul>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* No `theme`: the only light context is the auth-page preview, which hides the library. */}
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocusTo.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; is removed from your library. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                const index = prompts.findIndex((p) => p._id === pendingDelete._id);
                const neighbour = prompts[index + 1] ?? prompts[index - 1];
                returnFocusTo.current =
                  (neighbour && deleteButtons.current.get(neighbour._id)) ?? tabRef.current;
                const id = pendingDelete._id;
                void run(() => deletePrompt(id), "Prompt deleted", "Failed to delete");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
