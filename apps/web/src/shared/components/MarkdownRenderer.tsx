import { Streamdown, type StreamdownProps } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";

/**
 * Shiki themes for fenced blocks must match the code panel background from `index.css`.
 * We use light panels everywhere so `github-light` tokens (dark, saturated hues) stay readable.
 */
const codePlugin = createCodePlugin({
  themes: ["github-light", "github-light"],
});

/** Shared plugins for all app markdown (Shiki + KaTeX). Inline $...$ enabled to match previous app behavior. */
const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
  errorColor: "#6b7280",
});

export const streamdownPlugins: NonNullable<StreamdownProps["plugins"]> = {
  code: codePlugin,
  math: mathPlugin,
};

export interface MarkdownRendererProps extends Pick<
  StreamdownProps,
  | "className"
  | "components"
  | "controls"
  | "isAnimating"
  | "lineNumbers"
  | "mode"
  | "parseIncompleteMarkdown"
  | "shikiTheme"
> {
  children: string;
  /** Word/stream animation; prefer false for static Studio content. */
  animated?: StreamdownProps["animated"];
}

/**
 * Shared markdown renderer (Streamdown + code + math plugins).
 * Lazy-load this component in feature modules to keep the markdown chunk isolated.
 */
export default function MarkdownRenderer({
  children,
  components,
  className,
  mode = "static",
  parseIncompleteMarkdown = mode === "streaming",
  isAnimating = false,
  animated = mode === "streaming" ? isAnimating : false,
  controls = false,
  lineNumbers = false,
  shikiTheme = ["github-light", "github-light"],
  ...rest
}: MarkdownRendererProps) {
  return (
    <Streamdown
      mode={mode}
      parseIncompleteMarkdown={parseIncompleteMarkdown}
      isAnimating={isAnimating}
      animated={animated}
      plugins={streamdownPlugins}
      components={components}
      className={className}
      controls={controls}
      lineNumbers={lineNumbers}
      shikiTheme={shikiTheme}
      {...rest}
    >
      {children}
    </Streamdown>
  );
}
