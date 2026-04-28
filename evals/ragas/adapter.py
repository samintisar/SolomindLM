from dataclasses import dataclass
from typing import Any


@dataclass
class RagasSample:
    """A single sample for Ragas evaluation."""

    question: str
    answer: str
    contexts: list[str]  # selected chunk contents
    ground_truth: str  # expected items joined


def load_artifacts(path: str) -> list[RagasSample]:
    """Load eval artifacts produced by the TypeScript runner.

    Supports both formats:
      - JSONL (default for `--export-artifacts`): one artifact per line.
      - JSON: a single object or an array of objects.

    Format is auto-detected from the file extension and content shape so the
    same path works regardless of how the runner emitted it.
    """
    import json

    with open(path) as f:
        text = f.read().strip()
    if not text:
        return []

    # JSONL detection: extension hint OR multiple non-empty lines that each
    # parse as an object. We avoid the naive "split by newline" pre-check
    # because pretty-printed JSON also contains newlines.
    artifacts: list[dict[str, Any]]
    is_jsonl = path.endswith(".jsonl")
    if is_jsonl:
        artifacts = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        data = json.loads(text)
        artifacts = data if isinstance(data, list) else [data]

    samples = []
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
