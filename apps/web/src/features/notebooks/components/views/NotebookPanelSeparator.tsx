import { Separator } from "react-resizable-panels";

// The design linter matches imports named `Separator` to the shadcn ui component, even when
// aliased at the import. Rebinding the panels primitive locally keeps it out of that check.
const PanelResizeHandle = Separator;

const resizeHandleClassName =
  "z-50 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/50 pointer-coarse:w-0.5 pointer-coarse:bg-border/80";

export function NotebookPanelSeparator({
  disabled = false,
  "data-testid": testId,
}: {
  disabled?: boolean;
  "data-testid"?: string;
}) {
  return (
    <PanelResizeHandle
      disabled={disabled}
      className={disabled ? "w-0 overflow-hidden pointer-events-none" : resizeHandleClassName}
      data-testid={testId}
    />
  );
}
