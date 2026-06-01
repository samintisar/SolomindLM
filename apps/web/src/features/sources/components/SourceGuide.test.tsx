import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SourceGuide } from "./SourceGuide";

// Mock the useSourceGuide hook
vi.mock("../hooks/useSourceGuide", () => ({
  useSourceGuide: vi.fn(),
}));

import { useSourceGuide } from "../hooks/useSourceGuide";

const mockedUseSourceGuide = vi.mocked(useSourceGuide);

describe("SourceGuide", () => {
  test("renders nothing when not loading and no data", () => {
    mockedUseSourceGuide.mockReturnValue({
      summary: null,
      topics: null,
      isLoading: false,
    });

    const { container } = render(<SourceGuide documentId="doc-1" onTopicClick={() => {}} />);

    expect(container.firstChild).toBeNull();
  });

  test("renders loading state", () => {
    mockedUseSourceGuide.mockReturnValue({
      summary: null,
      topics: null,
      isLoading: true,
    });

    render(<SourceGuide documentId="doc-1" onTopicClick={() => {}} />);

    expect(screen.getByText(/Summarizing source/)).toBeInTheDocument();
  });

  test("renders summary and topics", () => {
    mockedUseSourceGuide.mockReturnValue({
      summary: "This is a **test** summary.",
      topics: ["Topic One", "Topic Two", "Topic Three"],
      isLoading: false,
    });

    render(<SourceGuide documentId="doc-1" onTopicClick={() => {}} />);

    expect(screen.getByText(/Source guide/)).toBeInTheDocument();
    // Summary should be rendered (bold tag from markdown conversion)
    expect(screen.getByText(/test/)).toBeInTheDocument();
    expect(screen.getByText("Topic One")).toBeInTheDocument();
    expect(screen.getByText("Topic Two")).toBeInTheDocument();
    expect(screen.getByText("Topic Three")).toBeInTheDocument();
  });

  test("calls onTopicClick when topic is clicked", async () => {
    const user = userEvent.setup();
    const onTopicClick = vi.fn();

    mockedUseSourceGuide.mockReturnValue({
      summary: "Summary",
      topics: ["Clickable Topic"],
      isLoading: false,
    });

    render(<SourceGuide documentId="doc-1" onTopicClick={onTopicClick} />);

    const topicButton = screen.getByText("Clickable Topic");
    await user.click(topicButton);

    expect(onTopicClick).toHaveBeenCalledWith("Clickable Topic");
  });

  test("toggles expansion when header is clicked", async () => {
    const user = userEvent.setup();

    mockedUseSourceGuide.mockReturnValue({
      summary: "Summary text",
      topics: ["Topic"],
      isLoading: false,
    });

    render(<SourceGuide documentId="doc-1" onTopicClick={() => {}} />);

    // Initially expanded
    expect(screen.getByText("Summary text")).toBeInTheDocument();

    // Click header to collapse
    const header = screen.getByRole("button", { expanded: true });
    await user.click(header);

    // Content should be hidden
    expect(screen.queryByText("Summary text")).not.toBeInTheDocument();
  });

  test("truncates long topic text with title attribute", () => {
    const longTopic = "A".repeat(200);

    mockedUseSourceGuide.mockReturnValue({
      summary: null,
      topics: [longTopic],
      isLoading: false,
    });

    render(<SourceGuide documentId="doc-1" onTopicClick={() => {}} />);

    const topicButton = screen.getByTitle(longTopic);
    expect(topicButton).toBeInTheDocument();
  });
});
