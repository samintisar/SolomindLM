import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { PublicSection } from "./PublicSection";

const nb = (id: string, extra: Partial<NotebookItem> = {}): NotebookItem => ({
  id,
  title: `Notebook ${id}`,
  date: "Oct 14, 2026",
  sourceCount: 3,
  isPublic: true,
  ownerName: "Ada",
  ...extra,
});

const base = {
  viewMode: "grid" as const,
  onSelectNotebook: vi.fn(),
  isAdmin: false,
  onToggleFeatured: vi.fn(),
  onUnpublish: vi.fn(),
};

describe("PublicSection", () => {
  test("shows the Featured shelf and the Community grid", () => {
    render(
      <PublicSection
        {...base}
        featured={[nb("f1", { isFeatured: true })]}
        community={[nb("c1")]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community" })).toBeInTheDocument();
    expect(screen.getByText("Notebook f1")).toBeInTheDocument();
    expect(screen.getByText("Notebook c1")).toBeInTheDocument();
  });

  test("featuredOnly hides the Community grid", () => {
    render(
      <PublicSection
        {...base}
        featured={[nb("f1", { isFeatured: true })]}
        community={[nb("c1")]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
        featuredOnly
      />
    );
    expect(screen.getByText("Notebook f1")).toBeInTheDocument();
    expect(screen.queryByText("Notebook c1")).not.toBeInTheDocument();
  });

  test("empty state", () => {
    render(
      <PublicSection
        {...base}
        featured={[]}
        community={[]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText("No public notebooks yet.")).toBeInTheDocument();
  });

  test("no empty state while the first page loads", () => {
    const { container } = render(
      <PublicSection
        {...base}
        featured={[]}
        community={[]}
        communityStatus="LoadingFirstPage"
        onLoadMore={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("load more button when more pages exist", async () => {
    const onLoadMore = vi.fn();
    render(
      <PublicSection
        {...base}
        featured={[]}
        community={[nb("c1")]}
        communityStatus="CanLoadMore"
        onLoadMore={onLoadMore}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  test("admins get moderation menus; others don't", () => {
    const props = {
      ...base,
      featured: [],
      community: [nb("c1")],
      communityStatus: "Exhausted" as const,
      onLoadMore: vi.fn(),
    };
    const { rerender } = render(<PublicSection {...props} />);
    expect(screen.queryByRole("button", { name: "Moderation actions" })).not.toBeInTheDocument();
    rerender(<PublicSection {...props} isAdmin />);
    expect(screen.getByRole("button", { name: "Moderation actions" })).toBeInTheDocument();
  });
});
