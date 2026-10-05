import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReportNote, UserNote } from "@/shared/types/index";
import { ReportView } from "./ReportView";
import { UserNoteView } from "./UserNoteView";

// A stand-in renderer: it prints its children and applies `components` to a link and an image,
// so the tests can see what each view lets through without loading Streamdown.
vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({
    children,
    className,
    components,
  }: {
    children: ReactNode;
    className?: string;
    components?: Record<string, (props: { children?: ReactNode }) => ReactNode>;
  }) => (
    <div data-testid="markdown" className={className}>
      <p>{children}</p>
      {components?.a ? (
        components.a({ children: "a link" })
      ) : (
        <a href="https://example.com">a link</a>
      )}
      {components?.img ? (
        components.img({})
      ) : (
        <img alt="a picture" src="https://example.com/x.png" />
      )}
    </div>
  ),
}));

function reportNote(overrides: Partial<ReportNote> = {}): ReportNote {
  return {
    id: "r1",
    title: "Findings",
    preview: "",
    type: "report",
    content: "Body text",
    status: "completed",
    metadata: { reportType: "briefing", documentIds: [] },
    ...overrides,
  } as ReportNote;
}

function userNote(overrides: Partial<UserNote> = {}): UserNote {
  return {
    id: "n1",
    title: "My note",
    preview: "",
    type: "user",
    content: "Note text",
    ...overrides,
  } as UserNote;
}

describe("ReportView", () => {
  it("renders the Markdown in the house prose", async () => {
    render(<ReportView note={reportNote()} />);
    const body = await screen.findByTestId("markdown");
    expect(body).toHaveClass("prose");
    expect(body.className).not.toMatch(/prose-|max-w-none/);
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("renders a link as plain text and drops images", async () => {
    render(<ReportView note={reportNote()} />);
    await screen.findByTestId("markdown");
    expect(screen.getByText("a link")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the error of a failed report in an alert", () => {
    render(
      <ReportView
        note={reportNote({
          status: "failed",
          content: "Partial",
          metadata: { reportType: "briefing", documentIds: [], error: "The model timed out" },
        })}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The model timed out");
  });

  it("falls back to a plain message when the stored error's message isn't text", () => {
    render(
      <ReportView
        note={reportNote({
          status: "failed",
          content: "Partial",
          metadata: {
            reportType: "briefing",
            documentIds: [],
            error: { message: { code: 500 } },
          } as unknown as ReportNote["metadata"],
        })}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("An unknown error occurred");
  });

  it("says so when there is no content", () => {
    render(<ReportView note={reportNote({ content: "" })} />);
    expect(screen.getByText("No content available")).toBeInTheDocument();
  });

  it("says a report failed when it failed with no content", () => {
    render(<ReportView note={reportNote({ content: "", status: "failed" })} />);
    expect(screen.getAllByText("Report generation failed").length).toBeGreaterThan(0);
  });

  it("goes back from the mobile bar", async () => {
    const onBack = vi.fn();
    render(<ReportView note={reportNote()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("UserNoteView", () => {
  it("renders the note in the house prose", async () => {
    render(<UserNoteView note={userNote()} />);
    const body = await screen.findByTestId("markdown");
    expect(body).toHaveClass("prose");
    expect(body.className).not.toMatch(/prose-|max-w-none/);
  });

  it("says an empty note is empty", () => {
    render(<UserNoteView note={userNote({ content: "" })} />);
    expect(screen.getByText("Empty note")).toBeInTheDocument();
  });

  it("goes back from the mobile bar", async () => {
    const onBack = vi.fn();
    render(<UserNoteView note={userNote()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
