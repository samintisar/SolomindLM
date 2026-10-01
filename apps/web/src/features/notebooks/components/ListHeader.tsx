/**
 * Column labels for list view. Offsets mirror the row (card border 1px, button padding 12px, icon
 * chip 36px + 12px gap): the transparent side borders and `px-3` put "Title" over the row title
 * (`pl-12` = chip + gap), and the 8px gap + 32px spacer match the row's actions slot (`w-8` + `mr-2`)
 * so "Details" right-aligns with the row meta.
 */
export function ListHeader() {
  return (
    <div className="hidden border-b pb-2 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
      <div className="flex items-center gap-2 border-x border-transparent px-3">
        <span className="flex-1 pl-12">Title</span>
        <span className="w-40 text-right">Details</span>
        <span className="w-8" aria-hidden />
      </div>
    </div>
  );
}
