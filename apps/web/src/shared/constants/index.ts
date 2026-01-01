
import { Source, Message, StudioTool, Note, NotebookItem } from '@/shared/types/index';

export const MOCK_SOURCES: Source[] = [
  {
    id: '1',
    title: 'CPSC 304 - Lecture 1 Intro.pdf',
    type: 'PDF',
    date: 'Oct 12',
    selected: true,
    content: "# Introduction to Database Systems\n\n## What is a Database System?\nA database system is basically a computerized record-keeping system.\n\n### Components\n- Database: collection of persistent data\n- DBMS: software that enables users to create and maintain a database\n\n## Data Independence\n- Physical Data Independence: Ability to modify physical schema without changing logical schema.\n- Logical Data Independence: Ability to modify logical schema without changing external views."
  },
  {
    id: '2',
    title: 'Database_Systems_Complete.txt',
    type: 'TXT',
    date: 'Oct 12',
    selected: true,
    content: "CHAPTER 4: NORMALIZATION\n\nNormalization is the process of organizing data in a database. This includes creating tables and establishing relationships between those tables according to rules designed both to protect the data and to make the database more flexible by eliminating redundancy and inconsistent dependency.\n\n1NF: Atomic values.\n2NF: No partial dependencies.\n3NF: No transitive dependencies.\nBCNF: Every determinant is a candidate key."
  },
  {
    id: '3',
    title: 'SQL-99 Standards Reference',
    type: 'WEB',
    date: 'Oct 10',
    selected: false,
    content: "## SQL-99 Features\n\n1. Boolean data type\n2. Distinct types\n3. Triggers\n4. Recursive queries (WITH RECURSIVE)\n\n### Triggers\nCREATE TRIGGER name\nBEFORE | AFTER | INSTEAD OF\nINSERT | UPDATE | DELETE\nON table..."
  },
  {
    id: '4',
    title: 'Midterm Review Notes v2.pdf',
    type: 'PDF',
    date: 'Oct 08',
    selected: false,
    content: "## Midterm Topics\n\n- ER Diagrams (Weak entities, ISA hierarchies)\n- Relational Algebra (Select, Project, Join, Division)\n- SQL Queries (Group By, Having, Nested Subqueries)\n- Normalization (1NF, 2NF, 3NF, BCNF)\n\n**Study Tip:** Practice decomposing relations into BCNF."
  },
  {
    id: '5',
    title: 'Normalization Forms (1NF-3NF)',
    type: 'TXT',
    date: 'Sep 25',
    selected: false,
    content: "## Summary of Normal Forms\n\nFirst Normal Form (1NF):\n- Eliminate Repeating Groups\n- Create a separate table for each set of related data\n\nSecond Normal Form (2NF):\n- Eliminate Redundant Data\n- If an attribute depends on only part of a multi-valued key, remove it to a separate table."
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'Explain the difference between 3NF and BCNF based on these notes.',
    timestamp: new Date(Date.now() - 100000),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'Based on the *Database Systems Complete* text, the primary difference lies in how they handle functional dependencies:\n\n[1] **Third Normal Form (3NF)** allows a functional dependency X → A if X is a superkey OR if A is a prime attribute (part of a candidate key). \n\n[2] **Boyce-Codd Normal Form (BCNF)** is stricter. It requires that for every functional dependency X → A, X must be a superkey. \n\nEssentially, BCNF removes the "prime attribute" loophole found in 3NF.',
    citations: [1, 2],
    references: [
      {
        id: 1,
        sourceId: '2',
        sourceTitle: 'Database_Systems_Complete.txt',
        chunkIndex: 0,
        content: 'CHAPTER 4: NORMALIZATION\n\nFirst Normal Form (1NF):\n- Eliminate Repeating Groups\n- Create a separate table for each set of related data\n- All attributes must contain only atomic (indivisible) values\n\nSecond Normal Form (2NF):\n- Eliminate Redundant Data\n- Remove all partial dependencies (non-key attributes should depend on the entire primary key, not just part of it)\n- If an attribute depends on only part of a multi-valued key, remove it to a separate table\n\nThird Normal Form (3NF):\n- Eliminate Transitive Dependencies\n- Non-key attributes must not depend on other non-key attributes\n- Every non-key attribute must be functionally dependent on the primary key alone\n\nBoyce-Codd Normal Form (BCNF):\n- Every determinant is a candidate key\n- Stricter than 3NF by eliminating all anomalies related to functional dependencies'
      },
      {
        id: 2,
        sourceId: '2',
        sourceTitle: 'Database_Systems_Complete.txt',
        chunkIndex: 1,
        content: 'FUNCTIONAL DEPENDENCIES AND NORMALIZATION\n\nFunctional Dependency (X → A):\n- Attribute A is functionally dependent on attribute X if each value of X is associated with exactly one value of A\n- Example: StudentID → StudentName (each student ID maps to exactly one name)\n\nThird Normal Form (3NF) Definition:\n- A relation is in 3NF if it is in 2NF and every non-prime attribute is non-transitively dependent on the primary key\n- In 3NF, a functional dependency X → A is allowed if either:\n  1. X is a superkey (contains the primary key)\n  2. A is a prime attribute (part of a candidate key)\n\nBoyce-Codd Normal Form (BCNF) Definition:\n- A relation is in BCNF if every non-trivial functional dependency X → A has X as a superkey\n- BCNF is stricter than 3NF because it eliminates the second condition (prime attributes)\n- This means every determinant must be a candidate key\n- BCNF removes the "prime attribute" loophole found in 3NF'
      }
    ],
    timestamp: new Date(Date.now() - 80000),
  },
];

