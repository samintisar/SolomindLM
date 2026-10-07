import {
  ChevronRight,
  CircleAlert,
  FileText,
  Fingerprint,
  Globe,
  HardDrive,
  type LucideIcon,
  PenLine,
  TriangleAlert,
  Upload,
  Youtube,
} from "lucide-react";
import type React from "react";
import { useId, useRef, useState } from "react";
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
import { useToast } from "@/shared/contexts/useToast";
import {
  ACCEPTED_FILE_TYPE_LABELS,
  ACCEPTED_FILE_TYPES,
  isAcceptedFile,
} from "../../constants/acceptedFileTypes";
import { isGoogleDrivePickerConfigured } from "../GoogleDrivePicker";
import type { AddSourceStep } from "./types";

const ACCEPTED_FILES = ACCEPTED_FILE_TYPES.join(",");

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
  /** Upload files picked or dropped on the drop zone. */
  onFiles: (files: File[]) => Promise<void>;
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
  onFiles,
  focusKey,
  onSelect,
  onDiscover,
  onGoogleDrive,
}: AddSourceMenuProps) {
  const { info: showInfo } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lives here so it resets whenever the menu unmounts (dialog closed or a step opened).
  const [isDragging, setIsDragging] = useState(false);
  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    await onFiles(Array.from(input.files ?? []));
    // Clear so picking the same file again still fires a change.
    input.value = "";
  };

  const stopEvent = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    if (canUpload) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    // Only clear when leaving the drop zone itself, not one of its children.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    stopEvent(e);
    setIsDragging(false);
    if (!canUpload) return;

    const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
    if (files.length === 0) {
      showInfo(
        `No supported files found. Supported types: ${ACCEPTED_FILE_TYPES.map((t) => t.slice(1)).join(", ")}`
      );
      return;
    }
    await onFiles(files);
  };

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
      hint: "Look up a paper by its DOI or arXiv ID",
      icon: Fingerprint,
      onClick: () => onSelect("doi"),
    },
    {
      key: "bibtex",
      label: "Import bibliography",
      hint: "BibTeX or RIS, including Zotero and Mendeley exports",
      icon: FileText,
      onClick: () => onSelect("bibtex"),
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

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        accept={ACCEPTED_FILES}
        multiple
      />

      <div
        data-testid="source-dropzone"
        data-state={isDragging ? "dragging" : "idle"}
        aria-disabled={!canUpload || undefined}
        onClick={() => canUpload && openFilePicker()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={stopEvent}
        onDrop={handleDrop}
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
          {ACCEPTED_FILE_TYPE_LABELS}
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
