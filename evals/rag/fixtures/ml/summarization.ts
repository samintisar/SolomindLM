/**
 * ML Summarization Fixtures
 *
 * Generated via NotebookLM - summarization category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlSummarizationFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-summarization-fundamental-tradeoff",
    question:
      "Summarize how the fundamental tradeoff between model complexity and generalization is controlled across Decision Trees, k-Nearest Neighbours (k-NN), Support Vector Machines (SVM) with RBF kernels, and Ridge regression.",
    expectedItems: [],
    expectedAnswer:
      "The fundamental tradeoff is managed by adjusting model-specific hyperparameters. In Decision Trees, increasing `max_depth` allows the tree to grow larger, increasing complexity and the risk of overfitting. In k-NN, *decreasing* the number of neighbors (`n_neighbors`) increases model complexity, with $k=1$ being the most complex. For SVMs with RBF kernels, increasing either `gamma` (which controls the radius of influence of a single training example) or `C` (which reduces regularization) leads to a more complex model and decision boundary. Conversely, in Ridge regression, *increasing* the `alpha` hyperparameter applies more regularization, shrinking the coefficients and thereby decreasing model complexity to prevent overfitting.",
    expectedBehavior:
      "Must synthesize the relationship between specific hyperparameters and model complexity across four different algorithms from multiple lectures. Watch for the correct directionality of each hyperparameter (e.g., explicitly noting that *decreasing* $k$ increases complexity, while *increasing* `alpha` decreases complexity).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["summarization", "ml"],
    scenarioCategory: "summarization",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-summarization-transfer-learning",
    question:
      "Summarize how pre-trained models and transfer learning are utilized to represent and classify data in both Natural Language Processing (NLP) and Computer Vision tasks according to the course materials.",
    expectedItems: [],
    expectedAnswer:
      'In both NLP and Computer Vision, pre-trained models save massive computational resources by leveraging patterns learned from enormous datasets (like Google News or ImageNet). In NLP, pre-trained word embeddings (like word2vec or GloVe) represent words as dense vectors based on their contextual usage (the distributional hypothesis), while sentence embeddings or Large Language Models (LLMs) provide dynamic, context-aware representations for entire sequences. In Computer Vision, pre-trained Convolutional Neural Networks (CNNs) like VGG16 or DenseNet can be used either "out-of-the-box" to classify images into original dataset categories, or used as feature extractors by removing their final classification layer to extract dense feature vectors, which are then fed into simple downstream classifiers like logistic regression.',
    expectedBehavior:
      'Must draw from both the NLP and Computer Vision lectures to synthesize the concept of transfer learning. Must explicitly mention embeddings (word/sentence) or LLMs for NLP, and using CNNs either "out-of-the-box" or as "feature extractors" for Computer Vision.',
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["summarization", "ml", "nlp", "cv"],
    scenarioCategory: "summarization",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-summarization-feature-engineering-selection",
    question:
      "Summarize the key techniques discussed in the course for both feature engineering and feature selection to improve machine learning models.",
    expectedItems: [],
    expectedAnswer:
      "Feature engineering transforms raw data into more flexible representations to improve simple models, utilizing techniques like discretization (binning) to capture non-linear relationships in numeric features, and creating interaction features or feature crosses (e.g., multiplying two features) to capture combined effects. On the other hand, feature selection reduces dimensionality by keeping only the most predictive columns to prevent overfitting. Common feature selection strategies include model-based selection, which uses `SelectFromModel` to keep features above a certain importance threshold (using models like Random Forests that report feature importances), and Recursive Feature Elimination (RFE), which iteratively shrinks the feature set by pruning the least important weights, often combined with cross-validation (`RFECV`) to automatically determine the optimal number of features.",
    expectedBehavior:
      "Must synthesize methods for both adding/transforming features (engineering) and removing features (selection). Key concepts that must be present include discretization/binning, interaction features/feature crosses, model-based selection (using importances), and recursive feature elimination (RFE).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["summarization", "ml", "features"],
    scenarioCategory: "summarization",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlSummarizationFixture(id: string): EvalFixture | undefined {
  return mlSummarizationFixtures.find((f) => f.id === id);
}
