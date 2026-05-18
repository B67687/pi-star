# Cache Decorator Spec

## Interface

```python
@disk_cache(cache_dir="./cache", ttl=3600)
def expensive_function(x: int, y: list) -> dict:
    ...

# Or named instance
cache = DiskCache(cache_dir="./cache", ttl=3600)

@cache
def another_function(x: int) -> int:
    ...
```

## Requirements

1. **Disk-backed**: Cache persists to JSON files in `cache_dir`
2. **Cache key**: `f"{func.__name__}({repr(args)}, {repr(kwargs)})"` — converted to safe filename (hash if too long)
3. **TTL**: If `ttl` seconds have passed since cache entry was created, treat as miss. `ttl=0` means no expiry.
4. **Unhashable args**: Lists, dicts, sets converted via `repr()` before key derivation
5. **Thread-safe**: Use `threading.Lock` per cache file or global lock
6. **Cache invalidation**: `cache.clear()` removes all cached entries for that function
7. **No external dependencies**: Standard library only (json, os, hashlib, threading, functools, time)
