#!/usr/bin/env python3
"""Run Ragas evaluation on eval artifacts.

Usage:
    python evals/ragas/run_ragas.py --dataset evals/rag/generated/artifacts.jsonl
    python evals/ragas/run_ragas.py --dataset evals/rag/generated/artifacts.jsonl --output evals/ragas/results.json
    python evals/ragas/run_ragas.py --dataset evals/rag/generated/artifacts.jsonl --include-noise
"""
import argparse
import os
import sys

# Add this directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from config import RagasConfig
from scorer import run_ragas


def main():
    parser = argparse.ArgumentParser(description="Run Ragas evaluation")
    parser.add_argument(
        "--dataset", required=True, help="Path to JSON/JSONL artifacts file"
    )
    parser.add_argument("--output", help="Output path for results JSON")
    parser.add_argument(
        "--llm-model", default="gpt-4o-mini", help="LLM model for judging"
    )
    parser.add_argument("--llm-base-url", help="OpenAI-compatible base URL")
    parser.add_argument("--embedding-model", default="text-embedding-3-small")
    parser.add_argument("--embedding-base-url", help="Embedding API base URL")
    parser.add_argument(
        "--include-noise", action="store_true", help="Include noise sensitivity metric"
    )
    parser.add_argument("--batch-size", type=int, default=10)

    args = parser.parse_args()

    config = RagasConfig(
        llm_model=args.llm_model,
        llm_base_url=args.llm_base_url,
        embedding_model=args.embedding_model,
        embedding_base_url=args.embedding_base_url,
        include_noise_sensitivity=args.include_noise,
        batch_size=args.batch_size,
    )

    run_ragas(config, args.dataset, args.output)


if __name__ == "__main__":
    main()
