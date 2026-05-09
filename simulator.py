"""
Concurrent LRU Cache Simulator — Project 11
Generates concurrent client threads with configurable access patterns.
Reports: hit rate, avg latency, p95 latency, throughput.
Compares: no-cache vs cache, single-lock vs sharded.
"""

import time
import random
import math
import threading
import statistics
import json
from typing import List, Dict, Any, Optional
from lru_cache import SingleLockLRU, ShardedLRU


# ─────────────────────────────────────────────
# Access-pattern generators
# ─────────────────────────────────────────────

def _uniform_keys(universe: int) -> int:
    return random.randint(0, universe - 1)


def _zipf_keys(universe: int, alpha: float = 1.2) -> int:
    """
    Zipf distribution: key k chosen with prob ∝ 1/k^alpha.
    Uses the alias method for O(1) sampling (precomputed per call-site).
    Here we use the simpler but slightly slower inverse-CDF method.
    """
    # Precomputed harmonic number
    H = sum(1.0 / (k ** alpha) for k in range(1, universe + 1))
    u = random.random() * H
    cumulative = 0.0
    for k in range(1, universe + 1):
        cumulative += 1.0 / (k ** alpha)
        if cumulative >= u:
            return k - 1          # 0-indexed
    return universe - 1


def _sequential_keys(universe: int, state: dict) -> int:
    """Cycles through keys sequentially (worst case for LRU)."""
    k = state.get("cursor", 0)
    state["cursor"] = (k + 1) % universe
    return k


PATTERNS = {
    "uniform":     lambda u, _s: _uniform_keys(u),
    "zipf":        lambda u, _s: _zipf_keys(u),
    "zipf_hot":    lambda u, _s: _zipf_keys(u, alpha=2.0),   # heavier skew
    "sequential":  lambda u, s:  _sequential_keys(u, s),
}


# ─────────────────────────────────────────────
# Fake "database" (simulates cache miss cost)
# ─────────────────────────────────────────────

class FakeDB:
    def __init__(self, fetch_latency_ms: float = 5.0):
        self.fetch_latency = fetch_latency_ms / 1000.0
        self.fetches = 0
        self._lock = threading.Lock()

    def fetch(self, key: int) -> str:
        time.sleep(self.fetch_latency)
        with self._lock:
            self.fetches += 1
        return f"value_{key}"

    def reset(self):
        with self._lock:
            self.fetches = 0


# ─────────────────────────────────────────────
# Client worker
# ─────────────────────────────────────────────

def _client_worker(
    client_id: int,
    cache,                     # None = no-cache baseline
    db: FakeDB,
    universe: int,
    num_ops: int,
    pattern: str,
    results: list,
    barrier: threading.Barrier,
    write_ratio: float = 0.1,
):
    latencies = []
    state = {}   # for sequential pattern

    key_fn = PATTERNS[pattern]

    barrier.wait()   # all threads start simultaneously

    for _ in range(num_ops):
        key = key_fn(universe, state)
        t0  = time.perf_counter()

        if cache is None:
            # No-cache: always hit DB
            db.fetch(key)
        else:
            if random.random() < write_ratio:
                value = f"value_{key}"
                cache.put(key, value)
            else:
                hit, value = cache.get(key)
                if not hit:
                    value = db.fetch(key)
                    cache.put(key, value)

        latencies.append((time.perf_counter() - t0) * 1000)   # ms

    results.append(latencies)


# ─────────────────────────────────────────────
# Simulation runner
# ─────────────────────────────────────────────

