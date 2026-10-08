import { memo } from "react";
import { type TranscriptReaderProps, TranscriptReaderView } from "./TranscriptReaderView";

/**
 * The transcript reader (see `TranscriptReaderView`), memoized: the player re-renders on every
 * `timeupdate`, but the reader only needs to when the active line changes, so give it a stable
 * `onSeek` and `lines`.
 *
 * The memo wraps a plain component rather than the reader itself: in a function passed straight to
 * memo, React 19.2.0's useEffectEvent read stale props and state, so the reader went on following
 * the audio after the user had scrolled away.
 */
export const TranscriptReader = memo(function TranscriptReader(props: TranscriptReaderProps) {
  return <TranscriptReaderView {...props} />;
});
