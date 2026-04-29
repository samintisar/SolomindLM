import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingProvider } from "./OnboardingProvider";
import { useOnboarding } from "./OnboardingContext";

const mockMutations = {
  startTour: vi.fn(async () => {}),
  advanceTourStep: vi.fn(async () => {}),
  skipTour: vi.fn(async () => {}),
  completeTour: vi.fn(async () => {}),
  getOrCreateOnboardingRow: vi.fn(async () => "row1"),
};

let mockState: {
  tourStatus: string;
  currentStepId?: string;
  checklistDismissed?: boolean;
  _id?: string;
} | null = null;
let mockChecklist = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  openStudio: false,
  generateArtifact: false,
};
let mockTour: {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  openStudio: boolean;
  generateArtifact: boolean;
  tourNotebookId?: string;
} = {
  ...mockChecklist,
  tourNotebookId: undefined,
};

vi.mock("convex/react", () => ({
  useQuery: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("getOnboardingState")) return mockState;
    if (name.includes("getChecklistProgress")) return mockChecklist;
    if (name.includes("getTourProgress")) return mockTour;
    return undefined;
  },
  useMutation: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    for (const [key, m] of Object.entries(mockMutations)) {
      if (name.includes(key)) return m;
    }
    return vi.fn();
  },
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    onboarding: {
      state: {
        getOnboardingState: { name: "getOnboardingState" },
        getOrCreateOnboardingRow: { name: "getOrCreateOnboardingRow" },
      },
      progress: {
        getChecklistProgress: { name: "getChecklistProgress" },
        getTourProgress: { name: "getTourProgress" },
      },
      mutations: {
        startTour: { name: "startTour" },
        advanceTourStep: { name: "advanceTourStep" },
        skipTour: { name: "skipTour" },
        completeTour: { name: "completeTour" },
      },
    },
  },
}));

function ProbeStep() {
  const { currentStepId, tourStatus } = useOnboarding();
  return (
    <div data-testid="probe">
      {tourStatus}:{currentStepId ?? "none"}
    </div>
  );
}

function renderWith(authenticated = true, route = "/home") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <OnboardingProvider isAuthenticated={authenticated}>
        <ProbeStep />
      </OnboardingProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const m of Object.values(mockMutations)) m.mockClear();
  mockState = null;
  mockChecklist = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    openStudio: false,
    generateArtifact: false,
  };
  mockTour = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    openStudio: false,
    generateArtifact: false,
    tourNotebookId: undefined,
  };
});

describe("OnboardingProvider", () => {
  test("calls startTour when state is pending", async () => {
    mockState = { tourStatus: "pending" };
    renderWith();
    await act(() => Promise.resolve());
    expect(mockMutations.startTour).toHaveBeenCalledTimes(1);
  });

  test("does not call startTour when state is skipped", async () => {
    mockState = { tourStatus: "skipped", _id: "row1" };
    renderWith();
    await act(() => Promise.resolve());
    expect(mockMutations.startTour).not.toHaveBeenCalled();
  });

  test("does not call startTour when state is completed", async () => {
    mockState = { tourStatus: "completed", _id: "row1" };
    renderWith();
    await act(() => Promise.resolve());
    expect(mockMutations.startTour).not.toHaveBeenCalled();
  });

  test("calls advanceTourStep when gating boolean flips on createNotebook", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "createNotebook",
      _id: "row1",
    };
    mockTour = { ...mockTour, createNotebook: false };
    const { rerender } = renderWith();
    await act(() => Promise.resolve());
    // Flip the gate
    mockTour = {
      ...mockTour,
      createNotebook: true,
      tourNotebookId: "nb1",
    };
    rerender(
      <MemoryRouter initialEntries={["/home"]}>
        <OnboardingProvider isAuthenticated={true}>
          <ProbeStep />
        </OnboardingProvider>
      </MemoryRouter>,
    );
    await act(() => Promise.resolve());
    expect(mockMutations.advanceTourStep).toHaveBeenCalledWith({
      expectedCurrentStepId: "createNotebook",
      tourNotebookId: "nb1",
    });
  });

  test("calls advanceTourStep with openStudio when notifyStudioOpen is invoked", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "openStudio",
      _id: "row1",
    };
    function ProbeWithStudioToggle() {
      const { notifyStudioOpen } = useOnboarding();
      return (
        <button data-testid="open-studio-btn" onClick={notifyStudioOpen}>
          open
        </button>
      );
    }
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <OnboardingProvider isAuthenticated={true}>
          <ProbeWithStudioToggle />
        </OnboardingProvider>
      </MemoryRouter>,
    );
    await act(() => Promise.resolve());
    await act(async () => {
      fireEvent.click(getByTestId("open-studio-btn"));
    });
    expect(mockMutations.advanceTourStep).toHaveBeenCalledWith({
      expectedCurrentStepId: "openStudio",
    });
  });
});
