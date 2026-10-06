import { ChevronRight } from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/cn";
import { branchColorVar, type OutlineNode } from "./outline";

/** Which branches are open, and which have ever been opened (their children stay mounted). */
export interface Expansion {
  open: ReadonlySet<string>;
  seen: ReadonlySet<string>;
}

/** Shared by every row; rebuilt each render of the outline. */
export interface TreeContext {
  expansion: Expansion;
  tabStopId: string | null;
  flash: { id: string; count: number } | null;
  canAsk: boolean;
  askDisabled: boolean;
  /** Id of the hidden "wait for the chat" note while asking is blocked, else undefined. */
  busyDescriptionId: string | undefined;
  toggle: (id: string) => void;
  ask: (node: OutlineNode, parentTopic: string) => void;
  focusItem: (id: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
}

interface OutlineItemProps {
  node: OutlineNode;
  depth: number;
  index: number;
  setSize: number;
  parentTopic: string;
  ctx: TreeContext;
}

/** One treeitem: its row, then (once opened) its children in a collapsible group. */
export function OutlineItem({ node, depth, index, setSize, parentTopic, ctx }: OutlineItemProps) {
  const hasChildren = node.children.length > 0;
  const open = hasChildren && ctx.expansion.open.has(node.id);
  const flashKey = ctx.flash?.id === node.id ? ctx.flash.count : null;
  const { register } = ctx;
  const id = node.id;
  // Stable, so a row registers once on mount and unregisters once on unmount (React 19 ref cleanup).
  const itemRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      register(id, el);
      return () => register(id, null);
    },
    [register, id]
  );
  const typeClass = cn(
    "min-w-0 text-left font-serif",
    depth === 1 ? "text-base font-semibold" : "text-sm"
  );

  let topic: ReactNode = <span className={cn("px-1", typeClass)}>{node.topic}</span>;
  if (ctx.canAsk) {
    const button = (
      <button
        type="button"
        tabIndex={-1}
        disabled={ctx.askDisabled}
        onClick={() => {
          ctx.focusItem(node.id);
          ctx.ask(node, parentTopic);
        }}
        className={cn(
          "rounded-md px-1 hover:bg-branch/12 disabled:cursor-default disabled:hover:bg-transparent",
          typeClass
        )}
      >
        {node.topic}
      </button>
    );
    topic = ctx.askDisabled ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex min-w-0">{button}</span>
        </TooltipTrigger>
        <TooltipContent>Wait for the chat to finish answering</TooltipContent>
      </Tooltip>
    ) : (
      button
    );
  }

  return (
    <div
      role="treeitem"
      aria-label={node.topic}
      aria-level={depth}
      aria-expanded={hasChildren ? open : undefined}
      aria-setsize={setSize}
      aria-posinset={index + 1}
      aria-describedby={ctx.busyDescriptionId}
      tabIndex={ctx.tabStopId === node.id ? 0 : -1}
      data-node-id={node.id}
      ref={itemRef}
      style={depth === 1 ? ({ "--branch": branchColorVar(index) } as CSSProperties) : undefined}
      className="mindmap-item rounded-lg outline-hidden"
    >
      <div className="relative isolate flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 hover:bg-muted/40">
        {flashKey !== null && (
          <span
            key={flashKey}
            aria-hidden
            className="mindmap-flash pointer-events-none absolute inset-0 -z-10 rounded-lg"
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? `Collapse ${node.topic}` : `Expand ${node.topic}`}
            onClick={() => {
              ctx.focusItem(node.id);
              ctx.toggle(node.id);
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-4 transition-transform duration-300 ease-out motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span aria-hidden className="size-6 shrink-0" />
        )}
        {depth === 1 && <span aria-hidden className="size-2 shrink-0 rounded-full bg-branch" />}
        {topic}
        {hasChildren && (
          <span
            aria-hidden
            className={cn(
              "ml-auto pr-1 font-sans text-xs text-muted-foreground tabular-nums transition-opacity",
              open && "opacity-0"
            )}
          >
            {node.children.length}
          </span>
        )}
      </div>
      {hasChildren && (
        <div
          role="group"
          className="mindmap-collapse mindmap-guide ml-4 pl-2.5"
          data-state={open ? "open" : "closed"}
        >
          <div>
            {ctx.expansion.seen.has(node.id) &&
              node.children.map((child, i) => (
                <OutlineItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  index={i}
                  setSize={node.children.length}
                  parentTopic={node.topic}
                  ctx={ctx}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
