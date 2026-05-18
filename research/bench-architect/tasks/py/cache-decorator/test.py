"""Tests for disk_cache decorator. Run with: python test.py"""

import os
import sys
import tempfile
import time
import threading

# Import the solution (runner writes to solution.py)
sys.path.insert(0, os.path.dirname(__file__))
from solution import disk_cache, DiskCache

CACHE_DIR = tempfile.mkdtemp(prefix="cache_test_")


def setup_module():
    os.makedirs(CACHE_DIR, exist_ok=True)


def teardown_module():
    import shutil

    shutil.rmtree(CACHE_DIR, ignore_errors=True)


# ── Tests ──


def test_basic_caching():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR)
    def add(a: int, b: int) -> int:
        nonlocal call_count
        call_count += 1
        return a + b

    assert add(1, 2) == 3
    assert call_count == 1
    assert add(1, 2) == 3  # cached
    assert call_count == 1, "Should use cache"
    assert add(3, 4) == 7
    assert call_count == 2


def test_ttl():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR, ttl=1)
    def now() -> str:
        nonlocal call_count
        call_count += 1
        return str(time.time())

    first = now()
    assert call_count == 1
    second = now()
    assert call_count == 1  # cached within TTL
    time.sleep(1.5)
    third = now()
    assert call_count == 2  # TTL expired, re-called
    assert third != first


def test_unhashable_args():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR)
    def process(items: list, config: dict) -> str:
        nonlocal call_count
        call_count += 1
        return f"{len(items)} items, {len(config)} keys"

    assert process([1, 2], {"a": 1}) == "2 items, 1 keys"
    assert call_count == 1
    assert process([1, 2], {"a": 1}) == "2 items, 1 keys"  # cached
    assert call_count == 1


def test_cache_clear():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR)
    def get_value(key: str) -> str:
        nonlocal call_count
        call_count += 1
        return f"value_{key}"

    assert get_value("x") == "value_x"
    assert call_count == 1
    get_value.clear()
    assert get_value("x") == "value_x"
    assert call_count == 2  # cache cleared


def test_thread_safety():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR)
    def compute(n: int) -> int:
        nonlocal call_count
        call_count += 1
        return n * n

    errors = []

    def worker():
        try:
            for i in range(10):
                assert compute(i) == i * i
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(errors) == 0, f"Thread-safety errors: {errors}"


def test_no_expiry():
    call_count = 0

    @disk_cache(cache_dir=CACHE_DIR, ttl=0)
    def constant() -> int:
        nonlocal call_count
        call_count += 1
        return 42

    assert constant() == 42
    assert call_count == 1
    assert constant() == 42  # cached (ttl=0 means no expiry)
    assert call_count == 1


if __name__ == "__main__":
    setup_module()
    tests = [n for n in dir() if n.startswith("test_")]
    passed = 0
    failed = 0
    for name in tests:
        try:
            globals()[name]()
            print(f"  ✓ {name}")
            passed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
    teardown_module()
    print(f"\n{passed}/{passed + failed} passed")
    exit(0 if failed == 0 else 1)
