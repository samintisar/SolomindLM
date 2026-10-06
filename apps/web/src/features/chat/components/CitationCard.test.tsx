import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ReferenceChunk } from "@/shared/types/index";
import { CitationCard } from "./CitationCard";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const reference = (metadata?: ReferenceChunk["metadata"]): ReferenceChunk => ({
  id: 20,
  sourceId: "s",
  sourceTitle: "rct-emotion-2018.pdf",
  content: "Published thresholds were used to determine daily minutes of activity.",
  chunkIndex: 41,
  metadata,
});

describe("CitationCard", () => {
  test("shows the neighbouring previews the answer could draw on around the excerpt", async () => {
    render(
      <CitationCard
        refId={20}
        reference={reference({
          previousChunkPreview: "Participants wore the accelerometer for 7 days",
          nextChunkPreview: "Minutes per week of MVPA were estimated using the IPAQ-SF",
        })}
      />
    );

    expect(await screen.findByText(/Published thresholds/)).toBeInTheDocument();
    expect(screen.getByText("…Participants wore the accelerometer for 7 days")).toBeInTheDocument();
    expect(
      screen.getByText("Minutes per week of MVPA were estimated using the IPAQ-SF…")
    ).toBeInTheDocument();
  });

  test("shows only the excerpt when there are no previews", async () => {
    render(<CitationCard refId={20} reference={reference()} />);

    expect(await screen.findByText(/Published thresholds/)).toBeInTheDocument();
    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
  });
});
