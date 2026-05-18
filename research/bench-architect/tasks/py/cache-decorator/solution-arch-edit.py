import functools
import hashlib
import json
import os
import threading
import time


class DiskCache:
    """Disk-backed function cache with TTL support.

    Usage as decorator:
        cache = DiskCache(cache_dir="./cache", ttl=3600)
        @cache
        def my_func(x: int) -> int: ...

    Usage as method:
        cache = DiskCache(cache_dir="./cache", ttl=3600)
        result = cache.get_or_compute(func, args, kwargs)  # internal
    """

    def __init__(self, cache_dir="./cache", ttl=3600):
        self.cache_dir = os.path.abspath(cache_dir)
        self.ttl = ttl
        self._lock = threading.Lock()
        os.makedirs(self.cache_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Key generation
    # ------------------------------------------------------------------

    def _make_key(self, func, args, kwargs):
        """Produce a deterministic, filesystem-safe hex digest from
        function name and argument representations.

        Uses repr() on both args and kwargs so that unhashable types
        (lists, dicts, sets) are handled naturally.  Kwargs are sorted
        by key for determinism regardless of insertion order.
        """
        raw = f"{func.__qualname__}:{repr(args)}:{repr(sorted(kwargs.items()))}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _path(self, key):
        """Return the absolute path for a given cache-key."""
        return os.path.join(self.cache_dir, f"{key}.json")

    # ------------------------------------------------------------------
    # Cache file I/O  (all require external locking)
    # ------------------------------------------------------------------

    def _read(self, path):
        """Read and validate a single cache entry.

        Returns the cached value, or None when:
          - the file does not exist
          - the file is corrupt / unparseable
          - the entry has exceeded TTL (stale file is removed)
        """
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError):
            return None

        if "_val" not in data:
            return None

        timestamp = data.get("_ts", 0)
        if self.ttl > 0 and (time.time() - timestamp) > self.ttl:
            self._remove(path)
            return None

        return data["_val"]

    def _write(self, path, value):
        """Atomically write a cache entry: timestamp + serialized value.

        The write is not truly atomic (no rename trick), but the lock
        serialises writers so no interleaving can occur.
        """
        payload = {"_ts": time.time(), "_val": value}
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)

    def _remove(self, path):
        """Best-effort removal of a single cache file."""
        try:
            os.remove(path)
        except FileNotFoundError:
            pass

    # ------------------------------------------------------------------
    # Decorator protocol
    # ------------------------------------------------------------------

    def __call__(self, func):
        """Make the DiskCache instance a decorator.

        The returned wrapper holds the lock only during cache I/O, not
        during the (potentially expensive) user-function call.  A
        last-write-wins race is acceptable for a cache layer.
        """

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = self._make_key(func, args, kwargs)
            path = self._path(key)

            # Fast path: serve from cache (lock held only for I/O)
            with self._lock:
                cached = self._read(path)
            if cached is not None:
                return cached

            # Compute fresh value (outside lock)
            result = func(*args, **kwargs)

            # Persist (lock held only for I/O)
            with self._lock:
                try:
                    self._write(path, result)
                except (TypeError, ValueError):
                    # Return value is not JSON-serialisable; skip caching
                    pass
            return result

        # Attach the instance-level clear() so users can call decorated_fn.clear().
        wrapper.clear = self.clear
        wrapper._cache = self  # expose the backing store for introspection
        return wrapper

    # ------------------------------------------------------------------
    # Bulk operations
    # ------------------------------------------------------------------

    def clear(self):
        """Remove **all** cache files managed by this DiskCache instance."""
        with self._lock:
            self._remove_all()

    def _remove_all(self):
        """Internal: remove every .json file under cache_dir.  Caller
        must hold self._lock."""
        try:
            for fname in os.listdir(self.cache_dir):
                if fname.endswith(".json"):
                    full = os.path.join(self.cache_dir, fname)
                    try:
                        os.remove(full)
                    except FileNotFoundError:
                        pass
        except FileNotFoundError:
            # cache_dir itself was deleted — recreate it
            os.makedirs(self.cache_dir, exist_ok=True)

    def _clear_by_prefix(self, prefix):
        """Remove cache entries whose hex-digest *starts* with *prefix*.

        Used by the per-function clear() attached to each wrapper.
        Caller must hold self._lock.
        """
        try:
            for fname in os.listdir(self.cache_dir):
                if fname.startswith(prefix) and fname.endswith(".json"):
                    full = os.path.join(self.cache_dir, fname)
                    try:
                        os.remove(full)
                    except FileNotFoundError:
                        pass
        except FileNotFoundError:
            os.makedirs(self.cache_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Introspection helpers
    # ------------------------------------------------------------------

    def count(self):
        """Return the number of cached entries (for monitoring)."""
        try:
            with self._lock:
                return sum(1 for f in os.listdir(self.cache_dir) if f.endswith(".json"))
        except FileNotFoundError:
            return 0

    def size_bytes(self):
        """Return approximate total size of cached files in bytes."""
        total = 0
        try:
            with self._lock:
                for fname in os.listdir(self.cache_dir):
                    if fname.endswith(".json"):
                        fp = os.path.join(self.cache_dir, fname)
                        try:
                            total += os.path.getsize(fp)
                        except FileNotFoundError:
                            pass
        except FileNotFoundError:
            pass
        return total


# ----------------------------------------------------------------------
# Module-level convenience factory
# ----------------------------------------------------------------------


def disk_cache(cache_dir="./cache", ttl=3600):
    """Decorator factory for disk-backed function caching.

    Returns a DiskCache instance, which is itself a decorator:

        @disk_cache(cache_dir="./my_cache", ttl=300)
        def expensive(x: int) -> int:
            ...

    Equivalent to:

        cache = DiskCache(cache_dir="./my_cache", ttl=300)

        @cache
        def expensive(x: int) -> int:
            ...
    """
    return DiskCache(cache_dir=cache_dir, ttl=ttl)
