#!/usr/bin/env python3
"""
Disk-backed cache decorator.

Provides a decorator that caches function return values to disk as JSON files.
Designed for thread-safe concurrent access across multiple callers.

Features:
  - Configurable cache directory (auto-created on first use)
  - Optional TTL (time-to-live) in seconds
  - Thread-safe via per-function threading.Lock
  - Handles unhashable argument types (lists, dicts, etc.) via repr()
  - Graceful recovery from corrupted or partially-written cache files
  - Handles non-serializable return values by skipping the cache write
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from functools import wraps
from typing import Any, Callable, Optional, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


def disk_cache(cache_dir: str = ".cache", ttl: Optional[float] = None):
    """Decorator that caches function results to disk as JSON files.

    Parameters
    ----------
    cache_dir:
        Directory under which cache files are stored.  Created automatically
        on the first decorated call if it does not exist.
    ttl:
        Time-to-live in **seconds**.  When a cached entry is older than *ttl*
        it is treated as a cache miss and the function is re-evaluated.
        ``None`` (the default) means entries never expire.

    Raises
    ------
    ValueError
        If *ttl* is not ``None`` and is not a positive number.

    Examples
    --------
    >>> @disk_cache(cache_dir="/tmp/my-cache")
    ... def slow_add(a, b):
    ...     time.sleep(1)
    ...     return a + b
    ...
    >>> slow_add(1, 2)   # ~1 s – computed
    3
    >>> slow_add(1, 2)   # instant – cached
    3

    With a TTL:

    >>> @disk_cache(cache_dir="/tmp/my-cache", ttl=60)
    ... def fetch_data(url):
    ...     return requests.get(url).json()
    ...
    """
    if ttl is not None and ttl <= 0:
        raise ValueError(f"ttl must be a positive number, got {ttl}")

    # Ensure the cache directory exists eagerly so the user gets an
    # early error if it cannot be created.
    os.makedirs(cache_dir, exist_ok=True)

    def decorator(func: F) -> F:
        # Per-function lock so that callers of *different* functions
        # do not contend with each other.
        _lock = threading.Lock()

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = _make_key(func.__name__, args, kwargs)
            cache_path = os.path.join(cache_dir, f"{key}.json")

            # ── read path (under lock to prevent races on delete-then-read) ──
            with _lock:
                result = _read_cache(cache_path, ttl)
                if result is not None:
                    return result

            # ── compute -----------------------------------------------------
            result = func(*args, **kwargs)

            # ── write path (under lock) -------------------------------------
            with _lock:
                _write_cache(cache_path, result, key)

            return result

        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _make_key(name: str, args: tuple, kwargs: dict) -> str:
    """Return a deterministic hex string key for a function call."""
    parts: list[str] = [name]
    parts.extend(repr(a) for a in args)
    parts.extend(f"{k}={repr(v)}" for k, v in kwargs.items())
    raw = ":".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _read_cache(path: str, ttl: Optional[float]) -> Any:
    """Return the cached result, or *None* if the entry is missing / stale /
    corrupted.

    Stale entries are **removed from disk** so that a later call does not
    encounter an expired file again.
    """
    try:
        with open(path, "r") as f:
            entry: dict = json.load(f)

        # Check TTL (keys that may be absent in entries written by older
        # versions of the decorator are treated as *not expired*).
        if ttl is not None:
            ts = entry.get("timestamp")
            if ts is not None and (time.time() - ts) > ttl:
                os.remove(path)
                return None

        return entry.get("result")

    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError, KeyError):
        # Corrupted file – remove it so it doesn't accumulate.
        try:
            os.remove(path)
        except OSError:
            pass
        return None


def _write_cache(path: str, result: Any, key: str) -> None:
    """Write *result* to *path* as a JSON cache entry.

    If *result* is not JSON-serializable the write is silently skipped
    (the function will re-compute every time).
    """
    entry = {
        "timestamp": time.time(),
        "result": result,
        "key": key,
    }
    try:
        with open(path, "w") as f:
            json.dump(entry, f, indent=2, default=str)
    except (TypeError, OSError):
        # Not serializable – skip caching.
        pass


# Convenience alias
cached = disk_cache
