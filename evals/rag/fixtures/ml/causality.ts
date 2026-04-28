/**
 * ML Causality Fixtures
 *
 * Generated via NotebookLM - causality category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlCausalityFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-causality-time-series-shuffle",
    question: "Why is random shuffling inappropriate when splitting time series data into training and validation sets?",
    expectedItems: [],
    expectedAnswer: "Randomly shuffling time series data before splitting causes future data to leak into the training set, meaning the model would be trained on data that came after the test data. This violates the realistic deployment scenario where you are not allowed to know what happened in the future to make a forecast. Instead, data must be split based on time (chronologically) so that relationships are learned from the past and evaluated on the future to accurately approximate generalization error.",
    expectedBehavior: "Must explain that random splitting leaks future information into the training set. Must mention that deployment scenarios require predicting the future from the past, so chronological (time-based) splitting is required to prevent data leakage.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "time-series"],
    scenarioCategory: "causality",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-causality-random-forest-randomness",
    question: "Why does a Random Forest classifier build each tree using a random bootstrap sample and a random subset of features at each node?",
    expectedItems: [],
    expectedAnswer: "A single decision tree is likely to overfit the training data. A Random Forest builds a stronger model by combining a collection of diverse decision trees. It injects randomness by building each tree on a random bootstrap sample (drawn with replacement from the training set) and by randomly selecting a subset of features to evaluate at each node. Because each tree overfits to a slightly different part of the data, averaging their individual results reduces the overall overfitting.",
    expectedBehavior: "Must explain the goal of reducing overfitting. Must explicitly link the two forms of randomness (bootstrap sampling and random feature subsets) to the creation of a *diverse* set of trees whose averaged output generalizes better than a single tree.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "trees"],
    scenarioCategory: "causality",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-causality-complexity-overfitting",
    question: "In the context of the fundamental tradeoff, why does a model with very high complexity often exhibit a large gap between training error and validation error?",
    expectedItems: [],
    expectedAnswer: "As model complexity increases, the training error tends to go down but the validation error tends to go up, which is known as the fundamental tradeoff. A highly complex model, such as a decision tree with unlimited maximum depth, will learn unreliable patterns and random quirks in order to get every single training example correct. This results in a very low training error, but a high validation error because the model fails to generalize to new data, a scenario known as overfitting or high variance.",
    expectedBehavior: "Must mention that high complexity leads to memorizing noise/quirks in the training data (overfitting or high variance). Must state that this drives training error down while validation error increases or remains high, creating the gap.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "bias-variance"],
    scenarioCategory: "causality",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-causality-optimization-bias",
    question: "Why does optimization bias occur when repeatedly using a single validation set for hyperparameter tuning?",
    expectedItems: [],
    expectedAnswer: "Optimization bias occurs because evaluating a large number of hyperparameter combinations increases the probability of finding a model that performs well on the validation data purely by chance. Because the validation set is over-used to search through the complexity of the model space, the chosen model ends up overfitting to the specific quirks of that validation set. Consequently, the validation error shrinks artificially and is no longer a reliable or unbiased approximation of how well the model will generalize to new, unseen data.",
    expectedBehavior: "Must explain that trying many hyperparameter configurations increases the statistical chance of getting a high score randomly. Must explicitly mention that this causes the model to 'overfit the validation set' and makes the validation error an overly optimistic estimate of generalization.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "hyperparameters"],
    scenarioCategory: "causality",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-causality-trees-trend-extrapolation",
    question: "Why are tree-based models, such as Random Forests, unable to successfully forecast a continuous upward trend in time series data?",
    expectedItems: [],
    expectedAnswer: "Tree-based models make predictions by learning split rules and thresholds strictly derived from the training data, such as routing data based on whether a 'days_since' feature is greater than a specific value seen in training. Because they rely entirely on the bounding regions of the training set to make splits, they are inherently unable to extrapolate to values outside the range of the training data. Therefore, for any future time steps that exceed the maximum time value observed during training, the model cannot predict continued growth and will simply output a constant prediction based on the highest training threshold.",
    expectedBehavior: "Must explain the mechanism of tree splits (relying on thresholds established by training data). Must explicitly conclude that this mechanism prevents the model from extrapolating beyond the maximum feature values observed in the training set.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "trees", "time-series"],
    scenarioCategory: "causality",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-causality-smote-generalization",
    question: "In the context of handling class imbalance, why does the Synthetic Minority Over-sampling Technique (SMOTE) produce a more generalized decision region for the minority class compared to simple random oversampling?",
    expectedItems: [],
    expectedAnswer: "Instead of simply duplicating existing minority class examples, SMOTE generates brand new synthetic examples by taking the feature vector of a minority instance, finding the difference between it and its nearest neighbor, multiplying that difference by a random number between 0 and 1, and adding it back to the original vector. This mechanism creates new data points that randomly lie along the line segments connecting existing minority samples. By filling in the spaces between existing points rather than just duplicating them, SMOTE effectively forces the model to learn a broader and more general decision region for the minority class.",
    expectedBehavior: "Must describe the mathematical mechanism of SMOTE (creating points along the line segment between a sample and its nearest neighbor). Must explain that generating these interpolated synthetic points forces the decision boundary to generalize, rather than just overfitting to duplicated points.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["causality", "ml", "imbalance"],
    scenarioCategory: "causality",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlCausalityFixture(id: string): EvalFixture | undefined {
  return mlCausalityFixtures.find((f) => f.id === id);
}
