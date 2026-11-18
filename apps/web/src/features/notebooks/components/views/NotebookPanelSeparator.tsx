import { Separator } from "react-resizable-panels";

const separatorClassName =
  "z-50 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/50 [@media(pointer:coarse)]:w-0.5 [@media(pointer:coarse)]:bg-border/80";

export function NotebookPanelSeparator({
  "data-testid": testId,
}: {
  "data-testid"?: string;
}) {
  return <Separator className={separatorClassName} data-testid={testId} />;
}
