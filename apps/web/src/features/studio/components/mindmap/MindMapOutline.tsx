import { Check, Copy } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/contexts/useToast";
import { type Expansion, OutlineItem, type TreeContext } from "./MindMapOutlineItem";
import {
  askPrompt,
  collectBranchIds,
  mainBranchId,
  type OutlineNode,
  toMarkdown,
  visibleItems,
} from "./outline";

const FLASH_MS = 1200;
const COPIED_MS = 1500;

const NOTHING_OPEN: Expansion = { open: new Set(), seen: new Set() };

function withOpened(state: Expansion, ids: readonly string[]): Expansion {
  return { open: new Set([...state.open, ...ids]), seen: new Set([...state.seen, ...ids]) };
}

export interface MindMapOutlineProps {
  title: string;
  /**
   * The map. Pass a stable (memoised) object: a different root object counts as a new map and
   * resets what is open and focused.
   */
  root: OutlineNode;
  /** Absent outside a notebook: topics are then plain text. */
  onAsk?: (prompt: string) => void;
  /** True while the chat is answering or sending is blocked. */
  askDisabled?: boolean;
}

/**
 * The mind map as a collapsible outline (WAI-ARIA tree): main branches first, each opening into
 * its sub-topics. Clicking a topic, or Enter on it, asks the notebook chat about it.
 */
export function MindMapOutline({ title, root, onAsk, askDisabled = false }: MindMapOutlineProps) {
  const { error: toastError } = useToast();
  const [shownRoot, setShownRoot] = useState(root);
  const [expansion, setExpansion] = useState<Expansion>(NOTHING_OPEN);
  const [focusedId, setFocusedId] = useState<string | null>(root.children[0]?.id ?? null);
  const [flash, setFlash] = useState<{ id: string; count: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const items = useRef(new Map<string, HTMLElement>());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A new map starts closed again (state adjusted during render, not in an effect).
  if (shownRoot !== root) {
    setShownRoot(root);
    setExpansion(NOTHING_OPEN);
    setFocusedId(root.children[0]?.id ?? null);
    setFlash(null);
  }

  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      clearTimeout(copiedTimer.current);
    },
    []
  );

  const visible = useMemo(
    () => visibleItems(root, expansion.open, title),
    [root, expansion.open, title]
  );
  const tabStopId = visible.some((item) => item.node.id === focusedId)
    ? focusedId
    : (visible[0]?.node.id ?? null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) items.current.set(id, el);
    else items.current.delete(id);
  }, []);

  const focusItem = useCallback((id: string) => {
    setFocusedId(id);
    items.current.get(id)?.focus();
  }, []);

  const openIds = useCallback((ids: readonly string[]) => {
    setExpansion((state) => withOpened(state, ids));
  }, []);

  const closeId = useCallback((id: string) => {
    setExpansion((state) => {
      const open = new Set(state.open);
      open.delete(id);
      return { ...state, open };
    });
  }, []);

  const toggle = (id: string) => (expansion.open.has(id) ? closeId(id) : openIds([id]));

  const ask = (node: OutlineNode, parentTopic: string) => {
    if (!onAsk || askDisabled) return;
    onAsk(askPrompt(node.topic, parentTopic));
    // A new count re-keys the flash overlay, so asking the same row again restarts it.
    setFlash((current) => ({ id: node.id, count: (current?.count ?? 0) + 1 }));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const expandAll = () => openIds(collectBranchIds(root));

  const collapseAll = () => {
    setExpansion((state) => ({ ...state, open: new Set() }));
    setFocusedId((id) => (id === null ? id : (mainBranchId(root, id) ?? id)));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(title, root));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      toastError("Couldn't copy the mind map");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "treeitem") return;
    const at = visible.findIndex((item) => item.node.id === target.dataset.nodeId);
    if (at < 0) return;
    const { node, depth, parent, parentTopic } = visible[at];
    const isBranch = node.children.length > 0;
    const isOpen = isBranch && expansion.open.has(node.id);
    let next: string | undefined;

    switch (event.key) {
      case "ArrowDown":
        next = visible[at + 1]?.node.id;
        break;
      case "ArrowUp":
        next = visible[at - 1]?.node.id;
        break;
      case "Home":
        next = visible[0]?.node.id;
        break;
      case "End":
        next = visible.at(-1)?.node.id;
        break;
      case "ArrowRight":
        if (isOpen) next = node.children[0].id;
        else if (isBranch) openIds([node.id]);
        break;
      case "ArrowLeft":
        if (isOpen) closeId(node.id);
        else if (depth > 1) next = parent.id;
        break;
      case "Enter":
        ask(node, parentTopic);
        break;
      case "*":
        openIds(parent.children.filter((c) => c.children.length > 0).map((c) => c.id));
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) focusItem(next);
  };

  // Keeps the tab stop on whichever row got focus, however it got there (click, Tab, script).
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") === "treeitem" && target.dataset.nodeId) {
      setFocusedId(target.dataset.nodeId);
    }
  };

  const ctx: TreeContext = {
    expansion,
    tabStopId,
    flash,
    canAsk: Boolean(onAsk),
    askDisabled,
    toggle,
    ask,
    focusItem,
    register,
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-card px-4 py-3">
        <h2 className="flex-1 truncate font-display text-lg">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={expandAll}>
          Expand all
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={collapseAll}>
          Collapse all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copied ? "Copied" : "Copy as Markdown"}
          onClick={copy}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div
        role="tree"
        aria-label={title}
        className="px-2 pb-6"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {root.children.map((child, i) => (
          <OutlineItem
            key={child.id}
            node={child}
            depth={1}
            index={i}
            setSize={root.children.length}
            parentTopic={title}
            ctx={ctx}
          />
        ))}
      </div>
    </div>
  );
}
