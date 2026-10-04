import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  AcademicDiscoveryFiltersSection,
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "./AcademicDiscoveryFiltersSection";

function Harness({ initial = {} }: { initial?: DiscoveryAcademicFilterState }) {
  const [academic, setA] = useState<DiscoveryAcademicFilterState>(initial);
  return (
    <>
      <AcademicDiscoveryFiltersSection
        academic={academic}
        setAcademic={(p) => setA((prev) => ({ ...prev, ...p }))}
      />
      <output data-testid="api">
        {JSON.stringify(buildAcademicDiscoveryApiFilters(academic))}
      </output>
    </>
  );
}

const api = () =>
  JSON.parse(screen.getByTestId("api").textContent ?? "{}") as ReturnType<
    typeof buildAcademicDiscoveryApiFilters
  >;

describe("AcademicDiscoveryFiltersSection", () => {
  it("keeps the Academic papers heading", () => {
    render(<Harness />);
    expect(screen.getByText("Academic papers")).toBeInTheDocument();
  });

  it("offers year modes in a labelled radio group; Last N enables the Years input", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Publication year" });
    expect(within(group).getByRole("radio", { name: "All years" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Last N years" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Custom range" })).toBeInTheDocument();

    const years = screen.getByRole("spinbutton", { name: "Years" });
    expect(years).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Last N years" }));
    expect(years).toBeEnabled();
    const cy = new Date().getFullYear();
    expect(api()).toMatchObject({ publicationYearFrom: cy - 1, publicationYearTo: cy });
  });

  it("flags a custom range where From is after To and drops it from the API", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Custom range" }));
    const from = screen.getByRole("spinbutton", { name: "From" });
    const to = screen.getByRole("spinbutton", { name: "To" });
    await user.type(from, "2022");
    await user.type(to, "2010");

    expect(screen.getByText("From must be before To")).toBeInTheDocument();
    expect(from).toHaveAttribute("aria-invalid", "true");
    expect(to).toHaveAttribute("aria-invalid", "true");
    expect(api().publicationYearFrom).toBeUndefined();
    expect(api().publicationYearTo).toBeUndefined();

    await user.clear(to);
    await user.type(to, "2024");
    expect(screen.queryByText("From must be before To")).not.toBeInTheDocument();
    expect(from).not.toHaveAttribute("aria-invalid", "true");
    expect(api()).toMatchObject({ publicationYearFrom: 2022, publicationYearTo: 2024 });
  });

  it("toggles Has PDF and Open access checkboxes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const pdf = screen.getByRole("checkbox", { name: "Has PDF" });
    const oa = screen.getByRole("checkbox", { name: "Open access" });

    await user.click(pdf);
    expect(pdf).toBeChecked();
    expect(api().hasFullText).toBe(true);

    await user.click(oa);
    expect(api().openAccessOnly).toBe(true);

    await user.click(pdf);
    expect(pdf).not.toBeChecked();
    expect(api().hasFullText).toBeUndefined();
  });

  it("sets and clears the minimum citation count", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const min = screen.getByRole("spinbutton", { name: "Minimum citations" });
    expect(min).toHaveAttribute("placeholder", "Any");

    await user.type(min, "10");
    expect(api().minCitations).toBe(10);

    await user.clear(min);
    expect(api().minCitations).toBeUndefined();
  });

  it("opens the Field of study list, filters it and counts selections", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /Field of study/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Filter fields" })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Filter fields" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Neuroscience" }));
    expect(api().fieldOfStudyTerms).toEqual(["neuroscience"]);
    expect(screen.getByRole("button", { name: /Field of study/ })).toHaveAccessibleName(
      /1 selected/
    );

    await user.type(screen.getByRole("textbox", { name: "Filter fields" }), "chem");
    expect(screen.getByRole("checkbox", { name: "Chemistry" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Neuroscience" })).not.toBeInTheDocument();
  });

  it("reveals and hides a group's extra fields", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Field of study/ }));
    expect(screen.queryByRole("checkbox", { name: "Geology and Geophysics" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(screen.getByRole("checkbox", { name: "Geology and Geophysics" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByRole("checkbox", { name: "Geology and Geophysics" })).toBeNull();
  });

  it("no longer shows the journal rating (SJR) filter", () => {
    render(<Harness />);
    expect(screen.queryByText(/Journal Rating|SJR/i)).toBeNull();
  });
});

describe("buildAcademicDiscoveryApiFilters", () => {
  it("omits a custom range whose From is after To", () => {
    expect(
      buildAcademicDiscoveryApiFilters({
        publicationYearMode: "custom",
        customYearFrom: 2022,
        customYearTo: 2010,
      })
    ).toEqual({});
  });

  it("clamps Last N years to 1-80 and drops a zero minimum", () => {
    const cy = new Date().getFullYear();
    expect(
      buildAcademicDiscoveryApiFilters({ publicationYearMode: "lastN", lastNYears: 500 })
    ).toEqual({ publicationYearFrom: cy - 79, publicationYearTo: cy });
    expect(buildAcademicDiscoveryApiFilters({ minCitations: 0 })).toEqual({});
  });
});
