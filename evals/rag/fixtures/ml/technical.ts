/**
 * ML Technical Fixtures
 *
 * Generated via NotebookLM - technical category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlTechnicalFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-technical-distance-formulas",
    question:
      "What are the exact mathematical formulas provided for computing the Euclidean distance, dot product similarity, and cosine similarity between two vectors?",
    expectedItems: [],
    expectedAnswer:
      "The Euclidean distance between two vectors $vec1$ and $vec2$ is defined as $\\sqrt{\\sum_{i =1}^{n} (vec1_i - vec2_i)^2}$. The dot product similarity is calculated simply as $vec1 \\cdot vec2$. The cosine similarity, which acts as a normalized version of the dot product, is computed as $\\frac{vec1 \\cdot vec2}{\\left\\lVert vec1\\right\\rVert_2 \\left\\lVert vec2\\right\\rVert_2}$.",
    expectedBehavior:
      "Must include the exact formulas or accurate mathematical notation for all three metrics as described in the source materials. Watch out for missing normalization denominators in the cosine similarity formula or missing square roots in the Euclidean distance formula.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["technical", "ml"],
    scenarioCategory: "technical",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-technical-precision-recall-f1",
    question:
      "How are precision, recall, and the F1-score mathematically defined in terms of True Positives (TP), False Positives (FP), and False Negatives (FN)?",
    expectedItems: [],
    expectedAnswer:
      "Precision is defined as the ratio of true positives to the sum of true positives and false positives, or TP / (TP + FP). Recall is defined as the ratio of true positives to the sum of true positives and false negatives, or TP / (TP + FN). The F1-score is defined as the harmonic mean of precision and recall, calculated using the formula: 2 × (precision × recall) / (precision + recall).",
    expectedBehavior:
      "Must provide the exact formulas using TP, FP, and FN for precision and recall. Must explicitly state that the F1-score is the harmonic mean and provide its specific formula using precision and recall.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["technical", "ml", "metrics"],
    scenarioCategory: "technical",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-technical-smote-implementation",
    question:
      "Describe the precise technical implementation steps by which the SMOTE algorithm generates new synthetic examples for a minority class.",
    expectedItems: [],
    expectedAnswer:
      "SMOTE over-samples the minority class by taking a specific feature vector from the minority class and introducing synthetic examples along the line segments joining it to any or all of its $k$ minority class nearest neighbors. Technically, this is achieved by taking the difference between the feature vector under consideration and its nearest neighbor, multiplying this difference by a random number between 0 and 1, and adding the result back to the original feature vector.",
    expectedBehavior:
      "Must accurately detail the implementation mechanism: finding the difference between a sample and its nearest neighbor, multiplying that difference by a random float between 0 and 1, and adding it back to the original sample.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["technical", "ml", "imbalance"],
    scenarioCategory: "technical",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-technical-countvectorizer-params",
    question:
      "What are the specific technical definitions of the `max_df` and `min_df` hyperparameters when using scikit-learn's `CountVectorizer`?",
    expectedItems: [],
    expectedAnswer:
      "The `max_df` hyperparameter is configured to ignore features (words) which occur in more than `max_df` documents. Conversely, the `min_df` hyperparameter is configured to ignore features which occur in less than `min_df` documents.",
    expectedBehavior:
      "Must explicitly define both `max_df` and `min_df` hyperparameters based strictly on their document frequency threshold behaviors (ignoring features that appear in more than / less than the specified number of documents).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["technical", "ml", "nlp"],
    scenarioCategory: "technical",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlTechnicalFixture(id: string): EvalFixture | undefined {
  return mlTechnicalFixtures.find((f) => f.id === id);
}
