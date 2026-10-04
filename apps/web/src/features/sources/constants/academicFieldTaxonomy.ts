/**
 * Field-of-study taxonomy for discovery UI (aligned with common Scopus-style groupings).
 * Selected labels are sent as optional query boost terms to academic search.
 */
interface AcademicFieldItem {
  id: string;
  /** Short phrase appended to the search query when selected */
  searchTerm: string;
  label: string;
}

export interface AcademicFieldGroup {
  id: string;
  label: string;
  items: AcademicFieldItem[];
  /** Extra items revealed behind “Show N more” */
  moreItems?: AcademicFieldItem[];
}

export const ACADEMIC_FIELD_GROUPS: AcademicFieldGroup[] = [
  {
    id: "life",
    label: "Life Sciences",
    items: [
      {
        id: "agbio",
        searchTerm: "agricultural biological sciences",
        label: "Agricultural and Biological Sciences",
      },
      {
        id: "biochem",
        searchTerm: "biochemistry genetics molecular biology",
        label: "Biochemistry, Genetics and Molecular Biology",
      },
      { id: "immuno", searchTerm: "immunology microbiology", label: "Immunology and Microbiology" },
      { id: "neuro", searchTerm: "neuroscience", label: "Neuroscience" },
    ],
  },
  {
    id: "health",
    label: "Health Sciences",
    items: [
      { id: "medicine", searchTerm: "medicine", label: "Medicine" },
      { id: "nursing", searchTerm: "nursing", label: "Nursing" },
      {
        id: "pharma",
        searchTerm: "pharmacology toxicology pharmaceutics",
        label: "Pharmacology, Toxicology and Pharmaceutics",
      },
      { id: "dentistry", searchTerm: "dentistry", label: "Dentistry" },
      { id: "healthprof", searchTerm: "health professions", label: "Health Professions" },
    ],
  },
  {
    id: "physical",
    label: "Physical Sciences",
    items: [
      { id: "physics", searchTerm: "physics astronomy", label: "Physics and Astronomy" },
      { id: "chemistry", searchTerm: "chemistry", label: "Chemistry" },
      {
        id: "earth",
        searchTerm: "earth planetary sciences",
        label: "Earth and Planetary Sciences",
      },
      { id: "env", searchTerm: "environmental science", label: "Environmental Science" },
      { id: "energy", searchTerm: "energy", label: "Energy" },
      { id: "materials", searchTerm: "materials science", label: "Materials Science" },
    ],
    moreItems: [
      { id: "geology", searchTerm: "geology geophysics", label: "Geology and Geophysics" },
    ],
  },
  {
    id: "social",
    label: "Social Sciences",
    items: [
      { id: "social", searchTerm: "social sciences", label: "Social Sciences" },
      { id: "psych", searchTerm: "psychology", label: "Psychology" },
      {
        id: "econ",
        searchTerm: "economics econometrics finance",
        label: "Economics, Econometrics and Finance",
      },
      {
        id: "business",
        searchTerm: "business management accounting",
        label: "Business, Management and Accounting",
      },
      { id: "decision", searchTerm: "decision sciences", label: "Decision Sciences" },
    ],
  },
  {
    id: "formal",
    label: "Formal Sciences",
    items: [
      { id: "math", searchTerm: "mathematics", label: "Mathematics" },
      { id: "cs", searchTerm: "computer science", label: "Computer Science" },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    items: [
      { id: "eng", searchTerm: "engineering", label: "Engineering" },
      { id: "chemeng", searchTerm: "chemical engineering", label: "Chemical Engineering" },
    ],
  },
  {
    id: "humanities",
    label: "Arts & Humanities",
    items: [{ id: "arts", searchTerm: "arts humanities", label: "Arts and Humanities" }],
  },
];

export type AcademicSjrWorstAllowed = 1 | 2 | 3 | 4;

export function collectFieldSearchTerms(selectedIds: Set<string>): string[] {
  const terms: string[] = [];
  for (const g of ACADEMIC_FIELD_GROUPS) {
    for (const it of g.items) {
      if (selectedIds.has(it.id)) terms.push(it.searchTerm);
    }
    for (const it of g.moreItems ?? []) {
      if (selectedIds.has(it.id)) terms.push(it.searchTerm);
    }
  }
  return terms;
}
