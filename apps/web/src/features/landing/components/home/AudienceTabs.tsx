import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { DemoSurface } from "./demo/DemoSurface";
import { AUDIENCES, type Audience } from "./landingHomeContent";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";
import { notebookCover, toneIcon } from "./tone";

function SampleNotebook({ notebook }: { notebook: Audience["notebook"] }) {
  return (
    <DemoSurface
      aria-hidden
      inert
      elevation="floating"
      className="mx-auto w-full max-w-90 overflow-hidden"
    >
      <div
        className={notebookCover({ cover: notebook.cover, className: "flex h-24 items-end p-4" })}
      >
        <notebook.icon className="size-6" />
      </div>
      <div className="p-4.5">
        <p className="font-display text-lg font-bold">{notebook.title}</p>
        <p className="mt-0.5 font-sans text-xs text-muted-foreground">{notebook.meta}</p>
        <ul className="mt-3.5 flex flex-wrap gap-1.5 font-sans text-xs font-medium">
          {notebook.outputs.map((output) => (
            <li
              key={output.label}
              className="flex items-center gap-1.5 rounded-lg bg-background px-2 py-1.5 ring-1 ring-hairline"
            >
              <span className={toneIcon({ tone: output.tone, className: "size-4.5 rounded" })}>
                <output.icon className="size-3" />
              </span>
              {output.label}
            </li>
          ))}
        </ul>
      </div>
    </DemoSurface>
  );
}

function AudiencePanel({ audience }: { audience: Audience }) {
  return (
    <Card variant="flush">
      <div className="grid grid-cols-1 gap-10 p-6 md:p-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h3 className="font-display text-3xl leading-tight font-bold tracking-tight">
            {audience.heading}
          </h3>
          <p className="mt-3.5 font-serif text-base leading-relaxed text-foreground/70">
            {audience.body}
          </p>
          <ol className="mt-5 grid gap-3 font-sans text-sm font-medium">
            {audience.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <Link
            to={audience.link.to}
            className="mt-6 inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary hover:underline"
          >
            {audience.link.label}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <SampleNotebook notebook={audience.notebook} />
      </div>
    </Card>
  );
}

export function AudienceTabs() {
  return (
    <section
      id="use-cases"
      aria-labelledby="audience-title"
      className="scroll-mt-20 px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="audience-title"
          eyebrow="Who it's for"
          title={
            <>
              For people who have to <Accent>actually know it.</Accent>
            </>
          }
        />
        <Reveal>
          <Tabs defaultValue={AUDIENCES[0].id} className="mt-8 items-center">
            <div className="w-full sm:w-auto">
              <TabsList
                aria-label="Audience"
                className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:group-data-[orientation=horizontal]/tabs:h-auto"
              >
                {AUDIENCES.map((audience) => (
                  <TabsTrigger key={audience.id} value={audience.id}>
                    {audience.tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {AUDIENCES.map((audience) => (
              <TabsContent key={audience.id} value={audience.id} className="mt-8 w-full">
                <AudiencePanel audience={audience} />
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}