def _percentile(data: List[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = math.ceil(p / 100 * len(sorted_data)) - 1
    return sorted_data[max(0, idx)]


def run_simulation(
    cache_type: str,          # "none" | "single" | "sharded"
    capacity: int,
    num_shards: int,
    num_clients: int,
    ops_per_client: int,
    universe_size: int,
    pattern: str,
    write_ratio: float = 0.1,
    fetch_latency_ms: float = 5.0,
    ttl: Optional[float] = None,
    label: Optional[str] = None,
) -> Dict[str, Any]:

    db = FakeDB(fetch_latency_ms)

    if cache_type == "none":
        cache = None
    elif cache_type == "single":
        cache = SingleLockLRU(capacity, default_ttl=ttl)
    elif cache_type == "sharded":
        cache = ShardedLRU(capacity, num_shards=num_shards, default_ttl=ttl)
    else:
        raise ValueError(f"Unknown cache_type: {cache_type}")

    results = []
    barrier = threading.Barrier(num_clients)

    threads = [
        threading.Thread(
            target=_client_worker,
            args=(i, cache, db, universe_size,
                  ops_per_client, pattern, results, barrier, write_ratio),
            daemon=True,
        )
        for i in range(num_clients)
    ]

    wall_start = time.perf_counter()
    for t in threads: t.start()
    for t in threads: t.join()
    wall_elapsed = time.perf_counter() - wall_start

    all_latencies = [lat for client in results for lat in client]
    total_ops     = len(all_latencies)
    throughput    = total_ops / wall_elapsed if wall_elapsed > 0 else 0

    cache_stats = cache.stats() if cache else {
        "hits": 0, "misses": total_ops, "evictions": 0,
        "hit_rate": 0.0, "size": 0, "capacity": 0,
    }

    return {
        "label":           label or cache_type,
        "cache_type":      cache_type,
        "capacity":        capacity,
        "num_shards":      num_shards,
        "num_clients":     num_clients,
        "total_ops":       total_ops,
        "pattern":         pattern,
        "write_ratio":     write_ratio,
        "fetch_latency_ms": fetch_latency_ms,
        "wall_time_s":     round(wall_elapsed, 4),
        "throughput_ops_s": round(throughput, 1),
        "avg_latency_ms":  round(statistics.mean(all_latencies), 3),
        "p50_latency_ms":  round(_percentile(all_latencies, 50), 3),
        "p95_latency_ms":  round(_percentile(all_latencies, 95), 3),
        "p99_latency_ms":  round(_percentile(all_latencies, 99), 3),
        "db_fetches":      db.fetches,
        **{f"cache_{k}": v for k, v in cache_stats.items()},
    }


# ─────────────────────────────────────────────
# Capacity sweep (hit-rate vs capacity)
# ─────────────────────────────────────────────

def capacity_sweep(
    pattern: str = "zipf",
    universe: int = 1000,
    capacities: Optional[List[int]] = None,
    num_clients: int = 8,
    ops_per_client: int = 500,
) -> List[Dict]:
    if capacities is None:
        capacities = [10, 25, 50, 100, 200, 400, 600, 800, 1000]

    results = []
    for cap in capacities:
        r = run_simulation(
            cache_type="sharded", capacity=cap, num_shards=8,
            num_clients=num_clients, ops_per_client=ops_per_client,
            universe_size=universe, pattern=pattern,
            label=f"cap={cap}",
        )
        results.append({"capacity": cap, "hit_rate": round(r["cache_hit_rate"], 4)})
    return results


# ─────────────────────────────────────────────
# Full benchmark suite
# ─────────────────────────────────────────────

def run_full_benchmark(
    num_clients: int = 12,
    ops_per_client: int = 400,
    universe: int = 1000,
    capacity: int = 200,
) -> Dict[str, Any]:

    common = dict(
        capacity=capacity, num_shards=16,
        num_clients=num_clients, ops_per_client=ops_per_client,
        universe_size=universe, pattern="zipf",
    )

    base = {k: v for k, v in common.items() if k != "num_shards"}
    scenarios = [
        # 1. no-cache baseline
        dict(**base, num_shards=16, cache_type="none",    label="No Cache"),
        # 2. single-lock
        dict(**base, num_shards=16, cache_type="single",  label="Single Lock"),
        # 3. sharded (8 shards)
        dict(**base, num_shards=8,  cache_type="sharded", label="Sharded (8)"),
        # 4. sharded (16 shards)
        dict(**base, num_shards=16, cache_type="sharded", label="Sharded (16)"),
        # 5. sharded with TTL
        dict(**base, num_shards=16, cache_type="sharded", label="Sharded+TTL", ttl=0.05),
    ]

    bench_results = [run_simulation(**s) for s in scenarios]

    # Pattern comparison (sharded, fixed capacity)
    pattern_results = []
    for pat in PATTERNS:
        r = run_simulation(
            cache_type="sharded", capacity=capacity, num_shards=16,
            num_clients=num_clients, ops_per_client=ops_per_client,
            universe_size=universe, pattern=pat, label=pat,
        )
        pattern_results.append({
            "pattern": pat,
            "hit_rate": round(r["cache_hit_rate"], 4),
            "avg_latency_ms": r["avg_latency_ms"],
            "p95_latency_ms": r["p95_latency_ms"],
            "throughput": r["throughput_ops_s"],
        })

    cap_sweep = capacity_sweep(pattern="zipf", universe=universe,
                               num_clients=num_clients,
                               ops_per_client=200)

    return {
        "meta": {
            "num_clients": num_clients,
            "ops_per_client": ops_per_client,
            "universe_size": universe,
            "cache_capacity": capacity,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "benchmarks": bench_results,
        "pattern_comparison": pattern_results,
        "capacity_sweep": cap_sweep,
    }


# ─────────────────────────────────────────────
# CLI entry-point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys, os
    print("=" * 60)
    print("  Concurrent LRU Cache Benchmark — Project 11")
    print("=" * 60)

    print("\n⏳  Running benchmark suite (this takes ~20s)…\n")
    results = run_full_benchmark(
        num_clients=10,
        ops_per_client=300,
        universe=1000,
        capacity=200,
    )

    # Pretty print
    print(f"{'Label':<20} {'Hit Rate':>9} {'Avg ms':>8} {'p95 ms':>8} {'Throughput':>12}  {'DB Fetches':>10}")
    print("-" * 75)
    for r in results["benchmarks"]:
        print(
            f"{r['label']:<20}"
            f"  {r.get('cache_hit_rate', 0):>8.1%}"
            f"  {r['avg_latency_ms']:>8.2f}"
            f"  {r['p95_latency_ms']:>8.2f}"
            f"  {r['throughput_ops_s']:>12,.0f}"
            f"  {r['db_fetches']:>10,}"
        )

    print("\n── Pattern comparison ──")
    print(f"{'Pattern':<15} {'Hit Rate':>9} {'Avg ms':>8} {'p95 ms':>8}")
    print("-" * 45)
    for p in results["pattern_comparison"]:
        print(f"{p['pattern']:<15}  {p['hit_rate']:>8.1%}  {p['avg_latency_ms']:>8.2f}  {p['p95_latency_ms']:>8.2f}")

    # Save JSON for dashboard
    out = "benchmark_results.json"
    with open(out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅  Full results saved → {out}")