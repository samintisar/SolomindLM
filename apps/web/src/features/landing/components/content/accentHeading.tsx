import { Accent } from "../home/SectionHeading";

/** Renders `text` with `accent` (a substring of it) in the landing accent style. */
export function AccentHeading({ text, accent }: { text: string; accent?: string }) {
  const at = accent ? text.indexOf(accent) : -1;
  if (!accent || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Accent>{accent}</Accent>
      {text.slice(at + accent.length)}
    </>
  );
}
