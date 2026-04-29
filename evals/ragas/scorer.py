import json
import sys
from datetime import datetime
from typing import Optional

from config import RagasConfig
from adapter import load_artifacts, to_ragas_dataset


def create_llm(config: RagasConfig):
    """Create the LLM for Ragas judging using Ragas llm_factory."""
    from ragas.llms import llm_factory
    from openai import OpenAI

    # Create OpenAI client (supports custom base_url for non-OpenAI endpoints)
    client_kwargs = {}
    if config.llm_base_url:
        client_kwargs["base_url"] = config.llm_base_url

    client = OpenAI(**client_kwargs)

    # Use Ragas llm_factory to create InstructorLLM
    return llm_factory(
        model=config.llm_model,
        provider="openai",
        client=client,
        temperature=0,
    )


def create_embeddings(config: RagasConfig):
    """Create the embedding model for context metrics using Ragas embedding_factory."""
    from ragas.embeddings.base import embedding_factory
    from openai import OpenAI

    # Create OpenAI client (supports custom base_url for non-OpenAI endpoints)
    client_kwargs = {}
    if config.embedding_base_url:
        client_kwargs["base_url"] = config.embedding_base_url

    client = OpenAI(**client_kwargs)

    # Use Ragas embedding_factory to create embeddings
    return embedding_factory(
        provider="openai",
        model=config.embedding_model,
        client=client,
    )


def get_metrics(config: RagasConfig):
    """Import and get the requested Ragas metrics (pre-initialized instances)."""
    import warnings

    # Suppress deprecation warnings for the old import path
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=DeprecationWarning)

        from ragas.metrics import (
            faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        )

    # Map config names to actual metric instances
    # Note: These are pre-initialized with llm=None, embeddings=None
    # The evaluate() function will bind them when llm/embeddings are passed
    metric_map = {
        "faithfulness": faithfulness,
        "response_relevancy": answer_relevancy,
        "context_precision": context_precision,
        "context_recall": context_recall,
    }

    metrics = [metric_map[m] for m in config.metrics if m in metric_map]

    if config.include_noise_sensitivity:
        try:
            from ragas.metrics import noise_sensitivity
            metrics.append(noise_sensitivity)
        except Exception as e:
            print(
                f"Warning: noise_sensitivity not available: {e}",
                file=sys.stderr,
            )

    return metrics


def run_ragas(
    config: RagasConfig, dataset_path: str, output_path: Optional[str] = None
):
    """Run Ragas evaluation on the given dataset."""
    from ragas import evaluate

    samples = load_artifacts(dataset_path)
    dataset = to_ragas_dataset(samples)

    # Get metric classes (not instances)
    metric_classes = get_metrics(config)

    # Create LLM and embeddings
    llm = create_llm(config)
    embeddings = create_embeddings(config)

    result = evaluate(
        dataset=dataset,
        metrics=metric_classes,
        llm=llm,
        embeddings=embeddings,
    )

    # Convert to dict for serialization
    output = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "dataset": dataset_path,
        "config": {
            "llm_model": config.llm_model,
            "metrics": config.metrics,
        },
        "scores": result.scores if hasattr(result, "scores") else {},
        "summary": (
            {
                str(k): float(v) if hasattr(v, "__float__") else str(v)
                for k, v in result.items()
            }
            if hasattr(result, "items")
            else {}
        ),
    }

    if output_path:
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Results written to {output_path}")
    else:
        print(json.dumps(output, indent=2))

    return output
