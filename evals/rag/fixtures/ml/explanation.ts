/**
 * ML Explanation Fixtures
 *
 * Generated via NotebookLM - explanation category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlExplanationFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-explanation-random-forest-randomness",
    question: "How does a random forest classifier inject randomness into its construction to create a diverse ensemble of trees?",
    expectedItems: [],
    expectedAnswer: "To ensure that the trees in a random forest are diverse, the algorithm injects randomness in two primary ways during construction. First, it uses data randomness by building each individual tree on a different bootstrap sample, which is a sample drawn with replacement from the original training set. Second, it incorporates feature randomness at each node by selecting a random subset of features to consider for splitting. Instead of looking for the best split across all available features, the algorithm only evaluates this random subset to find the best possible test. This combination of data and feature randomization helps reduce overfitting when the individual tree predictions are ultimately voted upon or averaged.",
    expectedBehavior: "Must explain both mechanisms of randomness: bootstrap sampling for data, and selecting a random subset of features at each node. Should mention that this diversity aims to reduce overall model overfitting.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["explanation", "ml", "trees"],
    scenarioCategory: "explanation",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-explanation-dbscan-mechanism",
    question: "How does the DBSCAN algorithm operate to group points into clusters and identify noise?",
    expectedItems: [],
    expectedAnswer: "The DBSCAN algorithm begins by picking a random, unlabeled data point and checking if it qualifies as a \"core\" point. A point is considered a core point if it has at least `min_samples` number of neighbors within a specified `eps` (epsilon) distance. If it is a core point, it is assigned a cluster label, and this color or label is immediately spread to all of its neighbors. The algorithm then iteratively checks these newly labeled neighbors to see if they are also core points, spreading the cluster label further to their neighbors until no more core points can be found to expand the current cluster. Any points that are never reached during this spreading process and do not meet the core point criteria are ultimately designated as noise points.",
    expectedBehavior: "Must explain the step-by-step mechanism of DBSCAN: picking a random point, checking the core point condition using `eps` and `min_samples`, recursively spreading the label to neighbors, and leaving isolated points as noise.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["explanation", "ml", "clustering"],
    scenarioCategory: "explanation",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-explanation-content-based-filtering",
    question: "How does content-based filtering approach the problem of predicting missing ratings in a recommender system?",
    expectedItems: [],
    expectedAnswer: "Content-based filtering treats the recommendation task as a supervised machine learning problem by leveraging known features of the items or the users. The process begins by building a specific profile for each user by creating a training set where the input features ($X$) are the attributes of the items they have rated, and the target ($y$) is the numerical rating they provided. A separate regression model is then trained for each individual user using their specific data. Finally, these trained user-specific regression models are applied to the features of unseen items to predict the missing ratings, thereby completing the utility matrix.",
    expectedBehavior: "Must describe the creation of individual user profiles using item features, the training of a distinct supervised regression model for each user, and the application of these models to predict ratings for unrated items.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["explanation", "ml", "recommender"],
    scenarioCategory: "explanation",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlExplanationFixture(id: string): EvalFixture | undefined {
  return mlExplanationFixtures.find((f) => f.id === id);
}
