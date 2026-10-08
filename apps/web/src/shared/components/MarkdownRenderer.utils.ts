import { createCodePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { StreamdownProps } from "streamdown";

/**
 * Light theme for both slots. Module scope on purpose: Streamdown's top-level memo compares props by
 * identity, so a fresh array per render would re-render every markdown block on every parent render.
 */
export const DEFAULT_SHIKI_THEME: NonNullable<StreamdownProps["shikiTheme"]> = [
  "github-light",
  "github-light",
];

const codePlugin = createCodePlugin({
  themes: ["github-light", "github-light"],
});

const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
  errorColor: "#6b7280",
});

export const streamdownPlugins: NonNullable<StreamdownProps["plugins"]> = {
  code: codePlugin,
  math: mathPlugin,
};

export interface MarkdownRendererProps
  extends Pick<
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
