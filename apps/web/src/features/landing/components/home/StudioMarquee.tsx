import Marquee from "react-fast-marquee";
import { STUDIO_TILES, type StudioTile } from "./landingHomeContent";
import { Accent, SectionHeading } from "./SectionHeading";
import { toneIcon } from "./tone";

const ROWS = [STUDIO_TILES.slice(0, 6), STUDIO_TILES.slice(6)];

function TileCard({ tile }: { tile: StudioTile }) {
  return (
    <div className="mx-2 w-56 rounded-2xl bg-background p-5 shadow-xs ring-1 ring-hairline md:w-66">
      <span className={toneIcon({ tone: tile.tone, className: "size-10 rounded-xl" })}>
        <tile.icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-4 font-display text-base font-bold">{tile.title}</h3>
      <p className="mt-1 font-serif text-sm leading-normal text-muted-foreground">
        {tile.description}
      </p>
    </div>
  );
}

/**
 * The Studio band: two rows scrolling in opposite directions (#231). It keeps moving under reduced
 * motion (a slow, decorative drift, as before the redesign) and pauses on hover; autoFill repeats the
 * tiles so wide screens never show a gap.
 */
export function StudioMarquee() {
  return (
    <section
      aria-labelledby="studio-title"
      className="overflow-hidden border-y border-border/50 bg-card py-24 md:py-28"
    >
      <div className="px-6">
        <SectionHeading
          id="studio-title"
          eyebrow="Studio"
          title={
            <>
              Twelve ways to work with <Accent>one notebook.</Accent>
            </>
          }
          sub="Everything Studio makes is built from your sources and saved right next to them."
        />
      </div>
      <div className="mt-14 flex flex-col gap-4 mask-x-from-90%">
        {ROWS.map((row, index) => (
          <Marquee
            key={row[0].title}
            speed={32}
            direction={index === 0 ? "left" : "right"}
            pauseOnHover
            autoFill
          >
            {row.map((tile) => (
              <TileCard key={tile.title} tile={tile} />
            ))}
          </Marquee>
        ))}
      </div>
    </section>
  );
}
