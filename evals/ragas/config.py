from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RagasConfig:
    """Configuration for Ragas evaluation."""

    # LLM for Ragas judge (use OpenAI-compatible endpoint)
    llm_model: str = "gpt-4o-mini"
    llm_base_url: Optional[str] = None
    # Embedding model for context metrics
    embedding_model: str = "text-embedding-3-small"
    embedding_base_url: Optional[str] = None
    # Which metrics to compute
    metrics: list[str] = field(default_factory=lambda: [
        "faithfulness",
        "response_relevancy",
        "context_precision",
        "context_recall",
    ])
    # noise_sensitivity is informational only by default
    include_noise_sensitivity: bool = False
    # Batch size for evaluation
    batch_size: int = 10
