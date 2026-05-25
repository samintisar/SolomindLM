/**
 * ML List-Enumeration Fixtures
 *
 * Generated via NotebookLM - list-enumeration category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlListEnumerationFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-list-dbscan-point-types",
    question:
      "What are the three types of points in the DBSCAN algorithm, according to its social context analogy?",
    expectedItems: ["core points", "border points", "noise points"],
    expectedAnswer:
      "In the social context analogy for DBSCAN, the three types of points are core points (social butterflies), border points (friends of social butterflies who are not social butterflies), and noise points (lone wolves).",
    expectedBehavior:
      "Must list all 3 types of points. It is acceptable if the social context analogies (social butterflies, lone wolves, etc.) are included alongside the formal names.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "clustering"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-transfer-learning-ways",
    question: "What are the three common ways to use transfer learning in computer vision?",
    expectedItems: [
      "using pre-trained models out-of-the-box",
      "using pre-trained models as feature extractor",
      "fine-tuning the weights",
    ],
    expectedAnswer:
      "The three common ways to use transfer learning in computer vision are: using pre-trained models out-of-the-box, using pre-trained models as a feature extractor and training your own model with these features, and starting with the weights of pre-trained models and fine-tuning the weights for your task.",
    expectedBehavior:
      "Must list all 3 approaches to transfer learning. Ensure the distinction between using it strictly as a feature extractor versus fine-tuning the weights is clear.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "cv"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-linkage-criteria",
    question:
      "What are four example linkage criteria used to determine the similarity between clusters in hierarchical clustering?",
    expectedItems: ["single linkage", "complete linkage", "average linkage", "Ward linkage"],
    expectedAnswer:
      "Four example linkage criteria used to measure distances between clusters are single linkage, complete linkage, average linkage, and Ward linkage.",
    expectedBehavior: "Must list exactly these 4 linkage criteria.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "clustering"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-nlp-tasks",
    question:
      "What are four common tasks in an NLP pipeline used for extracting information from text?",
    expectedItems: [
      "part of speech tagging",
      "named entity recognition",
      "coreference resolution",
      "dependency parsing",
    ],
    expectedAnswer:
      "Four common tasks for extracting information in an NLP pipeline are part of speech tagging, named entity recognition, coreference resolution, and dependency parsing.",
    expectedBehavior:
      "Must list all 4 NLP tasks. Descriptions of what each task does (e.g., assigning tags, labelling objects) are optional but the specific task names must be enumerated.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "nlp"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-ml-problem-types",
    question:
      "What are five typical types of machine learning problems discussed in the course's introductory material?",
    expectedItems: [
      "supervised learning",
      "unsupervised learning",
      "reinforcement learning",
      "generative AI",
      "recommendation systems",
    ],
    expectedAnswer:
      "Five typical machine learning problems are supervised learning, unsupervised learning, reinforcement learning, generative AI, and recommendation systems.",
    expectedBehavior:
      "Must list all 5 types of machine learning problems. Additional descriptive details about each type (such as mentioning that supervised learning uses labeled targets) are optional, but all five category names must be present.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-word-embeddings",
    question:
      "What are four popular pre-trained word embeddings available for use in Natural Language Processing?",
    expectedItems: ["word2vec", "wikipedia2vec", "GloVe", "fastText"],
    expectedAnswer:
      "Four popular pre-trained word embeddings are word2vec, wikipedia2vec, GloVe, and fastText.",
    expectedBehavior:
      "Must list exactly these 4 pre-trained word embeddings. Mentioning the algorithm or publisher associated with them (e.g., Stanford University for GloVe, Facebook for fastText) is acceptable but not required.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "nlp"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-transformer-architectures",
    question:
      "What are the three common transformer architectures used for Large Language Models (LLMs)?",
    expectedItems: ["decoder-only", "encoder-only", "encoder-decoder"],
    expectedAnswer:
      "The three common architectures used for Large Language Models are decoder-only, encoder-only, and encoder-decoder.",
    expectedBehavior:
      "Must list all 3 transformer architectures. Common failure mode is listing examples of the architectures (like GPT-3 or BERT) instead of the structural types themselves.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "llm"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-list-text-features",
    question:
      "When going beyond bag-of-words representations, what are four common features engineered for text data to incorporate human knowledge?",
    expectedItems: [
      "ngram features",
      "part-of-speech features",
      "named entity features",
      "emoticons in text",
    ],
    expectedAnswer:
      "Four common engineered features for text data include ngram features, part-of-speech features, named entity features, and emoticons in text.",
    expectedBehavior:
      "Must list all 4 text features. The response should specifically focus on these engineered components rather than general preprocessing steps.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["list-enumeration", "ml", "nlp"],
    scenarioCategory: "list-enumeration",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlListEnumerationFixture(id: string): EvalFixture | undefined {
  return mlListEnumerationFixtures.find((f) => f.id === id);
}
