import type { ReactNode } from "react";

/**
 * Small previews of the infographic visual styles. They illustrate the generated image's palette,
 * not app chrome, so the palette, arbitrary-value and soft-surface design rules are off for this
 * file (apps/web/eslint.config.mjs).
 */
function Frame({ children }: { children?: ReactNode }) {
  return (
    <span aria-hidden className="block relative h-16 w-full overflow-hidden rounded-lg bg-muted/40">
      {children}
    </span>
  );
}

export function InfographicStyleThumbnail({ styleId }: { styleId: string }) {
  switch (styleId) {
    case "auto":
      return (
        <Frame>
          <span className="block absolute inset-0 bg-linear-to-br from-muted via-background to-primary/20" />
          <span className="block absolute inset-x-2 bottom-2 h-2 rounded-sm bg-linear-to-r from-transparent via-primary/35 to-transparent" />
          <span className="block absolute left-2 top-2 h-1.5 w-8 rounded-full bg-foreground/15" />
          <span className="block absolute right-3 top-4 h-1 w-10 rounded-full bg-foreground/10" />
        </Frame>
      );
    case "sketch_note":
      return (
        <Frame>
          <span className="block absolute inset-2 rounded-md border border-dashed border-foreground/25 bg-background/40" />
          <span className="block absolute left-3 top-3 h-px w-12 rotate-[-8deg] bg-foreground/30" />
          <span className="block absolute bottom-3 right-3 h-6 w-10 rotate-3 rounded-sm border border-foreground/20 bg-secondary/40" />
        </Frame>
      );
    case "kawaii":
      return (
        <Frame>
          <span className="block absolute -left-2 bottom-1 h-10 w-14 rounded-full bg-pink-300/35 blur-[2px]" />
          <span className="block absolute right-0 top-2 h-9 w-16 rounded-full bg-violet-300/30 blur-[2px]" />
          <span className="block absolute left-1/3 top-4 h-7 w-12 rounded-2xl bg-rose-200/50" />
          <span className="block absolute bottom-2 left-4 h-5 w-16 rounded-full bg-amber-100/60" />
        </Frame>
      );
    case "professional":
      return (
        <Frame>
          <span className="block absolute inset-x-0 top-0 h-2 bg-foreground/80" />
          <span className="block absolute left-2 top-4 h-1 w-14 bg-foreground/20" />
          <span className="absolute left-2 top-7 grid w-[calc(100%-1rem)] grid-cols-3 gap-1">
            <span className="block col-span-2 h-6 rounded-sm bg-foreground/10" />
            <span className="block h-6 rounded-sm bg-foreground/15" />
            <span className="block col-span-3 h-4 rounded-sm bg-foreground/8" />
          </span>
        </Frame>
      );
    case "scientific":
      return (
        <Frame>
          <span className="block absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_14%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground)_14%,transparent)_1px,transparent_1px)] bg-size-[10px_10px] opacity-45" />
          <span className="block absolute left-2 top-2 h-8 w-px bg-primary/50" />
          <span className="block absolute left-2 bottom-2 right-2 top-8 border-l border-b border-primary/40" />
          <span className="block absolute bottom-2 left-3 right-5 h-px bg-primary/35" />
        </Frame>
      );
    case "anime":
      return (
        <Frame>
          <span className="block absolute inset-0 bg-linear-to-br from-cyan-400/25 via-background to-fuchsia-500/25" />
          <span className="block absolute -right-1 top-1 h-10 w-14 -skew-x-12 rounded-sm bg-blue-500/35" />
          <span className="block absolute bottom-2 left-2 h-8 w-20 rounded-md border-2 border-foreground/45 bg-background/30" />
        </Frame>
      );
    case "clay":
      return (
        <Frame>
          <span className="block absolute left-3 top-3 h-10 w-14 rounded-2xl bg-orange-200/45 shadow-[inset_0_-4px_0_rgba(0,0,0,0.06)]" />
          <span className="block absolute bottom-2 right-4 h-9 w-11 rounded-xl bg-emerald-200/40 shadow-[inset_0_-3px_0_rgba(0,0,0,0.05)]" />
          <span className="block absolute left-10 top-8 h-6 w-16 rounded-full bg-sky-200/35 shadow-[inset_0_-2px_0_rgba(0,0,0,0.05)]" />
        </Frame>
      );
    case "editorial":
      return (
        <Frame>
          <span className="block absolute inset-x-2 top-2 space-y-1">
            <span className="block h-2 w-[85%] rounded-sm bg-foreground/75" />
            <span className="block h-1 w-full rounded-full bg-foreground/15" />
            <span className="block h-1 w-[92%] rounded-full bg-foreground/12" />
          </span>
          <span className="absolute bottom-2 left-2 right-2 grid grid-cols-3 gap-1.5">
            <span className="block col-span-2 space-y-1">
              <span className="block h-1 rounded-full bg-foreground/12" />
              <span className="block h-1 rounded-full bg-foreground/10" />
              <span className="block h-1 rounded-full bg-foreground/10" />
            </span>
            <span className="block space-y-1 border-l border-border/60 pl-1.5">
              <span className="block h-1 rounded-full bg-foreground/15" />
              <span className="block h-1 rounded-full bg-foreground/12" />
            </span>
          </span>
        </Frame>
      );
    case "instructional":
      return (
        <Frame>
          <span className="absolute left-2 top-2 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <span className="block mt-0.5 space-y-1">
              <span className="block h-1 w-20 rounded-full bg-foreground/18" />
              <span className="block h-1 w-14 rounded-full bg-foreground/12" />
            </span>
          </span>
          <span className="absolute left-2 top-9 flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-foreground">
              2
            </span>
            <span className="block mt-0.5 space-y-1">
              <span className="block h-1 w-16 rounded-full bg-foreground/14" />
              <span className="block h-1 w-20 rounded-full bg-foreground/10" />
            </span>
          </span>
        </Frame>
      );
    case "bento_grid":
      return (
        <Frame>
          <span className="absolute inset-2 grid grid-cols-4 grid-rows-3 gap-1">
            <span className="block col-span-2 row-span-2 rounded-md bg-foreground/12" />
            <span className="block rounded-md bg-foreground/10" />
            <span className="block rounded-md bg-foreground/10" />
            <span className="block col-span-2 rounded-md bg-foreground/8" />
            <span className="block rounded-md bg-foreground/14" />
            <span className="block rounded-md bg-foreground/10" />
          </span>
        </Frame>
      );
    case "bricks":
      return (
        <Frame>
          <span className="block absolute inset-2 space-y-1">
            <span className="flex gap-1">
              <span className="block h-5 flex-1 rounded-sm bg-foreground/14" />
              <span className="block h-5 flex-1 rounded-sm bg-foreground/14" />
            </span>
            <span className="flex gap-1 pl-3">
              <span className="block h-5 flex-1 rounded-sm bg-foreground/12" />
              <span className="block h-5 flex-1 rounded-sm bg-foreground/12" />
            </span>
            <span className="flex gap-1">
              <span className="block h-5 flex-1 rounded-sm bg-foreground/16" />
              <span className="block h-5 flex-1 rounded-sm bg-foreground/14" />
            </span>
          </span>
        </Frame>
      );
    default:
      return <Frame />;
  }
}
