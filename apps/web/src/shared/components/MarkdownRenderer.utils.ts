import { createCodePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { StreamdownProps } from "streamdown";

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
