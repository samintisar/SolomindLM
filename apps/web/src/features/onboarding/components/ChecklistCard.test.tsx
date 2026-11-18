import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { OnboardingContext, type TourStatus } from "../OnboardingContext";
import { ChecklistCard } from "./ChecklistCard";

const mockDismiss = vi.fn(async () => {});
const mockProgress = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  generateArtifact: false,
};
const mockState: { tourStatus: TourStatus; checklistDismissed: boolean } = {
  tourStatus: "active",
  checklistDismissed: false,
};

vi.mock("convex/react", () => ({
  useMutation: () => mockDismiss,
}));

vi.mock("@convex/_generated/api", () => ({
  api: { onboarding: { mutations: { dismissChecklist: { name: "dismissChecklist" } } } },
}));

vi.mock("@/shared/hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError: vi.fn() }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingContext.Provider
        value={{
          tourStatus: mockState.tourStatus,
          currentStepId: null,
          initFailed: false,
          checklist: mockProgress,
          checklistDismissed: mockState.checklistDismissed,
          skip: vi.fn(async () => {}),
        }}
      >
        <ChecklistCard />
      </OnboardingContext.Provider>
    </MemoryRouter>
  );
}

describe("ChecklistCard", () => {
  test("does not render when tourStatus is completed", () => {
    mockState.tourStatus = "completed";
    renderAt("/home");
    expect(screen.queryByText(/Get started/i)).toBeNull();
  });

  test("does not render when checklistDismissed is true", () => {
    mockState.tourStatus = "active";
    mockState.checklistDismissed = true;
    renderAt("/home");
    expect(screen.queryByText(/Get started/i)).toBeNull();
    mockState.checklistDismissed = false;
  });

  test("does not render on /sign-in", () => {
    mockState.tourStatus = "active";
    renderAt("/sign-in");
    expect(screen.queryByText(/Get started/i)).toBeNull();
  });

  test("renders four items on /home", () => {
    mockState.tourStatus = "active";
    renderAt("/home");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  test("dismiss button calls dismissChecklist", async () => {
    mockDismiss.mockClear();
    mockState.tourStatus = "active";
    renderAt("/home");
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  test("renders on /notebook routes", () => {
    mockState.tourStatus = "active";
    renderAt("/notebook/abc");
    expect(screen.getByText(/Get started/i)).toBeInTheDocument();
  });

  test("header actions are labelled icon buttons and collapse toggles the list", async () => {
    mockState.tourStatus = "active";
    window.localStorage.removeItem("onboardingChecklistCollapsed");
    renderAt("/home");
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
