import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Data table on the soft layered look. Borders sit on cells, not rows (`border-separate`), so a
 * `sticky` header and `pinned` first column keep their hairlines while scrolling. The wrapper is
 * the scroll container: give it a bounded height (`containerClassName="min-h-0 flex-1"`) for the
 * sticky header to stick. Pinned cells are opaque `bg-card`, so place the table on a `bg-card`
 * surface.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)}
        {...props}
      />
    </div>
  );
}

const tableHeaderVariants = cva("", {
  variants: {
    sticky: { true: "sticky top-0 z-20", false: "" },
  },
  defaultVariants: { sticky: false },
});

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<"thead"> & VariantProps<typeof tableHeaderVariants>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(tableHeaderVariants({ sticky }), className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("transition-colors data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

const tableCellVariants = cva("border-r border-b border-hairline last:border-r-0", {
  variants: {
    /** Frozen first column: opaque, so scrolled cells pass under it. */
    pinned: {
      true: "sticky left-0 z-10 bg-card in-[tr[data-state=selected]]:bg-muted",
      false: "",
    },
    /**
     * highlight: the column the page is about (e.g. ours in a comparison). `link` is the brand colour
     * that reads in both themes. The tint is a gradient over a solid fill, so a pinned cell stays opaque;
     * the fill follows a selected row like a pinned cell's does.
     */
    highlight: {
      true: "bg-card bg-linear-to-b from-link/5 to-link/5 in-[tr[data-state=selected]]:bg-muted",
      false: "",
    },
  },
  defaultVariants: { pinned: false, highlight: false },
});

const tableHeadVariants = cva("px-5 text-left font-sans font-semibold", {
  variants: {
    /** `scope="row"` (set from the prop): a body row's label, top-aligned and wrapping like its cells. */
    rowHeader: {
      true: "py-4 align-top text-sm text-foreground",
      false: "h-12 bg-muted align-middle text-xs whitespace-nowrap text-muted-foreground",
    },
    /** highlight: the column the page is about; a tint over the band's solid fill, so a sticky header stays opaque. */
    highlight: { true: "bg-linear-to-b from-link/8 to-link/8 text-link", false: "" },
  },
  defaultVariants: { rowHeader: false, highlight: false },
});

function TableHead({
  className,
  pinned,
  highlight,
  ...props
}: React.ComponentProps<"th"> & VariantProps<typeof tableCellVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        tableCellVariants({ pinned }),
        tableHeadVariants({ rowHeader: props.scope === "row", highlight }),
        className
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  pinned,
  highlight,
  ...props
}: React.ComponentProps<"td"> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ pinned, highlight }), "px-5 py-4 align-top", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 font-sans text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
