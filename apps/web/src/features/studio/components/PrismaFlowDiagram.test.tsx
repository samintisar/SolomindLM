import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrismaFlowDiagram } from "./PrismaFlowDiagram";

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
});
