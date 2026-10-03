import { TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { SortOption } from "../../hooks/useNotebookSorting";
import type { ViewMode } from "./CardGrid";
import { CreateMenuButton } from "./CreateMenuButton";
import { ViewControls } from "./ViewControls";

export type HomeTab = "all" | "mine" | "featured";

interface HomeHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
  onCreateNotebook: () => void;
  onCreateFolder: () => void;
}

export function HomeHeader(props: HomeHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-foreground sm:text-3xl">
          Your notebooks
        </h1>
        <CreateMenuButton
          onCreateNotebook={props.onCreateNotebook}
          onCreateFolder={props.onCreateFolder}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine">My notebooks</TabsTrigger>
          <TabsTrigger value="featured">Featured</TabsTrigger>
        </TabsList>
        <ViewControls
          viewMode={props.viewMode}
          onViewModeChange={props.onViewModeChange}
          sortOption={props.sortOption}
          onSortChange={props.onSortChange}
        />
      </div>
    </header>
  );
}
