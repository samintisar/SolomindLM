import { SOURCE_TYPES } from "./landingHomeContent";
import { Reveal } from "./Reveal";

export function SourceStrip() {
  return (
    <section aria-label="Sources you can add" className="px-6 py-8">
      <Reveal className="mx-auto flex max-w-280 flex-col gap-5 border-y border-border/50 py-6 lg:flex-row lg:items-center lg:gap-9">
        <p className="font-serif text-base text-muted-foreground italic lg:shrink-0">
          Bring what you already have
        </p>
        <ul className="grid flex-1 grid-cols-4 gap-x-3 gap-y-4 lg:flex lg:justify-between">
          {SOURCE_TYPES.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="flex flex-col items-center gap-1.5 text-center font-sans text-xs font-medium text-foreground/75 lg:flex-row lg:gap-2 lg:text-sm"
            >
              <Icon aria-hidden className="size-4.5 text-muted-foreground" />
              {label}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
