import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface Crumb {
  name: string;
  path: string;
}

/** Breadcrumb trail: earlier items link back, the last one is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-sans text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path} className="inline-flex items-center gap-2">
              {index > 0 ? <ChevronRight aria-hidden className="size-3.5 text-border" /> : null}
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {item.name}
                </span>
              ) : (
                <Link to={item.path} className="transition-colors hover:text-foreground">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
