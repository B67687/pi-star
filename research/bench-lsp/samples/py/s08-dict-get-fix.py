"""
Sample 08 FIX: Use setdefault instead of get + append.
"""


def process_items(items: list[str]) -> dict[str, list[str]]:
    """Group items by first letter."""
    groups: dict[str, list[str]] = {}

    for item in items:
        first = item[0].upper()
        # FIXED: setdefault mutates the dict in place
        groups.setdefault(first, []).append(item)

    return groups


def main() -> None:
    result = process_items(["apple", "banana", "avocado", "blueberry"])
    print(result)
