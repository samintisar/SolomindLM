/**
 * Strip site chrome from a scraped web page (#570): navigation menus, link lists, "related" link
 * sections, skip links, feedback widgets and share bars. Scraped pages arrive as Markdown, and on
 * many sites most of their blocks are this chrome, which then gets chunked, embedded and fed to
 * chat and Studio. The rules are generic (link density, short chrome phrases, link-out section
 * headings), not tuned to particular sites.
 *
 * The file name has two dots on purpose: Convex does not treat it as a function module.
 */

/** A block whose visible text is at least this share link text is navigation. */
const MAX_LINK_TEXT_SHARE = 0.5;
/** Chrome phrases only remove blocks shorter than this, so prose that mentions them stays. */
const MAX_CHROME_BLOCK_CHARS = 200;
/** If filtering would keep less than this share and fewer than MIN_KEPT_CHARS, keep the page. */
const MIN_KEPT_SHARE = 0.2;
const MIN_KEPT_CHARS = 500;

const MARKDOWN_LINK = /\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g;

/** Short blocks that are site furniture, not content. */
const CHROME_PHRASES =
  /<<\s*previous\b|\bnext\s*>>|\b(?:skip to (?:main )?content|skip navigation|back to top|return to top|print this page|share this (?:page|article)|was this (?:page|article|information) helpful|did you find what you were looking for|(?:give|send) (?:us )?feedback|sign up for (?:our|the) newsletter|subscribe to (?:our|the) newsletter|follow us on|cookie (?:settings|preferences|policy)|accept (?:all )?cookies|suggested searches|previous page|next page|toggle navigation|main menu|site map)\b/i;

/** What a link-out section lists, so "Related Rates" or "Popular Sovereignty" stay. */
const LISTED_THINGS =
  "(?:articles?|pages?|content|resources|links|stories|posts|topics|items|products|occupations|careers|jobs|videos|news|guides|courses|searches|reading)";

/** Headings of sections that only link out to other pages. */
const LINK_OUT_HEADING = new RegExp(
  `^#{1,6}\\s*(?:(?:related|similar|recommended|popular|trending)(?:\\s+${LISTED_THINGS})?|recommended for you|see also|more (?:from|in|on|like) (?:this|our|the)\\b.*|you (?:may|might) also (?:like|enjoy|be interested in)\\b.*|explore more\\b.*|discover more\\b.*)\\s*:?\\s*$`,
  "i"
);

const HEADING = /^(#{1,6})\s/;

function visibleText(block: string): string {
  return block
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[#*_>|`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkTextLength(block: string): number {
  let total = 0;
  for (const match of block.matchAll(MARKDOWN_LINK)) {
    total += match[1].replace(/\s+/g, " ").trim().length;
  }
  return total;
}

function isNavigationBlock(block: string): boolean {
  if (HEADING.test(block.trim()) && !block.trim().includes("\n")) return false;
  const visible = visibleText(block);
  if (visible.length === 0) return true;
  const unlinked = block.replace(MARKDOWN_LINK, "$1").replace(/\s+/g, " ");
  if (visible.length < MAX_CHROME_BLOCK_CHARS && CHROME_PHRASES.test(unlinked)) return true;
  const linkText = linkTextLength(block);
  return linkText > 0 && linkText / visible.length >= MAX_LINK_TEXT_SHARE;
}

/** Drop each section headed like a link-out list, up to the next heading of the same or higher level. */
function dropLinkOutSections(blocks: string[]): string[] {
  const kept: string[] = [];
  let skipLevel: number | null = null;
  for (const block of blocks) {
    const heading = block.trim().match(HEADING);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel !== null && level <= skipLevel) skipLevel = null;
      if (skipLevel === null && LINK_OUT_HEADING.test(block.trim().split("\n")[0])) {
        skipLevel = level;
        continue;
      }
    }
    if (skipLevel === null) kept.push(block);
  }
  return kept;
}

/** Inline cleanup in kept blocks: links become their text; values glued across cells split. */
function cleanInline(block: string): string {
  return (
    block
      // A short link tacked onto the end of a sentence ("… shipments. [Related occupations](…)").
      .replace(/([.!?])[ \t]*\[[^\]]{1,40}\]\((?:[^()]|\([^)]*\))*\)[ \t]*$/gm, "$1")
      .replace(MARKDOWN_LINK, "$1")
      // "$120,230 per year$57.80 per hour": a word glued to the next cell's amount.
      .replace(/([a-z)])([$€£]\d)/g, "$1; $2")
  );
}

export type BoilerplateResult = {
  text: string;
  /** Characters removed, as a share of the input (0 when the page was kept as it was). */
  removedShare: number;
};

/**
 * Remove site chrome from a scraped Markdown page. Keeps the page as it was when filtering would
 * leave almost nothing (a page that really is a list of links, or an unusual layout).
 */
export function stripPageBoilerplate(markdown: string): BoilerplateResult {
  const input = markdown.trim();
  if (!input) return { text: input, removedShare: 0 };
  const blocks = input.split(/\n\s*\n/);
  const kept = dropLinkOutSections(blocks)
    .filter((block) => !isNavigationBlock(block))
    .map(cleanInline)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  // A heading left with nothing under it before the next heading (or the end) goes too.
  const withoutEmptyHeadings = kept.filter((block, i) => {
    const heading = block.match(HEADING);
    if (!heading || block.includes("\n")) return true;
    const next = kept[i + 1]?.match(HEADING);
    return kept[i + 1] !== undefined && !(next && next[1].length <= heading[1].length);
  });
  const text = withoutEmptyHeadings.join("\n\n");
  if (text.length < input.length * MIN_KEPT_SHARE && text.length < MIN_KEPT_CHARS) {
    return { text: input, removedShare: 0 };
  }
  return { text, removedShare: 1 - text.length / input.length };
}
