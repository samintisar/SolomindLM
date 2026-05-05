import { AcademicFilterState, FieldOfStudyCategory } from "./AcademicFilters.types";

export const DEFAULT_ACADEMIC_FILTERS: AcademicFilterState = {
  database: "all",
  yearFilter: "all",
  yearCount: 2,
  hasPdf: false,
  openAccess: false,
  fieldsOfStudy: [],
};

export const DATABASE_OPTIONS = [
  {
    value: "all" as const,
    label: "All Papers",
    description: "Search from 200M+ research papers",
    icon: "BookOpen",
  },
  {
    value: "pubmed" as const,
    label: "PubMed",
    description: "39M+ biomedical and life-science literature",
    icon: "FileText",
  },
  {
    value: "arxiv" as const,
    label: "ArXiv",
    description: "Explore research preprints from arXiv",
    icon: "Atom",
  },
];

export const FIELDS_OF_STUDY: FieldOfStudyCategory[] = [
  {
    name: "Physical Sciences",
    fields: [
      "Physics and Astronomy",
      "Chemistry",
      "Earth and Planetary Sciences",
      "Environmental Science",
      "Energy",
      "Materials Science",
    ],
  },
  {
    name: "Social Sciences",
    fields: [
      "Social Sciences",
      "Psychology",
      "Economics, Econometrics and Finance",
      "Business, Management and Accounting",
      "Decision Sciences",
    ],
  },
  {
    name: "Formal Sciences",
    fields: ["Mathematics", "Computer Science"],
  },
  {
    name: "Engineering",
    fields: ["Engineering", "Chemical Engineering"],
  },
  {
    name: "Arts \u0026 Humanities",
    fields: ["Arts and Humanities"],
  },
  {
    name: "Life Sciences",
    fields: [
      "Agricultural and Biological Sciences",
      "Biochemistry, Genetics and Molecular Biology",
      "Immunology and Microbiology",
      "Neuroscience",
    ],
  },
  {
    name: "Health Sciences",
    fields: [
      "Medicine",
      "Nursing",
      "Pharmacology, Toxicology and Pharmaceutics",
      "Dentistry",
      "Health Professions",
    ],
  },
];

export const SJR_QUARTILES = [
  {
    value: 1 as const,
    label: "Q1",
    color: "bg-green-100 text-green-950 border-green-300",
    barColor: "bg-green-500",
  },
  {
    value: 2 as const,
    label: "Q2 \u0026 Up",
    color: "bg-amber-100 text-amber-950 border-amber-300",
    barColor: "bg-amber-500",
  },
  {
    value: 3 as const,
    label: "Q3 \u0026 Up",
    color: "bg-orange-100 text-orange-950 border-orange-300",
    barColor: "bg-orange-500",
  },
  {
    value: 4 as const,
    label: "Q4 \u0026 Up",
    color: "bg-red-100 text-red-950 border-red-300",
    barColor: "bg-red-500",
  },
];
