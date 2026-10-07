import { Check, FlaskConical, Layers, Shuffle, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DemoLabel, DemoSurface } from "./DemoSurface";

const PAPERS = [
  {
    title: "Cardioselective β-blockers in reactive airway disease",
    type: "Meta-analysis",
    icon: Layers,
    included: true,
  },
  { title: "Bisoprolol tolerance in mild asthma", type: "RCT", icon: Shuffle, included: true },
  {
    title: "Beta blockade and airway tone in dogs",
    type: "Animal study",
    icon: FlaskConical,
    included: false,
  },
] as const;

export function LiteratureTableDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <p className="font-display text-sm font-bold">Beta blockers in asthma: review</p>
        <p className="font-sans text-xs text-muted-foreground">24 papers</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-xs">
          <thead>
            <tr className="bg-muted text-left text-muted-foreground">
              <th className="px-3.5 py-2 font-semibold">Paper</th>
              <th className="px-3.5 py-2 font-semibold">Study type</th>
              <th className="px-3.5 py-2 font-semibold">Decision</th>
            </tr>
          </thead>
          <tbody>
            {PAPERS.map((paper) => (
              <tr key={paper.title} className="border-b border-border/50 align-top last:border-b-0">
                <td className="px-3.5 py-2.5 font-serif text-xs leading-snug">{paper.title}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap text-foreground/75">
                  <span className="inline-flex items-center gap-1">
                    <paper.icon className="size-3.5 text-info" />
                    {paper.type}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  {paper.included ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 font-semibold whitespace-nowrap text-success-muted-foreground">
                      <Check className="size-3" />
                      Included
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive-muted px-2 py-0.5 font-semibold whitespace-nowrap text-destructive-muted-foreground">
                        <X className="size-3" />
                        Excluded
                      </span>
                      <span className="mt-1 block text-muted-foreground">Not human subjects</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSurface>
  );
}

const PRISMA_STEPS = [
  { label: "Found", value: 214, className: "bg-info-muted" },
  { label: "Screened", value: 96, className: "bg-card ring-1 ring-hairline" },
  { label: "Included", value: 12, className: "bg-success-muted text-success-muted-foreground" },
] as const;

export function PrismaDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-3.5", className)}>
      <DemoLabel>PRISMA flow</DemoLabel>
      <ol className="mt-2.5 flex flex-col gap-1">
        {PRISMA_STEPS.map((step, index) => (
          <li key={step.label} className="flex flex-col items-stretch gap-1">
            {index > 0 ? (
              <span className="text-center font-sans text-xs text-muted-foreground">↓</span>
            ) : null}
            <span
              className={cn(
                "flex items-center justify-between rounded-lg px-2.5 py-2 font-sans text-xs font-medium",
                step.className
              )}
            >
              {step.label}
              <span className="font-display text-base font-bold">{step.value}</span>
            </span>
          </li>
        ))}
      </ol>
    </DemoSurface>
  );
}
