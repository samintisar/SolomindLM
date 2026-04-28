from dataclasses import dataclass
from typing import Any


@dataclass
class RagasSample:
    """A single sample for Ragas evaluation."""

    question: str
    answer: str
    contexts: list[str]  # selected chunk contents
    ground_truth: str  # expected items joined


def load_artifacts(json_path: str) -> list[RagasSample]:
    """Load eval artifacts from a JSON file produced by the TypeScript runner."""
    import json

    with open(json_path) as f:
        data = json.load(f)

    samples = []
    artifacts = data if isinstance(data, list) else [data]
    for art in artifacts:
        samples.append(
            RagasSample(
                question=art["question"],
                answer=art["answer"],
                contexts=[c["content"] for c in art.get("selectedChunks", [])],
                ground_truth=", ".join(art.get("expectedItems", [])),
            )
        )
    return samples


def to_ragas_dataset(samples: list[RagasSample]):
    """Convert samples to a Ragas EvaluationDataset or dict suitable for evaluate()."""
    try:
        from ragas import EvaluationDataset, SingleTurnSample

        return EvaluationDataset(
            samples=[
                SingleTurnSample(
                    user_input=s.question,
                    response=s.answer,
                    retrieved_contexts=s.contexts,
                    reference=s.ground_truth,
                )
                for s in samples
            ]
        )
    except ImportError:
        # Fallback: return dict list for older Ragas
        return [
            {
                "question": s.question,
                "answer": s.answer,
                "contexts": s.contexts,
                "ground_truth": s.ground_truth,
            }
            for s in samples
        ]
