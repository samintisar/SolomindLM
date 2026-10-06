import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { hasPrismaCounts, PrismaFlowDiagram } from "./PrismaFlowDiagram";

describe("PrismaFlowDiagram", () => {
  it("renders PRISMA counts when provided", () => {
    render(
      <PrismaFlowDiagram
        counts={{
          recordsIdentified: 200,
          recordsAfterDedupe: 100,
          recordsScreened: 30,
          recordsExcluded: 9,
          recordsIncluded: 21,
        }}
      />
    );
    expect(screen.getByText("PRISMA flow")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("21")).toBeTruthy();
  });

  it("returns null when no counts", () => {
    const { container } = render(<PrismaFlowDiagram counts={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("adds the user's notebook papers to the included studies", () => {
    render(
      <PrismaFlowDiagram
        counts={{
          recordsIdentified: 200,
          recordsAfterDedupe: 100,
          recordsScreened: 30,
          recordsExcluded: 18,
          recordsIncluded: 12,
          recordsFromNotebook: 4,
        }}
      />
    );
    expect(screen.getByText("From your notebook").nextSibling).toHaveTextContent("4");
    expect(screen.getByText("Included from search").nextSibling).toHaveTextContent("12");
    expect(screen.getByText("Studies included").nextSibling).toHaveTextContent("16");
  });

  it("shows only the notebook papers when no database search ran", () => {
    render(<PrismaFlowDiagram counts={{ recordsFromNotebook: 3, searchSkipped: true }} />);
    expect(screen.getByText("No database search")).toBeTruthy();
    expect(screen.queryByText("Records identified")).toBeNull();
    expect(screen.getByText("From your notebook").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Studies included").nextSibling).toHaveTextContent("3");
  });
});

describe("hasPrismaCounts", () => {
  it("is true for a search run or a papers-only run, false for nothing", () => {
    expect(hasPrismaCounts({ recordsScreened: 5 })).toBe(true);
    expect(hasPrismaCounts({ recordsFromNotebook: 2, searchSkipped: true })).toBe(true);
    expect(hasPrismaCounts({})).toBe(false);
  });
});
