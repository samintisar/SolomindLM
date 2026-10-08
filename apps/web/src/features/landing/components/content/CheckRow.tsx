import { cva } from "class-variance-authority";
import { Check } from "lucide-react";

const checkRow = cva("grid grid-cols-1 gap-4 font-sans text-sm sm:grid-cols-2", {
  variants: {
    columns: {
      2: "lg:grid-cols-2",
      4: "lg:grid-cols-4",
    },
  },
  defaultVariants: { columns: 4 },
});

/** Proof points and summary bullets as a row of checks. */
export function CheckRow({ items, columns }: { items: string[]; columns?: 2 | 4 }) {
  return (
    <ul className={checkRow({ columns })}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 leading-relaxed">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}
