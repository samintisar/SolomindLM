import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { checkPrismaCounts, createEmptyPrismaState, MAX_REASONS } from "../lib/prismaFlow";
import { PrismaDiagram } from "./PrismaDiagram";
import { PrismaForm } from "./PrismaForm";

function Harness() {
  const [state, setState] = useState(createEmptyPrismaState);
  return (
    <>
      <PrismaForm state={state} warnings={checkPrismaCounts(state)} onChange={setState} />
      <PrismaDiagram state={state} />
    </>
  );
}

const diagramText = () =>
  screen.getByRole("img", { name: "PRISMA 2020 flow diagram" }).textContent ?? "";

describe("PrismaForm", () => {
  it("draws typed counts and ignores non-digits", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Records screened"), "3a25");
    expect(screen.getByLabelText("Records screened")).toHaveValue("325");
    expect(diagramText()).toContain("Records screened (n = 325)");
  });

  it("shows a warning next to a count that doesn't add up", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Records from databases"), "100");
    await user.type(screen.getByLabelText("Records screened"), "90");
    expect(
      screen.getByText("Identified 100 − removed 0 = 100, but records screened is 90.")
    ).toBeInTheDocument();
  });

  it("names, adds and removes exclusion reasons", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Reason 1"), "Wrong population");
    await user.type(screen.getByLabelText("Reason 1 count"), "12");
    expect(diagramText()).toContain("Wrong population (n = 12)");

    await user.click(screen.getByRole("button", { name: "Remove reason 3" }));
    expect(screen.queryByLabelText("Reason 3")).not.toBeInTheDocument();

    const add = screen.getByRole("button", { name: "Add reason" });
    for (let i = 2; i < MAX_REASONS; i++) await user.click(add);
    expect(add).toBeDisabled();
  });

  it("adds the other-methods fields and column", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(diagramText()).not.toContain("Identification of studies via other methods");
    await user.click(
      screen.getByRole("switch", { name: "Include other methods (websites, citation searching)" })
    );
    const other = screen.getByRole("group", { name: "Other methods" });
    await user.type(within(other).getByLabelText("Records from citation searching"), "9");
    expect(diagramText()).toContain("Identification of studies via other methods");
    expect(diagramText()).toContain("Citation searching (n = 9)");
    expect(within(other).getByLabelText("Other methods reason 1")).toBeInTheDocument();
  });
});
