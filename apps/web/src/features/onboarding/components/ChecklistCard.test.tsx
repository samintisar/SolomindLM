import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChecklistCard } from "./ChecklistCard";

const mockDismiss = vi.fn(async () => {});
const mockProgress = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  generateArtifact: false,
};
const mockState: { tourStatus: string; checklistDismissed: boolean } = {
  tourStatus: "active",
  checklistDismissed: false,
};

vi.mock("convex/react", () => ({
  useQuery: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("getChecklistProgress")) return mockProgress;
    if (name.includes("getOnboardingState")) return mockState;
    return undefined;
  },
  useMutation: () => mockDismiss,
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    onboarding: {
      progress: { getChecklistProgress: { name: "getChecklistProgress" } },
      state: { getOnboardingState: { name: "getOnboardingState" } },
      mutations: { dismissChecklist: { name: "dismissChecklist" } },
    },
  },
}));

vi.mock("@/shared/hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError: vi.fn() }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChecklistCard />
    </MemoryRouter>,
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
    render(
      <MemoryRouter initialEntries={["/notebook/abc"]}>
        <ChecklistCard />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Get started/i)).toBeInTheDocument();
  });
});
