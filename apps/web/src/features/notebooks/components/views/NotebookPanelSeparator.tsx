import { Separator } from "react-resizable-panels";

const separatorClassName =
  "z-50 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/50 [@media(pointer:coarse)]:w-0.5 [@media(pointer:coarse)]:bg-border/80";

export function NotebookPanelSeparator({
  disabled = false,
  "data-testid": testId,
}: {
  disabled?: boolean;
  "data-testid"?: string;
}) {
  return (
    <Separator
      disabled={disabled}
      className={disabled ? "w-0 overflow-hidden pointer-events-none" : separatorClassName}
      data-testid={testId}
    />
  );
}
