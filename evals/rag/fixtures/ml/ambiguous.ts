/**
 * ML Ambiguous Fixtures
 *
 * Generated via NotebookLM - ambiguous category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlAmbiguousFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-ambiguous-error-meanings",
    question: "What does the term \"error\" refer to in the context of the machine learning course material?",
    expectedItems: [],
    expectedAnswer: "In machine learning, \"error\" refers to different concepts depending on the context. When evaluating model generalization and the fundamental tradeoff, it refers to the training error (error on the training data), the validation error (error on a validation split), the test error (error on unseen test data), or the best possible error for a given problem. Alternatively, in the context of evaluating a binary classification model using a confusion matrix, an error can be a Type I error (a false positive, where the model incorrectly flags an example) or a Type II error (a false negative, where the model misses the example).",
    expectedBehavior: "Must disambiguate between generalization errors (training, validation, test) and classification error types (Type I/False Positive, Type II/False Negative).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-ambiguous-average-meanings",
    question: "How is the concept of an \"average\" applied across classification, clustering, and recommender systems?",
    expectedItems: [],
    expectedAnswer: "The term \"average\" has multiple distinct meanings depending on the machine learning task. In classification evaluation, a \"macro average\" treats all classes equally and averages their metrics, whereas a \"weighted average\" weights the metric by the number or proportion of samples in each class. In hierarchical clustering, \"average linkage\" is a specific criterion that merges two clusters based on the smallest average distance between all their pairs of points. In recommender systems, \"average\" is used for baseline imputation approaches, which fill missing utility matrix values by using the global average rating, the per-user average rating, or the per-item average rating.",
    expectedBehavior: "Must correctly identify and explain the three distinct contexts: macro/weighted averages for classification metrics, average linkage in hierarchical clustering, and baseline averages in recommender systems.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-ambiguous-score-meanings",
    question: "What are the different ways the term \"score\" is used when building and evaluating machine learning models?",
    expectedItems: [],
    expectedAnswer: "\"Score\" has several different meanings across machine learning methods. In scikit-learn's API, calling the `.score()` method returns the accuracy for classification models and the $R^2$ score for regression models. In the context of linear models like logistic regression, \"score\" can refer to the raw model output ($w^T x_i$), which can also be squashed by a sigmoid function into a predicted probability score. When evaluating binary classification performance, it refers to summary metrics like the F1-score or the AP (average precision) score. Finally, in unsupervised learning, the Silhouette score is used to measure the quality of cluster assignments.",
    expectedBehavior: "Must disambiguate \"score\" by identifying at least three contexts: the `.score()` method (returning accuracy or R-squared), the raw/probability output of a model, classification evaluation metrics (F1/AP score), and clustering evaluation (Silhouette score).",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-ambiguous-baseline-meanings",
    question: "What is a \"baseline\" in the context of standard supervised machine learning versus recommender systems?",
    expectedItems: [],
    expectedAnswer: "In standard supervised machine learning, a baseline is a simple algorithm based on simple rules of thumb used to sanity-check a model, such as a `DummyClassifier` that always predicts the most frequent label, or a `DummyRegressor` that predicts the mean, median, or a constant value of the training set. In the context of recommender systems, baselines are approaches used to fill in missing entries in a utility matrix, which include using the global average rating, the per-user average rating, or the per-item average rating.",
    expectedBehavior: "Must disambiguate the term \"baseline\" by explaining the `DummyClassifier`/`DummyRegressor` approaches for supervised learning and the average-based imputation approaches (global, user, item) for recommender systems.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-ambiguous-target-meanings",
    question: "How does the definition of a \"target\" differ between standard classification/regression tasks and survival analysis?",
    expectedItems: [],
    expectedAnswer: "In standard classification and regression tasks, the target is typically a single feature or column that the model is trying to predict, such as a continuous value for housing prices or a discrete class for disease prediction. In survival analysis, the target is more complex due to right censoring, requiring both the \"time to event\" (such as customer tenure or subscription length) and information on whether the event actually occurred or was censored (such as whether the customer churned).",
    expectedBehavior: "Must contrast the standard single-feature target (continuous or discrete) with the survival analysis target, which requires both the time duration and the censorship/event status.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-ambiguous-weight-meanings",
    question: "What does the term \"weight\" refer to in the context of linear models compared to the context of class imbalance?",
    expectedItems: [],
    expectedAnswer: "In the context of linear models, such as linear regression and logistic regression, \"weights\" (also called coefficients) are the parameters learned by the model that are associated with each feature to make predictions. In the context of class imbalance, \"weight\" refers to the `class_weight` hyperparameter in classifiers, which changes the training procedure to specify that one class is more important than another, effectively assigning a higher penalty to certain errors.",
    expectedBehavior: "Must distinguish between weights as learned parameters (coefficients) in linear models and weights as a hyperparameter (`class_weight`) used to adjust the importance of classes during training.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["ambiguous", "ml"],
    scenarioCategory: "ambiguous",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlAmbiguousFixture(id: string): EvalFixture | undefined {
  return mlAmbiguousFixtures.find((f) => f.id === id);
}
