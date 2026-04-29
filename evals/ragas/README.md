# Ragas Python Environment

Use the project Conda environment for all Python commands in this directory.

```bash
conda env create -f environment.yml
conda activate solomindlm-rag-evals
```

Run Ragas through the environment:

```bash
conda run -n solomindlm-rag-evals python evals/ragas/run_ragas.py --dataset evals/rag/generated/ragas.jsonl
```

Do not install Ragas packages into the global/user Python environment. If dependencies change, update the root `environment.yml`; keep `requirements.txt` as the pip-compatible mirror for tools that cannot read Conda environment files.
