import {
  BookOpen,
  ChevronRight,
  CircleAlert,
  FileText,
  Fingerprint,
  Globe,
  HardDrive,
  Library,
  type LucideIcon,
  PenLine,
  TriangleAlert,
  Upload,
  Youtube,
} from "lucide-react";
import type React from "react";
import { useId } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/components/ui/item";
import { isGoogleDrivePickerConfigured } from "../GoogleDrivePicker";
import type { AddSourceStep } from "./types";

const ACCEPTED_FILES =
  ".pdf,.docx,.pptx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.avif,.wav,.mp3,.m4a,.webm,.flac";

interface MenuOption {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface AddSourceMenuProps {
  canUpload: boolean;
  showAuthWarning: boolean;
  limitReached: boolean;
  maxSources: number;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Key of the option to focus when the menu mounts (the one that opened the previous step). */
  focusKey?: string | null;
  onSelect: (step: AddSourceStep) => void;
  onDiscover: () => void;
  onGoogleDrive: () => void;
}

export function AddSourceMenu({
  canUpload,
  showAuthWarning,
  limitReached,
  maxSources,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  fileInputRef,
  onFileSelect,
  focusKey,
  onSelect,
  onDiscover,
  onGoogleDrive,
}: AddSourceMenuProps) {
  const openFilePicker = () => fileInputRef?.current?.click();

  const linkOptions: MenuOption[] = [
    {
      key: "website",
      label: "Website",
      hint: "Paste one or more web page links",
      icon: Globe,
      onClick: () => onSelect("website"),
    },
    {
      key: "video",
      label: "Transcripts",
      hint: "YouTube, TikTok, Instagram or X video links",
      icon: Youtube,
      onClick: () => onSelect("video"),
    },
    {
      key: "text",
      label: "Copied text",
      hint: "Paste notes or any text",
      icon: FileText,
      onClick: () => onSelect("text"),
    },
    ...(isGoogleDrivePickerConfigured
      ? [
          {
            key: "drive",
            label: "Choose from Google Drive",
            hint: "Pick files from your Drive",
            icon: HardDrive,
            onClick: onGoogleDrive,
          },
        ]
      : []),
  ];

  const paperOptions: MenuOption[] = [
    {
      key: "doi",
      label: "Import from DOI",
      hint: "Look up a paper by its DOI",
      icon: Fingerprint,
      onClick: () => onSelect("doi"),
    },
    {
      key: "bibtex",
      label: "Import BibTeX or RIS",
      hint: "Upload or paste a bibliography",
      icon: FileText,
      onClick: () => onSelect("bibtex"),
    },
    {
      key: "zotero",
      label: "Import from Zotero",
      hint: "Import a Zotero BibTeX export",
      icon: BookOpen,
      onClick: () => onSelect("zotero"),
    },
    {
      key: "mendeley",
      label: "Import from Mendeley",
      hint: "Import a Mendeley BibTeX export",
      icon: Library,
      onClick: () => onSelect("mendeley"),
    },
    {
      key: "manual",
      label: "Add manually",
      hint: "Enter a paper's details yourself",
      icon: PenLine,
      onClick: () => onSelect("manual"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Sources let SolomindLM base its responses on the information that matters most to you,
          like course reading, research notes, meeting transcripts or plans.
        </p>
        <Button
          type="button"
          variant="outline"
          className="hidden sm:inline-flex"
          onClick={onDiscover}
        >
          <Globe /> Discover sources
        </Button>
      </div>

      {fileInputRef && onFileSelect && (
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={onFileSelect}
          accept={ACCEPTED_FILES}
          multiple
        />
      )}

      <div
        data-testid="source-dropzone"
        data-state={isDragging ? "dragging" : "idle"}
        aria-disabled={!canUpload || undefined}
        onClick={() => canUpload && openFilePicker()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline bg-muted/40 px-4 py-6 text-center sm:px-6 sm:py-10 transition-colors hover:bg-muted/60 aria-disabled:hover:bg-muted/40 data-[state=dragging]:border-primary data-[state=dragging]:bg-primary/10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Upload className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg">Upload sources</h3>
          {/* Drag and drop needs a pointer; phones just get the button. */}
          <p className="hidden font-sans text-sm text-muted-foreground sm:block">
            Drag and drop files here, or
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!canUpload}
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
        >
          Choose files
        </Button>
        <p className="max-w-xl font-sans text-xs text-muted-foreground">
          PDF, Word, PowerPoint, Text, Markdown, JSON, CSV, PNG, JPEG, AVIF, WAV, MP3, M4A, WebM,
          FLAC
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <OptionGroup
          heading="Links and text"
          options={linkOptions}
          disabled={!canUpload}
          focusKey={focusKey}
        />
        <OptionGroup
          heading="Research papers"
          options={paperOptions}
          disabled={!canUpload}
          focusKey={focusKey}
        />
      </div>

      {showAuthWarning && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Authentication required</AlertTitle>
          <AlertDescription>
            Please log in and select a notebook to upload sources.
          </AlertDescription>
        </Alert>
      )}
      {limitReached && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Source limit reached</AlertTitle>
          <AlertDescription>
            You've reached the maximum of {maxSources} sources. Remove some sources to add new ones.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function OptionGroup({
  heading,
  options,
  disabled,
  focusKey,
}: {
  heading: string;
  options: MenuOption[];
  disabled: boolean;
  focusKey?: string | null;
}) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  return (
    <div className="flex flex-col gap-2">
      <h3 id={headingId} className="font-sans text-xs font-medium text-muted-foreground">
        {heading}
      </h3>
      <ItemGroup variant="grouped" aria-labelledby={headingId}>
        {options.map((o) => {
          const hintId = `${baseId}-${o.key}`;
          return (
            <div key={o.key} role="listitem">
              <Item asChild size="sm" className="w-full text-left">
                <button
                  type="button"
                  className="hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50"
                  disabled={disabled}
                  autoFocus={o.key === focusKey}
                  onClick={o.onClick}
                  aria-label={o.label}
                  aria-describedby={hintId}
                >
                  <ItemMedia variant="icon">
                    <o.icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{o.label}</ItemTitle>
                    <ItemDescription id={hintId}>{o.hint}</ItemDescription>
                  </ItemContent>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </button>
              </Item>
            </div>
          );
        })}
      </ItemGroup>
    </div>
  );
}
