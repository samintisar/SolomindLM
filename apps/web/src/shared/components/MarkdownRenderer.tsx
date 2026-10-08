import { Streamdown } from "streamdown";
import {
  DEFAULT_SHIKI_THEME,
  MarkdownRendererProps,
  streamdownPlugins,
} from "./MarkdownRenderer.utils";

/**
 * Shared markdown renderer (Streamdown + code + math plugins).
 * Lazy-load this component in feature modules to keep the markdown chunk isolated.
 *
 * Streamdown memoizes on prop identity, so every non-primitive default passed to it must be a
 * module-scope constant, not a literal.
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
  shikiTheme = DEFAULT_SHIKI_THEME,
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
