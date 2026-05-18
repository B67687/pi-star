import functools
import hashlib
import json
import os
import threading
import time


class DiskCache:
    """Disk-backed cache for function results.

    Stores results as JSON files in a cache directory. Thread-safe via an
    internal lock. Supports TTL-based expiry and manual invalidation.

    Args:
        cache_dir: Directory to store cache files. Created if it does not exist.
        ttl: Time-to-live in seconds. 0 means cached entries never expire.
    """

    def __init__(self, cache_dir="./cache", ttl=3600):
        self.cache_dir = os.path.abspath(cache_dir)
        self.ttl = ttl
        self._lock = threading.Lock()
        os.makedirs(self.cache_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_key(self, func, args, kwargs):
        """Build a deterministic, filesystem-safe hex key for the call."""
        raw = f"{func.__name__}:{repr(args)}:{repr(sorted(kwargs.items()))}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _path(self, key):
        return os.path.join(self.cache_dir, f"{key}.json")

    def _load(self, path):
        """Return (result, timestamp) from a cache file."""
        with open(path, "r") as fh:
            data = json.load(fh)
        return data["result"], data["timestamp"]

    def _dump(self, path, result):
        """Write result + current timestamp to a cache file."""
        data = {"result": result, "timestamp": time.time()}
        with open(path, "w") as fh:
            json.dump(data, fh)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def clear(self):
        """Remove every cache file from the cache directory."""
        with self._lock:
            for entry in os.listdir(self.cache_dir):
                if entry.endswith(".json"):
                    try:
                        os.remove(os.path.join(self.cache_dir, entry))
                    except OSError:
                        pass

    # ------------------------------------------------------------------
    # Decorator protocol
    # ------------------------------------------------------------------

    def __call__(self, func):
        """Use the DiskCache instance as a decorator."""

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = self._make_key(func, args, kwargs)
            path = self._path(key)

            # --- cache-hit path (inside the lock so reads are atomic) ---
            with self._lock:
                if os.path.exists(path):
                    try:
                        result, cached_at = self._load(path)
                        if self.ttl == 0 or (time.time() - cached_at) < self.ttl:
                            return result
                    except (ValueError, KeyError, OSError):
                        # Corrupt or unreadable file → fall through to recompute.
                        pass

            # --- compute (outside the lock so different keys don't block) ---
            result = func(*args, **kwargs)

            # --- cache-write path ---
            with self._lock:
                # Double-check: another thread may have written while we
                # computed, but only write if nothing exists to avoid races
                # that would also try to serialise the same result.
                if not os.path.exists(path):
                    try:
                        self._dump(path, result)
                    except (TypeError, ValueError, OSError):
                        # Non-JSON-serializable result or IO error → skip cache.
                        pass

            return result

        # Attach the clear method so users can call decorated_fn.clear().
        wrapper.clear = self.clear
        return wrapper


# ------------------------------------------------------------------
# Convenience factory: the @disk_cache(...) spelling
# ------------------------------------------------------------------

def disk_cache(cache_dir="./cache", ttl=3600):
    """Decorate a function with a disk-backed cache.

    Args:
        cache_dir: Directory to store cache files.
        ttl: Time-to-live in seconds. 0 disables expiry.

    Returns:
        A DiskCache instance that acts as a decorator.

    Example::

        @disk_cache(cache_dir="./my_cache", ttl=600)
        def expensive_computation(x, y):
            ...

        # Invalidate everything for this cache directory:
        expensive_computation.clear()
    """
    return DiskCache(cache_dir=cache_dir, ttl=ttl)
