import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Header } from "./Header";

const mockUseQuery = vi.fn();
const mockRestartTour = vi.fn(async () => {});
const mockShowChecklist = vi.fn(async () => {});
let capturedAvatarProps:
  | {
      onRestartTour?: () => void;
      onShowChecklist?: () => void;
      showChecklistDismissed?: boolean;
    }
  | null = null;

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/home", search: "" }),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("restartTour")) return mockRestartTour;
    if (name.includes("showChecklist")) return mockShowChecklist;
    return vi.fn();
  },
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    onboarding: {
      state: { getOnboardingState: { name: "getOnboardingState" } },
      mutations: {
        restartTour: { name: "restartTour" },
        showChecklist: { name: "showChecklist" },
      },
    },
  },
}));

vi.mock("../../features/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "user@example.com", name: "User" },
    isAuthenticated: true,
    signOut: vi.fn(async () => {}),
  }),
}));

vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("./DropdownMenu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
}));

vi.mock("../../features/auth/components/AvatarDropdown", () => ({
  AvatarDropdown: (props: {
    onRestartTour?: () => void;
    onShowChecklist?: () => void;
    showChecklistDismissed?: boolean;
  }) => {
    capturedAvatarProps = props;
    return <div data-testid="avatar-dropdown" />;
  },
}));

describe("Header onboarding action wiring", () => {
  beforeEach(() => {
    capturedAvatarProps = null;
    mockUseQuery.mockReset();
    mockRestartTour.mockClear();
    mockShowChecklist.mockClear();
  });

  test("shows checklist restore action only when dismissed and not completed", () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "active",
    });
    render(
      <Header
        title="Notebook"
        onRename={vi.fn()}
        isHome={true}
        onLogoClick={vi.fn()}
      />,
    );
    expect(capturedAvatarProps?.showChecklistDismissed).toBe(true);
  });

  test("hides checklist restore action when tour already completed", () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "completed",
    });
    render(
      <Header
        title="Notebook"
        onRename={vi.fn()}
        isHome={true}
        onLogoClick={vi.fn()}
      />,
    );
    expect(capturedAvatarProps?.showChecklistDismissed).toBe(false);
  });

  test("forwards restart/show handlers to mutations", async () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "active",
    });
    render(
      <Header
        title="Notebook"
        onRename={vi.fn()}
        isHome={true}
        onLogoClick={vi.fn()}
      />,
    );

    await capturedAvatarProps?.onRestartTour?.();
    await capturedAvatarProps?.onShowChecklist?.();

    expect(mockRestartTour).toHaveBeenCalledTimes(1);
    expect(mockShowChecklist).toHaveBeenCalledTimes(1);
  });
});
