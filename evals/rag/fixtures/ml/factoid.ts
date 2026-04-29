/**
 * ML Factoid Fixtures
 *
 * Generated via NotebookLM - factoid category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlFactoidFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-factoid-decision-stump",
    question: "What is a decision stump in the context of machine learning?",
    expectedItems: [],
    expectedAnswer: "A decision stump is a decision tree that has only one split, meaning it is limited to a depth of 1.",
    expectedBehavior: "The answer must specifically define a decision stump as a decision tree with a maximum depth of 1 or exactly one split.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-feature-cross",
    question: "What is a feature cross?",
    expectedItems: [],
    expectedAnswer: "A feature cross is a synthetic feature that is created by multiplying or crossing two or more existing features together.",
    expectedBehavior: "The answer must state that it is a synthetic feature and identify the mechanism (multiplying or crossing two or more features).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-distributional-hypothesis",
    question: "What is the distributional hypothesis in natural language processing?",
    expectedItems: [],
    expectedAnswer: "The distributional hypothesis states that words appearing in similar contexts tend to have similar meanings. This idea forms the foundation for modern word embeddings by mathematically capturing that context defines meaning.",
    expectedBehavior: "The answer must clearly state the core principle that a word's meaning is determined by its surrounding context or the words it appears alongside.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "nlp"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-clustering-goal",
    question: "What is the fundamental goal of clustering in unsupervised learning?",
    expectedItems: [],
    expectedAnswer: "The goal of clustering is to partition a dataset into underlying groups such that examples in the same group are as similar as possible, while examples in different groups are as different as possible.",
    expectedBehavior: "The answer must highlight the dual objective of clustering: maximizing similarity within the same group and maximizing differences between distinct groups.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "unsupervised"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-utility-matrix",
    question: "What is a utility matrix in the context of recommender systems?",
    expectedItems: [],
    expectedAnswer: "A utility matrix is a matrix that captures interactions between a set of users and a set of items. Each entry typically denotes the interaction, such as a rating, given by a user to an item, where the rows represent the users and the columns represent the items.",
    expectedBehavior: "The answer must define a utility matrix as capturing interactions (such as ratings or clicks) between users and items.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "recommender"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-ward-linkage",
    question: "What criteria does Ward linkage use when deciding which clusters to merge in hierarchical clustering?",
    expectedItems: [],
    expectedAnswer: "Ward linkage picks two clusters to merge such that the variance within all clusters increases the least. This approach minimizes the increase in within-cluster variance and often leads to equally sized clusters.",
    expectedBehavior: "The answer must specifically state that Ward linkage minimizes the increase in variance within the clusters being merged.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "clustering"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-transfer-learning",
    question: "What is transfer learning in the context of computer vision?",
    expectedItems: [],
    expectedAnswer: "Transfer learning is the common practice of downloading a pre-trained model and fine-tuning it for a specific task instead of training an entire convolutional neural network from scratch. This technique saves immense time, computational cost, and effort by utilizing models that have already learned patterns from large datasets like ImageNet.",
    expectedBehavior: "The answer must define transfer learning as the process of taking an existing pre-trained model and fine-tuning it for a new task to save computational and human resources.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "cv"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-factoid-right-censoring",
    question: "What is right censoring in the context of survival analysis?",
    expectedItems: [],
    expectedAnswer: "Right censoring occurs when the endpoint of an event has not been observed for all study subjects by the end of the study period. It accounts for the fact that for some data points, only the lower bound of their event time is known rather than the exact duration.",
    expectedBehavior: "The answer must define right censoring as a situation where the event's endpoint is unobserved by the study's conclusion, resulting in only knowing a lower bound for the time-to-event.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["factoid", "ml", "survival"],
    scenarioCategory: "factoid",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlFactoidFixture(id: string): EvalFixture | undefined {
  return mlFactoidFixtures.find((f) => f.id === id);
}
