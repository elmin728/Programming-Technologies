"""
Concurrent LRU Cache — Project 11
Implements:
  - Single-lock LRU cache
  - Sharded LRU cache (N shards, each with its own RW lock)
  - Optional per-entry TTL
"""

import threading
import time
import hashlib
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Optional, Tuple


# ─────────────────────────────────────────────
# Core node / ordered-dict LRU (no lock)
# ─────────────────────────────────────────────

@dataclass
class _Entry:
    value: Any
    expires_at: Optional[float]   # None = no TTL

    def is_alive(self) -> bool:
        return self.expires_at is None or time.monotonic() < self.expires_at


class _LRUCore:
    """
    Unsynchronised LRU using OrderedDict.
    Invariant: last key in dict == most-recently used.
    """

    def __init__(self, capacity: int):
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self.capacity = capacity
        self._data: OrderedDict[Any, _Entry] = OrderedDict()
        self.hits = 0
        self.misses = 0
        self.evictions = 0

    # ── public ──

    def get(self, key) -> Tuple[bool, Any]:
        entry = self._data.get(key)
        if entry is None:
            self.misses += 1
            return False, None
        if not entry.is_alive():
            del self._data[key]
            self.misses += 1
            return False, None
        self._data.move_to_end(key)          # promote to MRU
        self.hits += 1
        return True, entry.value

    def put(self, key, value, ttl: Optional[float] = None):
        expires_at = (time.monotonic() + ttl) if ttl is not None else None
        if key in self._data:
            self._data[key] = _Entry(value, expires_at)
            self._data.move_to_end(key)
        else:
            self._data[key] = _Entry(value, expires_at)
            if len(self._data) > self.capacity:
                self._data.popitem(last=False)  # evict LRU (first item)
                self.evictions += 1

    def delete(self, key) -> bool:
        return self._data.pop(key, None) is not None

    def size(self) -> int:
        return len(self._data)

    def reset_stats(self):
        self.hits = self.misses = self.evictions = 0


# ─────────────────────────────────────────────
# RW-Lock helper
# ─────────────────────────────────────────────

class _RWLock:
    """
    Classic readers-writer lock.
    Multiple concurrent readers OR one exclusive writer.
    """

    def __init__(self):
        self._read_ready = threading.Condition(threading.Lock())
        self._readers = 0

    # context managers

    class _ReadCtx:
        def __init__(self, lock): self._l = lock
        def __enter__(self):
            with self._l._read_ready:
                self._l._readers += 1
        def __exit__(self, *_):
            with self._l._read_ready:
                self._l._readers -= 1
                if self._l._readers == 0:
                    self._l._read_ready.notify_all()

    class _WriteCtx:
        def __init__(self, lock): self._l = lock
        def __enter__(self):
            self._l._read_ready.acquire()
            while self._l._readers > 0:
                self._l._read_ready.wait()
        def __exit__(self, *_):
            self._l._read_ready.release()

    def read_lock(self):  return self._ReadCtx(self)
    def write_lock(self): return self._WriteCtx(self)


# ─────────────────────────────────────────────
# Single-Lock LRU (coarse)
# ─────────────────────────────────────────────

class SingleLockLRU:
    """Thread-safe LRU with one coarse mutex."""

    def __init__(self, capacity: int, default_ttl: Optional[float] = None):
        self._core = _LRUCore(capacity)
        self._lock = threading.Lock()
        self.default_ttl = default_ttl
        self.name = "SingleLock"

    def get(self, key):
        with self._lock:
            return self._core.get(key)

    def put(self, key, value, ttl: Optional[float] = None):
        effective_ttl = ttl if ttl is not None else self.default_ttl
        with self._lock:
            self._core.put(key, value, effective_ttl)

    def delete(self, key):
        with self._lock:
            return self._core.delete(key)

    def size(self):
        with self._lock:
            return self._core.size()

    def stats(self):
        with self._lock:
            c = self._core
            total = c.hits + c.misses
            return {
                "hits": c.hits,
                "misses": c.misses,
                "evictions": c.evictions,
                "hit_rate": c.hits / total if total else 0.0,
                "size": c.size(),
                "capacity": c.capacity,
            }

    def reset_stats(self):
        with self._lock:
            self._core.reset_stats()


# ─────────────────────────────────────────────
# Sharded LRU (fine-grained)
# ─────────────────────────────────────────────

class ShardedLRU:
    """
    N independent shards, each a _LRUCore protected by its own RW-lock.
    Reads acquire shared lock; writes acquire exclusive lock.
    Hot-spot probability ≈ 1/N compared to single-lock.
    """

    def __init__(self, capacity: int, num_shards: int = 16,
                 default_ttl: Optional[float] = None):
        if num_shards < 1:
            raise ValueError("num_shards must be >= 1")
        self.num_shards = num_shards
        self.default_ttl = default_ttl
        shard_cap = max(1, capacity // num_shards)
        self._shards = [_LRUCore(shard_cap) for _ in range(num_shards)]
        self._locks  = [_RWLock()           for _ in range(num_shards)]
        self.name = f"Sharded({num_shards})"

    def _shard(self, key) -> int:
        h = hashlib.xxh32(str(key).encode()).intdigest() if hasattr(hashlib, 'xxh32') \
            else int(hashlib.md5(str(key).encode()).hexdigest(), 16)
        return h % self.num_shards

    def get(self, key):
        idx  = self._shard(key)
        lock = self._locks[idx]
        core = self._shards[idx]
        with lock.read_lock():
            # We promote MRU inside read lock — fine because each shard is independent
            return core.get(key)

    def put(self, key, value, ttl: Optional[float] = None):
        effective_ttl = ttl if ttl is not None else self.default_ttl
        idx  = self._shard(key)
        lock = self._locks[idx]
        core = self._shards[idx]
        with lock.write_lock():
            core.put(key, value, effective_ttl)

    def delete(self, key):
        idx  = self._shard(key)
        lock = self._locks[idx]
        core = self._shards[idx]
        with lock.write_lock():
            return core.delete(key)

    def size(self):
        return sum(s.size() for s in self._shards)

    def stats(self):
        hits = sum(s.hits      for s in self._shards)
        miss = sum(s.misses    for s in self._shards)
        evic = sum(s.evictions for s in self._shards)
        total = hits + miss
        return {
            "hits": hits,
            "misses": miss,
            "evictions": evic,
            "hit_rate": hits / total if total else 0.0,
            "size": self.size(),
            "capacity": sum(s.capacity for s in self._shards),
        }

    def reset_stats(self):
        for s in self._shards:
            s.reset_stats()