export const STUDIO_TOOLS: StudioTool[] = [
  { id: 'audio', label: 'Audio Overview', iconName: 'AudioLines', color: 'text-indigo-600' },
  { id: 'video', label: 'Video Overview', iconName: 'Clapperboard', color: 'text-emerald-600' },
  { id: 'mindmap', label: 'Mind Map', iconName: 'GitFork', color: 'text-fuchsia-600' },
  { id: 'reports', label: 'Reports', iconName: 'FileText', color: 'text-amber-600' },
  { id: 'flashcards', label: 'Flashcards', iconName: 'Layers', color: 'text-orange-600' },
  { id: 'quiz', label: 'Quiz', iconName: 'HelpCircle', color: 'text-sky-600' },
  { id: 'infographic', label: 'Infographic', iconName: 'BarChart3', color: 'text-pink-600' },
  { id: 'slides', label: 'Slide Deck', iconName: 'Presentation', color: 'text-yellow-600' },
];

export const SAVED_NOTES: Note[] = [];

export const MOCK_NOTEBOOKS: NotebookItem[] = [
  {
    id: 'featured-1',
    title: 'How To Build A Life, from The Atlantic',
    date: 'Apr 22, 2025',
    sourceCount: 46,
    author: 'The Atlantic',
    coverColor: 'bg-orange-600',
    isFeatured: true
  },
  {
    id: 'featured-2',
    title: 'Secrets of the Super Agers',
    date: 'May 5, 2025',
    sourceCount: 17,
    author: 'Eric Topol',
    coverColor: 'bg-emerald-700',
    isFeatured: true
  },
  {
    id: 'featured-3',
    title: 'The Science Fan\'s Guide To Visiting...',
    date: 'May 12, 2025',
    sourceCount: 17,
    author: 'Travel',
    coverColor: 'bg-blue-700',
    isFeatured: true
  },
  {
    id: 'featured-4',
    title: 'Parenting Advice for the Digital Age',
    date: 'May 5, 2025',
    sourceCount: 21,
    author: 'Techno Sapiens',
    coverColor: 'bg-amber-600',
    isFeatured: true
  },
  {
    id: 'nb-1',
    title: 'CPSC 304',
    date: 'Sep 16, 2025',
    sourceCount: 39,
    coverColor: 'bg-yellow-500', // Folder-like
    icon: 'Folder'
  },
  {
    id: 'nb-2',
    title: 'The Holy Quran: Chapters and...',
    date: 'Sep 24, 2025',
    sourceCount: 1,
    coverColor: 'bg-sky-500',
    icon: 'Book'
  },
  {
    id: 'nb-3',
    title: 'STAT 404',
    date: 'Oct 6, 2025',
    sourceCount: 34,
    coverColor: 'bg-purple-400',
    icon: 'BarChart'
  },
  {
    id: 'nb-4',
    title: 'Google Data Analytics',
    date: 'Oct 21, 2025',
    sourceCount: 23,
    coverColor: 'bg-indigo-600',
    icon: 'Search'
  },
  {
    id: 'nb-5',
    title: 'CPSC 322',
    date: 'Sep 16, 2025',
    sourceCount: 33,
    coverColor: 'bg-slate-600',
    icon: 'Monitor'
  },
  {
    id: 'nb-6',
    title: 'Principles of Learning, Retrieval, Spacing...',
    date: 'Oct 15, 2025',
    sourceCount: 9,
    coverColor: 'bg-rose-500',
    icon: 'Brain'
  },
];
