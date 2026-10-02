import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeft, File, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserLimits } from "@/features/billing/services/subscriptionApi";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Progress } from "@/shared/components/ui/progress";
import { cn } from "@/shared/utils/cn";
import { AddSourceMenu } from "./AddSourceMenu";
import { BibtexImportForm } from "./BibtexImportForm";
import { DoiForm } from "./DoiForm";
import { LibraryImportForm } from "./LibraryImportForm";
import { LinkForm } from "./LinkForm";
import { ManualPaperForm } from "./ManualPaperForm";
import { TextForm } from "./TextForm";
import type { AddSourceStep } from "./types";

export interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcesCount: number;
  userId?: string | null;
  noteId?: string | null;
  isUploading: boolean;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlUpload: (urls: string[]) => Promise<void>;
  onVideoUpload: (urls: string[]) => Promise<void>;
  onTextUpload: (text: string) => Promise<void>;
  onDiscoverClick: () => void;
  onGoogleDriveClick: () => void;
}

const MENU_COPY = {
  title: "Add sources",
  description: "Upload files, add links or text, or import papers.",
};

const STEP_COPY: Record<Exclude<AddSourceStep, "menu">, { title: string; description: string }> = {
  website: { title: "Add website", description: "Add web pages as sources." },
  video: {
    title: "Add video transcripts",
    description: "Paste video links to extract their transcripts.",
  },
  text: { title: "Paste text", description: "Add copied text as a source." },
  doi: { title: "Import from DOI", description: "Look up a paper and add its record." },
  bibtex: {
    title: "Import BibTeX or RIS",
    description: "Upload or paste a bibliography, then pick papers.",
  },
  zotero: {
    title: "Import from Zotero",
    description: "Import papers from a Zotero BibTeX export.",
  },
  mendeley: {
    title: "Import from Mendeley",
    description: "Import papers from a Mendeley BibTeX export.",
  },
  manual: { title: "Add paper manually", description: "Enter the details of a paper." },
};

export function AddSourceDialog({
  open,
  onOpenChange,
  sourcesCount,
  userId,
  noteId,
  isUploading,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  fileInputRef,
  onFileSelect,
  onUrlUpload,
  onVideoUpload,
  onTextUpload,
  onDiscoverClick,
  onGoogleDriveClick,
}: AddSourceDialogProps) {
  const [step, setStep] = useState<AddSourceStep>("menu");
  const [busy, setBusy] = useState(false);
  const { sourceLimit: maxSources, isLoading: limitsLoading } = useUserLimits();

  // Keep ref to latest onDragLeave so we don't need it in the effect deps (avoids infinite loop:
  // onDragLeave is recreated each render, so [open, onDragLeave] would retrigger after setState).
  const onDragLeaveRef = useRef(onDragLeave);
  onDragLeaveRef.current = onDragLeave;

  // Reset dragging state when the dialog closes (run only when open changes, not when callback
  // identity changes). Closing also returns to the menu, so a reopened dialog starts fresh.
  useEffect(() => {
    if (!open) {
      const syntheticEvent = {
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
        currentTarget: document.createElement("div"),
        relatedTarget: null,
      } as unknown as React.DragEvent<HTMLDivElement>;
      onDragLeaveRef.current(syntheticEvent);
      setStep("menu");
      setBusy(false);
    }
  }, [open]);

  // While the subscription is still loading the cap is not known — don't gate on
  // it (the server enforces the real limit); a Pro user would otherwise briefly
  // see the free cap and a "limit reached" state.
  const limitReached = !limitsLoading && sourcesCount >= maxSources;
  const canUpload = Boolean(userId && noteId && !limitReached);
  const showAuthWarning = !userId || !noteId;

  const close = () => onOpenChange(false);
  const done = close;
  // Stable identity: useReportBusy lists it as an effect dependency.
  const onBusyChange = useCallback((next: boolean) => setBusy(next), []);

  const copy = step === "menu" ? MENU_COPY : STEP_COPY[step];
  const notebookId = noteId as Id<"notebooks"> | null | undefined;

  const renderStep = () => {
    switch (step) {
      case "menu":
        return (
          <AddSourceMenu
            canUpload={canUpload}
            showAuthWarning={showAuthWarning}
            limitReached={limitReached}
            maxSources={maxSources}
            isDragging={isDragging}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fileInputRef={fileInputRef}
            onFileSelect={onFileSelect}
            onSelect={setStep}
            onDiscover={() => {
              close();
              onDiscoverClick();
            }}
            onGoogleDrive={() => {
              close();
              onGoogleDriveClick();
            }}
          />
        );
      case "website":
      case "video":
        return (
          <LinkForm
            key={step}
            kind={step}
            onUpload={step === "website" ? onUrlUpload : onVideoUpload}
            isUploading={isUploading}
            onDone={done}
            onBusyChange={onBusyChange}
          />
        );
      case "text":
        return (
          <TextForm
            onUpload={onTextUpload}
            isUploading={isUploading}
            onDone={done}
            onBusyChange={onBusyChange}
          />
        );
      case "doi":
        return notebookId ? (
          <DoiForm notebookId={notebookId} onDone={done} onBusyChange={onBusyChange} />
        ) : null;
      case "bibtex":
        return notebookId ? (
          <BibtexImportForm notebookId={notebookId} onDone={done} onBusyChange={onBusyChange} />
        ) : null;
      case "manual":
        return notebookId ? (
          <ManualPaperForm notebookId={notebookId} onDone={done} onBusyChange={onBusyChange} />
        ) : null;
      case "zotero":
      case "mendeley":
        return notebookId ? (
          <LibraryImportForm
            key={step}
            source={step}
            notebookId={notebookId}
            onDone={done}
            onBusyChange={onBusyChange}
          />
        ) : null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        size="wide"
        padding="none"
        showCloseButton={false}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <div className="flex items-center gap-2 px-6 pt-6 pb-4">
          {step !== "menu" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Back to add sources"
              disabled={busy}
              onClick={() => setStep("menu")}
            >
              <ArrowLeft />
            </Button>
          )}
          <DialogHeader className="min-w-0 flex-1 text-left">
            <DialogTitle>
              <span className="font-display text-xl">{copy.title}</span>
            </DialogTitle>
            <DialogDescription className={cn(step === "menu" && "sr-only")}>
              {copy.description}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" disabled={busy}>
              <X />
            </Button>
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {step === "menu" ? (
            renderStep()
          ) : (
            <div className="mx-auto w-full max-w-xl">{renderStep()}</div>
          )}
        </div>

        <div className="flex items-center gap-4 bg-muted/40 px-6 py-3 font-sans text-xs">
          <span className="flex shrink-0 items-center gap-2 font-medium text-muted-foreground">
            <File className="size-4" /> Source limit
          </span>
          <Progress
            aria-label="Source limit"
            className="flex-1"
            value={limitsLoading ? 0 : Math.min((sourcesCount / maxSources) * 100, 100)}
            tone={limitReached ? "destructive" : "default"}
          />
          <span
            className={cn(
              "font-mono font-medium",
              limitReached ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {sourcesCount} / {limitsLoading ? "…" : maxSources}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
