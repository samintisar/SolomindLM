/**
 * ML Temporal Fixtures
 *
 * Generated via NotebookLM - temporal category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlTemporalFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-temporal-sklearn-workflow",
    question:
      "What are the standard sequential steps to train and evaluate a classifier using the sklearn library?",
    expectedItems: [],
    expectedAnswer:
      "The standard sequence of steps begins with reading the data, followed by creating the feature vectors $X$ and the target $y$. Next, you create a classifier object by importing the appropriate classifier. After the object is created, you `fit` the classifier to carry out the learning process. Then, you use `predict` to determine the targets of given or new examples. Finally, you use the `score` method to evaluate the performance of the given model.",
    expectedBehavior:
      "Must list the exact chronological workflow from data reading to scoring, specifically mentioning the `fit`, `predict`, and `score` methods in the correct order.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["temporal", "ml", "sklearn"],
    scenarioCategory: "temporal",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-temporal-dbscan-algorithm",
    question:
      "What is the step-by-step chronological progression of the DBSCAN algorithm when assigning clusters?",
    expectedItems: [],
    expectedAnswer:
      "The process begins by picking a point $p$ at random and checking whether it is a 'core' point by looking at the number of neighbours within epsilon distance. If $p$ is a core point, it is given a colour or label, which is then spread to all of its neighbours. Next, the algorithm checks if any of those neighbours that received the colour are also core points, and if yes, spreads the colour to their neighbors as well. Once there are no more core points left to spread the colour to, a new unlabeled point $p$ is picked and the process is repeated.",
    expectedBehavior:
      "Must explain the exact chronological sequence of DBSCAN execution, starting from a random point, checking the core condition, spreading labels to neighbors, recursively checking neighbors, and repeating with a new unlabeled point.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["temporal", "ml", "clustering"],
    scenarioCategory: "temporal",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-temporal-sequential-forecasting",
    question:
      "How does the sequential forecasting approach predict time series values multiple steps into the future using a single model and a for loop?",
    expectedItems: [],
    expectedAnswer:
      "In the sequential forecasting approach, the model predicts one step ahead and then pretends that prediction is the true value for subsequent steps. For example, you first predict the target for the immediate next time step. Then, to predict the step after that, you use your first prediction as the truth for your lag features. To predict the third step, you use your predictions for both the first and second steps as inputs, and this iterative process continues sequentially to predict further into the future.",
    expectedBehavior:
      "Must describe the chronological progression of predicting one step, feeding that prediction back into the model as a lagged feature 'truth', and repeating the process iteratively to predict subsequent time steps.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["temporal", "ml", "time-series"],
    scenarioCategory: "temporal",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlTemporalFixture(id: string): EvalFixture | undefined {
  return mlTemporalFixtures.find((f) => f.id === id);
}
