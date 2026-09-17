FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Shell form (not the JSON-array form) so ${WORKERS:-...} actually expands —
# a bare JSON-array CMD is exec'd directly, no shell, no env substitution.
# Phase P3a, docs/architecture.md §22: the previous single-worker default
# was the confirmed throughput bottleneck under load (GIL-serialized
# CPU-bound scikit-learn inference in one process) — WORKERS is
# process-based parallelism, not threads, since this workload is CPU-bound.
# Default of 2 is a conservative guess, not tuned to any specific host —
# set WORKERS to the real deployment's core count (see ml-service/.env.example).
CMD uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers ${WORKERS:-2}
