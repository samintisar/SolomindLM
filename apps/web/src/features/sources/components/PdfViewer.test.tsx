import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { PdfViewer } from "./PdfViewer";

vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

const pageRenders = vi.hoisted(() => new Map<number, number>());

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children?: ReactNode;
    onLoadSuccess?: (pdf: { numPages: number }) => void;
  }) => {
    // Async like the real loader: the viewer resets its state in an effect on mount.
    useEffect(() => {
      const id = setTimeout(() => onLoadSuccess?.({ numPages: 3 }), 0);
      return () => clearTimeout(id);
    }, [onLoadSuccess]);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => {
    pageRenders.set(pageNumber, (pageRenders.get(pageNumber) ?? 0) + 1);
    return <div data-testid={`page-${pageNumber}`} />;
  },
  Outline: () => <div data-testid="pdf-outline" />,
}));

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
    takeRecords = () => [];
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

describe("PdfViewer toolbar", () => {
  test("labels every toolbar control", async () => {
    render(<PdfViewer file="blob:test.pdf" />);

    for (const name of ["Toggle outline", "Previous page", "Next page", "Zoom out", "Zoom in"]) {
      expect(await screen.findByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Go to page" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "PDF controls" })).toBeInTheDocument();
  });

  test("the page input commits a clamped value on blur", async () => {
    const user = userEvent.setup();
    render(<PdfViewer file="blob:test.pdf" />);

    const input = await screen.findByRole("textbox", { name: "Go to page" });
    await user.clear(input);
    await user.type(input, "9");
    expect(input).toHaveValue("9");
    await user.tab();

    expect(input).toHaveValue("3");
  });

  test("the page input accepts digits only", async () => {
    const user = userEvent.setup();
    render(<PdfViewer file="blob:test.pdf" />);

    const input = await screen.findByRole("textbox", { name: "Go to page" });
    await user.clear(input);
    await user.type(input, "a2b");

    expect(input).toHaveValue("2");
  });

  test("previous is disabled on the first page and zoom out stops at 50%", async () => {
    const user = userEvent.setup();
    render(<PdfViewer file="blob:test.pdf" />);

    expect(await screen.findByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    for (let i = 0; i < 5; i++) await user.click(zoomOut);

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
  });

  test("the outline toggle shows and hides the outline", async () => {
    const user = userEvent.setup();
    render(<PdfViewer file="blob:test.pdf" />);

    const toggle = await screen.findByRole("button", { name: "Toggle outline" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("pdf-outline")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("pdf-outline")).toBeInTheDocument();
  });
});

describe("PdfViewer page virtualization", () => {
  let observerCallback: IntersectionObserverCallback | null = null;
  let observerOptions: IntersectionObserverInit | undefined;
  const observed: Element[] = [];

  beforeAll(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          observerCallback = cb;
          observerOptions = options;
        }
        observe = (el: Element) => {
          observed.push(el);
        };
        unobserve = () => undefined;
        disconnect = () => {
          observed.length = 0;
        };
        takeRecords = () => [];
      }
    );
  });

  afterEach(() => {
    pageRenders.clear();
  });

  function report(pageNumber: number, isIntersecting: boolean) {
    const target = observed.find((el) => (el as HTMLElement).dataset.page === String(pageNumber));
    if (!target) throw new Error(`page ${pageNumber} slot is not observed`);
    act(() => {
      observerCallback?.(
        [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
  }

  test("observes every page slot with a single membership threshold", async () => {
    render(<PdfViewer file="blob:test.pdf" />);
    await screen.findByTestId("page-1");

    expect(observed).toHaveLength(3);
    expect(observerOptions?.threshold).toBe(0);
  });

  test("an observer report that changes nothing re-renders no pages", async () => {
    render(<PdfViewer file="blob:test.pdf" />);
    await screen.findByTestId("page-1");
    const before = pageRenders.get(1);

    report(1, true);
    report(3, false);

    expect(pageRenders.get(1)).toBe(before);
  });

  test("a page entering the viewport renders without re-rendering the others", async () => {
    render(<PdfViewer file="blob:test.pdf" />);
    await screen.findByTestId("page-1");
    const before = pageRenders.get(1);
    expect(screen.queryByTestId("page-2")).not.toBeInTheDocument();

    report(2, true);

    expect(screen.getByTestId("page-2")).toBeInTheDocument();
    expect(pageRenders.get(1)).toBe(before);

    report(1, false);
    expect(screen.queryByTestId("page-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-2")).toBeInTheDocument();
  });
});

describe("PdfViewer initial page", () => {
  test("scrolls to initialPage once the document loads", async () => {
    const scrolled: Element[] = [];
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element
    ) {
      scrolled.push(this);
    });

    render(<PdfViewer file="blob:test.pdf" initialPage={3} />);

    await vi.waitFor(() =>
      expect(scrolled.map((el) => el.getAttribute("data-page"))).toContain("3")
    );
    scroll.mockRestore();
  });

  test("renders only the initial page at first, so pages above it keep their placeholder height", async () => {
    render(<PdfViewer file="blob:test.pdf" initialPage={3} />);

    expect(await screen.findByTestId("page-3")).toBeInTheDocument();
    expect(screen.queryByTestId("page-1")).not.toBeInTheDocument();
  });
});
