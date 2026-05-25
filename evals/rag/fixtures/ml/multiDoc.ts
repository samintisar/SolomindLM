/**
 * ML Multi-Doc Fixtures
 *
 * Generated via NotebookLM - multi-doc category
 * Notebook ID: jd72h9qsq5zap11ede5k8rqkx585djmc
 */

import type { EvalFixture } from "../../types";

export const mlMultiDocFixtures: EvalFixture[] = [
  {
    schemaVersion: 1,
    id: "ml-multidoc-text-representation-evolution",
    question:
      "Summarize the evolution of text representations from Bag-of-Words to Large Language Models discussed in the sources.",
    expectedItems: [],
    expectedAnswer:
      "Bag-of-Words (BoW), implemented via CountVectorizer, is a simple frequency-based representation that creates sparse, high-dimensional vectors but ignores word order, context, and relationships between similar words. Word embeddings improve upon this by providing dense vector representations that mathematically capture contextual relationships and word meaning based on the distributional hypothesis. Sentence embeddings extend this to capture meaning at the sentence level using a single vector. Finally, Large Language Models (LLMs) scale these transformer-based embeddings to billions of parameters, enabling context-aware, dynamic representations that allow for complex reasoning and text generation.",
    expectedBehavior:
      "Must synthesize the progression of text representations across the NLP lectures. Watch for mentions of BoW limitations, the contextual nature of word/sentence embeddings, and the dynamic scaling and capabilities of LLMs.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["multi-doc", "ml", "nlp"],
    scenarioCategory: "multi-doc",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-multidoc-class-imbalance-methods",
    question:
      "Summarize the various methods and metrics discussed for addressing and evaluating class imbalance in classification problems.",
    expectedItems: [],
    expectedAnswer:
      "Accuracy can be a misleading metric when dealing with imbalanced datasets. Instead, models should be evaluated using metrics derived from the confusion matrix, such as precision, recall, and the F1-score. The Area Under the Curve (AUC) and average precision score are also useful for summarizing performance across different classification thresholds. To address the imbalance directly during training, one can use the `class_weight='balanced'` parameter to adjust the importance of classes. Additionally, data resampling techniques can be applied, including random undersampling of the majority class, random oversampling of the minority class with replacement, or using SMOTE to generate synthetic examples for the minority class.",
    expectedBehavior:
      "Must identify both evaluation strategies (precision, recall, f1, AUC, AP) and training adjustments (class_weight, oversampling, undersampling, SMOTE) used for handling class imbalance across the relevant lecture materials.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["multi-doc", "ml", "imbalance"],
    scenarioCategory: "multi-doc",
    runner: "chat",
  },
  {
    schemaVersion: 1,
    id: "ml-multidoc-preprocessing-techniques",
    question:
      "Summarize the preprocessing techniques used to encode categorical and text features in a machine learning pipeline.",
    expectedItems: [],
    expectedAnswer:
      "Categorical features can be transformed using OrdinalEncoder when there is an inherent ordering to the categories. If there is no ordinality, OneHotEncoder should be used, which can drop a column for binary features to save space or ignore unknown categories during cross-validation. For raw text features, bag-of-words representations like CountVectorizer are used to convert text into a sparse matrix of word counts. When a dataset contains mixed feature types, a ColumnTransformer is utilized to apply these different encoding transformations to their respective columns simultaneously within a machine learning pipeline.",
    expectedBehavior:
      "Must summarize techniques across different preprocessing scenarios. Needs to mention Ordinal encoding for ordered categories, One-Hot encoding for nominal/binary categories, CountVectorizer for text, and ColumnTransformer for orchestrating multiple transformations.",
    notebookId: "jd72h9qsq5zap11ede5k8rqkx585djmc",
    tags: ["multi-doc", "ml", "preprocessing"],
    scenarioCategory: "multi-doc",
    runner: "chat",
  },
];

// Helper to get individual fixture
export function getMlMultiDocFixture(id: string): EvalFixture | undefined {
  return mlMultiDocFixtures.find((f) => f.id === id);
}
