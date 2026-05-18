"""Disk-backed function cache decorator with TTL support.

Provides both a decorator interface (``@disk_cache(...)``) and a class-based
interface (``DiskCache``) for caching function results to JSON files.

Examples
--------
Decorator usage::

    @disk_cache(cache_dir="./cache", ttl=3600)
    def my_function(x: int) -> int: ...

Class-based usage::

    cache = DiskCache(cache_dir="./cache", ttl=3600)

    @cache
    def another_function(x: int) -> int: ...
"""

from __future__ import annotations

import functools
import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


def _make_cache_key(func_name: str, args: tuple, kwargs: dict) -> str:
    """Build a deterministic, filesystem-safe cache key.

    Uses ``repr()`` on every argument (including unhashable types such as
    ``list`` and ``dict``), then SHA-256 hashes the result so the filename
    is always safe on every platform.
    """
    raw: str = "|".join(
        (
            func_name,
            repr(args),
            repr(sorted(kwargs.items())),
        )
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _load_cache(path: Path) -> Optional[dict]:
    """Read a JSON cache entry from *path*, or return ``None``."""
    try:
        with open(path, "r") as fh:
            return json.load(fh)  # type: ignore[no-any-return]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _write_cache(path: Path, entry: dict) -> None:
    """Atomically write *entry* to *path* via a temporary file."""
    tmp = path.with_suffix(".tmp." + str(os.getpid()))
    try:
        with open(tmp, "w") as fh:
            json.dump(entry, fh)
        os.replace(tmp, path)
    except BaseException:
        # Clean up the temp file on any failure
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _is_expired(entry: dict, ttl: int) -> bool:
    """Return ``True`` when *entry* is older than *ttl* seconds."""
    if ttl == 0:
        return False
    created: float = entry.get("created", 0.0)
    return (time.monotonic() - created) > ttl


def _build_entry(value: Any) -> dict:
    """Build a cache entry dict with the current timestamp."""
    return {"value": value, "created": time.monotonic()}


class DiskCache:
    """Disk-backed cache that can be used as a decorator.

    Parameters
    ----------
    cache_dir : str, optional
        Directory for cache files. Created automatically if it does not
        exist. Defaults to ``"./cache"``.
    ttl : int, optional
        Time-to-live in seconds.  ``0`` (the default) means never expire.
    """

    def __init__(self, cache_dir: str = "./cache", ttl: int = 0) -> None:
        self._cache_dir = Path(cache_dir)
        self._ttl = ttl
        self._lock = threading.Lock()

    # -- public helpers -------------------------------------------------------

    @property
    def cache_dir(self) -> Path:
        """Return the resolved cache directory path."""
        return self._cache_dir

    @property
    def ttl(self) -> int:
        """Return the configured TTL in seconds (0 = no expiry)."""
        return self._ttl

    # -- public operations ----------------------------------------------------

    def clear(self) -> None:
        """Remove every cache file under *cache_dir*."""
        if not self._cache_dir.exists():
            return
        with self._lock:
            for child in self._cache_dir.iterdir():
                if child.is_file():
                    child.unlink()

    def __call__(self, func: F) -> F:
        """Decorate *func* so that its results are cached on disk."""

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = _make_cache_key(func.__name__, args, kwargs)
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path = self._cache_dir / (key + ".json")

            # Fast path: hit and still fresh
            with self._lock:
                entry = _load_cache(cache_path)
                if entry is not None and not _is_expired(entry, self._ttl):
                    return entry["value"]

            # Miss or expired — call the wrapped function
            result = func(*args, **kwargs)

            with self._lock:
                # Double-check: another thread may have written since we
                # released the lock above.
                entry = _load_cache(cache_path)
                if entry is None or _is_expired(entry, self._ttl):
                    _write_cache(cache_path, _build_entry(result))

            return result

        # Expose cache operations on the wrapper so callers can
        # invalidate entries via  my_func.clear()  or  my_func.cache.clear()
        wrapper.clear = self.clear  # type: ignore[attr-defined]
        wrapper.cache = self  # type: ignore[attr-defined]

        return wrapper  # type: ignore[return-value]


# -- module-level convenience decorator --------------------------------------


def disk_cache(cache_dir: str = "./cache", ttl: int = 0) -> Callable[[F], F]:
    """Decorator that caches function results on disk.

    Parameters
    ----------
    cache_dir : str, optional
        Directory for cache files. Defaults to ``"./cache"``.
    ttl : int, optional
        Time-to-live in seconds.  ``0`` (the default) means never expire.
    """
    return DiskCache(cache_dir=cache_dir, ttl=ttl)
