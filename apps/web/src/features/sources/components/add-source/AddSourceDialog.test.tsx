import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceUpload } from "../../hooks/useSourceUpload";
import { AddSourceDialog } from "./AddSourceDialog";

const limits = { sourceLimit: 100, isLoading: false };
vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useUserLimits: () => limits,
}));
vi.mock("../GoogleDrivePicker", () => ({ isGoogleDrivePickerConfigured: true }));
vi.mock("../../services/documentsApi", () => ({
  useResolveDoi: vi.fn(),
  useCreateDocument: vi.fn(),
  useParseBibliography: vi.fn(),
  useBulkUpload: vi.fn(),
  useGetExistingPapers: () => undefined,
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

type Props = React.ComponentProps<typeof AddSourceDialog>;

const OPTION_NAMES = [
  "Website",
  "Transcripts",
  "Copied text",
  "Choose from Google Drive",
  "Import from DOI",
  "Import bibliography",
  "Add manually",
];

type Overrides = Partial<Props> & {
  onTextUpload?: SourceUpload["handleTextUpload"];
  isUploading?: boolean;
};

function withUpload(upload: SourceUpload, { onTextUpload, isUploading }: Overrides): SourceUpload {
  return {
    ...upload,
    ...(onTextUpload && { handleTextUpload: onTextUpload }),
    ...(isUploading !== undefined && { isUploading }),
  };
}

function renderDialog(over: Overrides = {}) {
  const { onTextUpload: _text, isUploading: _uploading, ...rest } = over;
  const baseUpload: SourceUpload = {
    isUploading: false,
    processFiles: vi.fn().mockResolvedValue(undefined),
    handleUrlUpload: vi.fn().mockResolvedValue(undefined),
    handleSocialMediaUpload: vi.fn().mockResolvedValue(undefined),
    handleTextUpload: vi.fn().mockResolvedValue(undefined),
  };
  const props: Props = {
    open: true,
    onOpenChange: vi.fn(),
    sourcesCount: 3,
    userId: "u1",
    noteId: "nb1",
    upload: withUpload(baseUpload, over),
    onDiscoverClick: vi.fn(),
    onGoogleDriveClick: vi.fn(),
    ...rest,
  };
  const utils = render(<AddSourceDialog {...props} />);
  const rerenderWith = (next: Overrides) => {
    const { onTextUpload: _t, isUploading: _u, ...nextRest } = next;
    utils.rerender(
      <AddSourceDialog {...props} {...nextRest} upload={withUpload(props.upload, next)} />
    );
  };
  return { props, rerenderWith, ...utils };
}

const dialogNamed = (name: string) => screen.getByRole("dialog", { name });
const indicator = () =>
  screen
    .getByRole("progressbar", { name: "Source limit" })
    .querySelector("[data-slot=progress-indicator]");

describe("AddSourceDialog", () => {
  beforeEach(() => {
    limits.sourceLimit = 100;
    limits.isLoading = false;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens on the menu with every option, the count and the limit bar", () => {
    renderDialog();
    expect(dialogNamed("Add sources")).toBeInTheDocument();
    for (const name of OPTION_NAMES) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.getByText("3 / 100")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Source limit" })).toBeInTheDocument();
  });

  it("goes to a step and Back returns to the menu", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Import from DOI" }));
    expect(dialogNamed("Import from DOI")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to add sources" }));
    expect(dialogNamed("Add sources")).toBeInTheDocument();
  });

  it("returns focus to the option that opened the step", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Add manually" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to add sources" }));
    expect(screen.getByRole("button", { name: "Add manually" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to add sources" }));
    expect(screen.getByRole("button", { name: "Copied text" })).toHaveFocus();
  });

  it("opens the bibliography import on its first control", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Import bibliography" }));
    expect(dialogNamed("Import bibliography")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload file" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Back to add sources" }));
    expect(screen.getByRole("button", { name: "Import bibliography" })).toHaveFocus();
  });

  it("reopens on the menu after closing from a step", async () => {
    const { rerenderWith } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    expect(dialogNamed("Paste text")).toBeInTheDocument();
    rerenderWith({ open: false });
    rerenderWith({ open: true });
    expect(dialogNamed("Add sources")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to add sources" })).not.toBeInTheDocument();
  });

  it("passes the typed title with pasted text", async () => {
    const onTextUpload = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onTextUpload });
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Title (optional)" }), " Lecture 3 ");
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "Some notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(onTextUpload).toHaveBeenCalledWith("Some notes", "Lecture 3");
  });

  it("passes an empty title when none is typed, so one is written from the text", async () => {
    const onTextUpload = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onTextUpload });
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "More notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(onTextUpload).toHaveBeenCalledWith("More notes", "");
  });

  it("reopens unblocked after closing mid-submit", async () => {
    const onTextUpload = vi.fn(() => new Promise<void>(() => undefined));
    const { rerenderWith } = renderDialog({ onTextUpload });
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "Some notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    rerenderWith({ onTextUpload, open: false });
    rerenderWith({ onTextUpload, open: true });
    expect(dialogNamed("Add sources")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  it("disables every option and warns when signed out", () => {
    renderDialog({ userId: null });
    for (const name of OPTION_NAMES) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    expect(screen.getByTestId("source-dropzone")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Authentication required");
  });

  it("disables every option and turns the bar destructive at the limit", () => {
    renderDialog({ sourcesCount: 100 });
    for (const name of OPTION_NAMES) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("alert")).toHaveTextContent("Source limit reached");
    expect(indicator()).toHaveClass("bg-destructive");
  });

  it("shows an ellipsis while limits load", () => {
    limits.isLoading = true;
    renderDialog();
    expect(screen.getByText("3 / …")).toBeInTheDocument();
  });

  it("closes before opening Discover or Google Drive", async () => {
    const { props } = renderDialog();
    const onOpenChange = vi.mocked(props.onOpenChange);
    const onDiscoverClick = vi.mocked(props.onDiscoverClick);
    const onGoogleDriveClick = vi.mocked(props.onGoogleDriveClick);
    await userEvent.click(screen.getByRole("button", { name: "Discover sources" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDiscoverClick).toHaveBeenCalled();
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      onDiscoverClick.mock.invocationCallOrder[0]
    );

    onOpenChange.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Choose from Google Drive" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onGoogleDriveClick).toHaveBeenCalled();
    expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      onGoogleDriveClick.mock.invocationCallOrder[0]
    );
  });

  it("opens the file picker from Choose files and from the drop zone", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Choose files" }));
    expect(click).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId("source-dropzone"));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("does not open the file picker from a disabled drop zone", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    renderDialog({ userId: null });
    await userEvent.click(screen.getByTestId("source-dropzone"));
    expect(click).not.toHaveBeenCalled();
  });

  it("blocks outside clicks while busy, then Escape closes once the submit settles", async () => {
    let resolve: () => void = () => undefined;
    const onTextUpload = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const { props } = renderDialog({ onTextUpload });
    const onOpenChange = vi.mocked(props.onOpenChange);
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "Some notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));

    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    await userEvent.click(overlay);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialogNamed("Paste text")).toBeInTheDocument();

    // Settling calls onDone, which asks to close; the parent keeps `open`, so the dialog stays.
    await act(async () => resolve());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks Escape while a form is busy", async () => {
    const onTextUpload = vi.fn(() => new Promise<void>(() => undefined));
    const { props, rerenderWith } = renderDialog({ onTextUpload });
    await userEvent.click(screen.getByRole("button", { name: "Copied text" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "Some notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));
    rerenderWith({ onTextUpload, isUploading: true });
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to add sources" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(dialogNamed("Paste text")).toBeInTheDocument();
  });

  it("highlights the drop zone while dragging and uploads only supported dropped files", () => {
    const { props } = renderDialog();
    const zone = screen.getByTestId("source-dropzone");
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute("data-state", "dragging");

    const pdf = new File(["%PDF"], "paper.PDF", { type: "application/pdf" });
    const exe = new File(["MZ"], "tool.exe");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf, exe] } });
    expect(zone).toHaveAttribute("data-state", "idle");
    expect(props.upload.processFiles).toHaveBeenCalledWith([pdf]);
  });

  it("does not highlight or upload on drop when uploads are blocked", () => {
    const { props } = renderDialog({ userId: null });
    const zone = screen.getByTestId("source-dropzone");
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute("data-state", "idle");
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "a.pdf")] } });
    expect(props.upload.processFiles).not.toHaveBeenCalled();
  });
});
