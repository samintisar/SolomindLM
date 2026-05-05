export interface AcademicFilterState {
  database: "all" | "pubmed" | "arxiv";
  yearFilter: "all" | "last-n" | "custom";
  yearCount: number;
  yearStart?: number;
  yearEnd?: number;
  hasPdf: boolean;
  openAccess: boolean;
  minCitations?: number;
  fieldsOfStudy: string[];
  minSjrQuartile?: 1 | 2 | 3 | 4;
}

export interface FieldOfStudyCategory {
  name: string;
  fields: string[];
}

export interface AcademicFiltersProps {
  filters: AcademicFilterState;
  onChange: (filters: AcademicFilterState) => void;
  /** sidebar: sources rail · dropdown: standalone popover · embedded: inside parent panel · modal: filters dialog body */
  variant: "sidebar" | "dropdown" | "embedded" | "modal";
  onApply?: () => void;
}
