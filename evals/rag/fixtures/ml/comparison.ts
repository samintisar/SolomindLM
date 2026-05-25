/**
 * ML Comparison Fixtures
 *
 * Generated via NotebookLM - comparison category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlComparisonFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-comparison-supervised-unsupervised",
    question: "Compare supervised learning and unsupervised learning.",
    expectedItems: [],
    expectedAnswer:
      "In supervised learning, the training data comprises a set of features or observations and their corresponding targets, and the goal is to find a mapping function that relates the features to the targets to predict targets for new, unseen examples. In contrast, unsupervised learning uses training data consisting of observations without any corresponding targets. While supervised learning focuses on function approximation to map inputs to outputs, unsupervised learning aims to concisely describe the data, such as discovering hidden structures, finding patterns, or grouping similar things together.",
    expectedBehavior:
      "Must define both terms based on the presence or absence of targets/labels. Must contrast their core goals (function approximation vs. data description/pattern discovery).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-collaborative-content",
    question: "Compare collaborative filtering and content-based filtering in recommender systems.",
    expectedItems: [],
    expectedAnswer:
      "Collaborative filtering is considered an unsupervised learning approach that relies solely on the labels or ratings users give to items to learn latent features. Content-based filtering is a supervised machine learning approach that extracts features of users and/or items to build a model that predicts ratings. While collaborative filtering assumes we only have ratings data and cannot easily recommend new items, content-based filtering leverages item or user features, enabling it to predict ratings for new items and new users.",
    expectedBehavior:
      "Must contrast the learning paradigms (unsupervised vs. supervised). Must explain what data each uses (only ratings/labels vs. features of items/users). Must mention the difference in how they handle new items/users.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "recommender"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-random-forest-gbm",
    question: "Compare Random Forests and Gradient Boosted Trees.",
    expectedItems: [],
    expectedAnswer:
      "Both Random Forests and Gradient Boosted Trees are types of tree-based ensemble models that combine multiple decision trees. Random Forests build a diverse set of trees independently by injecting randomness into the model construction, specifically by training each tree on a bootstrap sample of the data and selecting a random subset of features at each node. Conversely, Gradient Boosted Trees do not use randomization; instead, they build shallow decision trees in a serial manner, where each new tree attempts to correct the mistakes made by the previous ones to create a strong learner.",
    expectedBehavior:
      "Must state that they are both tree-based ensemble models. Must contrast how they build trees (independently/parallel with injected randomness vs. serially with no randomization to correct previous mistakes).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "trees"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-kmeans-dbscan",
    question: "Compare K-Means and DBSCAN clustering algorithms.",
    expectedItems: [],
    expectedAnswer:
      "K-Means and DBSCAN are both unsupervised clustering algorithms, but they operate differently and have distinct requirements. In K-Means, you must specify the number of clusters in advance as a hyperparameter, whereas in DBSCAN, you do not have to specify the number of clusters. Instead, DBSCAN requires tuning the `eps` (radius) and `min_samples` hyperparameters to define cluster density. Furthermore, K-Means assigns all points to a cluster and provides a `predict` method for new data. In contrast, DBSCAN does not have to assign all points to clusters, labeling unassigned points as noise (or -1), and it lacks a `predict` method for new or test points. Finally, K-Means is more susceptible to outliers compared to DBSCAN.",
    expectedBehavior:
      "Must mention both are clustering algorithms. Must contrast the need to specify the number of clusters in advance (K-Means) with tuning density parameters like `eps` and `min_samples` (DBSCAN). Must point out differences in point assignment (all points vs. allowing noise points) and the availability of a `predict` method.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "clustering"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-grid-randomized-search",
    question: "Compare GridSearchCV and RandomizedSearchCV for hyperparameter optimization.",
    expectedItems: [],
    expectedAnswer:
      "Both `GridSearchCV` and `RandomizedSearchCV` are automated hyperparameter optimization tools provided by scikit-learn. `GridSearchCV` performs an exhaustive search by considering the product of the hyperparameter sets and evaluating each combination one by one. In contrast, `RandomizedSearchCV` samples hyperparameter configurations at random until a specified budget (defined by `n_iter`) is exhausted. `RandomizedSearchCV` is generally faster than `GridSearchCV`, especially when some parameters are more important than others, because evaluating parameters that do not influence performance does not negatively impact efficiency. Additionally, `RandomizedSearchCV` allows users to pass probability distributions to draw from, whereas `GridSearchCV` requires a predefined list of discrete values.",
    expectedBehavior:
      "Must identify both as hyperparameter optimization techniques. Must contrast the exhaustive search method of `GridSearchCV` with the random sampling and budget-limited search of `RandomizedSearchCV`. Must mention that `RandomizedSearchCV` is generally faster and supports passing probability distributions.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "optimization"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-macro-weighted-avg",
    question:
      "Compare macro average and weighted average when evaluating multi-class classification models.",
    expectedItems: [],
    expectedAnswer:
      "Macro average and weighted average are both techniques used to aggregate binary classification metrics (like precision, recall, and F1-score) across multiple classes. The macro average gives equal importance to all classes and computes the simple average of the metrics over all classes. This metric is preferred if you want to ensure each class is considered equally important, regardless of its size. The weighted average, on the other hand, weights the metric of each class by the number or proportion of samples in that class, and divides by the total number of samples. The weighted average should be used if each individual example in the dataset is considered equally important.",
    expectedBehavior:
      "Must define both as ways to aggregate metrics for multi-class problems. Must explain the calculation differences (simple average of all classes vs. weighted by the proportion of examples per class). Must clearly state when to use each (when classes are equally important vs. when individual examples are equally important).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "evaluation"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-comparison-hard-soft-voting",
    question: "Compare hard voting and soft voting within a `VotingClassifier` ensemble.",
    expectedItems: [],
    expectedAnswer:
      "Hard voting and soft voting are two different prediction strategies used by a `VotingClassifier` to combine the outputs of its constituent machine learning models. In hard voting (configured with `voting='hard'`), the ensemble looks at the discrete class labels outputted by the `predict` method of each constituent model and makes its final prediction by taking a majority vote. In soft voting (configured with `voting='soft'`), the ensemble relies on the predicted probabilities from the `predict_proba` method of each model; it averages these probabilities across all models and then takes the largest probability (or applies a threshold) to determine the final prediction.",
    expectedBehavior:
      "Must identify both as prediction mechanisms for a voting ensemble. Must contrast their approaches: hard voting uses the discrete class labels from `predict` for a majority vote, while soft voting averages the probability scores from `predict_proba` before making a final decision.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["comparison", "ml", "ensemble"],
    scenarioCategory: "comparison",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlComparisonFixture(id: string): EvalFixture | undefined {
  return mlComparisonFixtures.find((f) => f.id === id);
}
