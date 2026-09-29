"""Quick /predict latency benchmark: sends the example messages many times and prints p50/p95.

Run against the ML service in Docker (default) or any address:
    .venv/Scripts/python scripts/benchmark.py                   (Windows)
    python scripts/benchmark.py --url http://127.0.0.1:8000 --requests 500

Measures the full HTTP round trip from this computer, which is what the backend sees.
Targets (PRD NFR-1): /predict under 300 ms; the backend gives up after 500 ms.
"""

import argparse
import json
import statistics
import time
from pathlib import Path

import httpx2 as httpx

EXAMPLES = json.loads(
    (Path(__file__).parents[1] / "tests" / "fixtures" / "rules_v0_examples.json").read_text(
        encoding="utf-8"
    )
)


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, round(p / 100 * len(ordered)) - 1)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    # 127.0.0.1, not "localhost": on Windows, Python first tries IPv6 for "localhost", which adds
    # about 40 ms per request that has nothing to do with the service.
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=300)
    args = parser.parse_args()

    timings: list[float] = []
    with httpx.Client(base_url=args.url, timeout=5) as client:
        client.post("/predict", json=EXAMPLES[0]["request"]).raise_for_status()  # warm up
        for i in range(args.requests):
            example = EXAMPLES[i % len(EXAMPLES)]
            started = time.perf_counter()
            client.post("/predict", json=example["request"]).raise_for_status()
            timings.append((time.perf_counter() - started) * 1000)

    print(
        f"/predict latency over {len(timings)} requests to {args.url}: "
        f"p50 {statistics.median(timings):.1f} ms, p95 {percentile(timings, 95):.1f} ms, "
        f"slowest {max(timings):.1f} ms"
    )


if __name__ == "__main__":
    main()
