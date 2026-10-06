import type { PaperScope } from "@convex/literatureReview/notebookPapers";
import { FileStack, Library } from "lucide-react";
import { useMemo } from "react";
import { paperScopeLabel } from "../../utils/literatureReviewPapers";
import { ComposerRadioMenu, type ComposerRadioOption } from "./ComposerRadioMenu";

type PaperScopeMenuProps = {
  value: PaperScope;
  /** Selected PDFs and saved papers the review will include. */
  paperCount: number;
  onChange: (value: PaperScope) => void;
  disabled?: boolean;
};

/** Literature review: include the user's selected papers alongside a database search, or alone. */
export function PaperScopeMenu({ value, paperCount, onChange, disabled }: PaperScopeMenuProps) {
  const options = useMemo<ComposerRadioOption<PaperScope>[]>(
    () => [
      {
        id: "papers_and_search",
        title: paperScopeLabel("papers_and_search", paperCount),
        description: "Include these papers and search the research databases for more",
        icon: Library,
      },
      {
        id: "papers_only",
        title: paperScopeLabel("papers_only", paperCount),
        description: "Review just these papers, with no database search",
        icon: FileStack,
      },
    ],
    [paperCount]
  );
  return (
    <ComposerRadioMenu
      heading="Paper scope"
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
