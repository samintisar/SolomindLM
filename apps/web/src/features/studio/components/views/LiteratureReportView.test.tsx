import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiteratureReportView } from "./LiteratureReportView";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const REPORT = {
  title: "Transformers in NLP",
  content: "",
  citationStyle: "apa7" as const,
  sections: [
    { heading: "Introduction", content: "Transformers changed NLP." },
    { heading: "Methods", content: "We searched three databases." },
  ],
  citationIds: [],
};
const CITATIONS = {
  c1: {
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani"],
    year: 2017,
    url: "https://arxiv.org/abs/1706.03762",
  },
};

describe("LiteratureReportView", () => {
  it("renders sections, the PRISMA flow under Methods and the references", async () => {
    render(
      <LiteratureReportView
        report={REPORT}
        citations={CITATIONS}
        workflowProvenance={{ recordsIdentified: 40, recordsScreened: 20, recordsIncluded: 8 }}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Transformers in NLP", level: 1 })
    ).toBeInTheDocument();
    expect(await screen.findByText("Transformers changed NLP.")).toBeInTheDocument();
    const methods = screen.getByRole("heading", { name: "Methods" }).closest("section");
    expect(within(methods as HTMLElement).getByText("PRISMA flow")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "References" })).toBeInTheDocument();
    expect(screen.getByText(/Ashish Vaswani \(2017\)/)).toBeInTheDocument();
  });

  it("exports Markdown from the Export menu", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<LiteratureReportView report={REPORT} onExport={onExport} />);
    const trigger = screen.getByRole("button", { name: "Export report" });
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toHaveAttribute("aria-labelledby", trigger.id);
    await user.click(await screen.findByRole("menuitem", { name: "Export Markdown (.md)" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("prints from Export PDF only after the menu has closed", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<LiteratureReportView report={REPORT} />);
    await user.click(screen.getByRole("button", { name: "Export report" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export PDF" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    print.mockRestore();
  });

  it("keeps one toolbar on phones: Back to Studio leads it and the label shows once", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<LiteratureReportView report={REPORT} onBack={onBack} />);
    expect(screen.getAllByText("Literature Report")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("Save and edit shows its saving state until the save resolves", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onSaveAndEdit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    render(<LiteratureReportView report={REPORT} onSaveAndEdit={onSaveAndEdit} />);
    await user.click(screen.getByRole("button", { name: "Save and edit document" }));
    expect(screen.getByRole("button", { name: "Saving document" })).toBeDisabled();
    resolve();
    expect(await screen.findByRole("button", { name: "Save and edit document" })).toBeEnabled();
  });
});
