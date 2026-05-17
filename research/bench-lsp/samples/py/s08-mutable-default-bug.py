"""
Sample 08: Mutable default argument (LSP should NOT catch)
Classic Python footgun — default list is shared across calls.
"""

from typing import Optional


def add_item(item: str, cache: Optional[list[str]] = None) -> list[str]:
    """Add an item to a cache list. Creates new cache if none provided."""
    if cache is None:
        cache = []
    cache.append(item)
    return cache


def process_items(items: list[str]) -> dict[str, list[str]]:
    """Group items by first letter. BUG: mutable default argument."""
    groups: dict[str, list[str]] = {}

    for item in items:
        first = item[0].upper()
        # BUG: Using a mutable list as default in dict.get
        # groups.setdefault(first, []).append(item) ← correct
        group = groups.get(first, [])
        group.append(item)
        groups[first] = group  # ← only works because we reassign

    return groups


def main() -> None:
    result = process_items(["apple", "banana", "avocado", "blueberry"])
    print(result)
    # Expected: {'A': ['apple', 'avocado'], 'B': ['banana', 'blueberry']}
