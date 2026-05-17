"""
Sample 08: Dictionary get without reassignment (LSP should NOT catch)
The result of .get() is a new default list — appending to it doesn't update the dict.
"""


def process_items(items: list[str]) -> dict[str, list[str]]:
    """Group items by first letter."""
    groups: dict[str, list[str]] = {}

    for item in items:
        first = item[0].upper()
        # BUG: .get() returns a NEW list '[]' when key missing
        # Appending to 'group' doesn't modify 'groups'
        group = groups.get(first, [])
        group.append(item)
        # Missing: groups[first] = group

    return groups


def main() -> None:
    result = process_items(["apple", "banana", "avocado", "blueberry"])
    print(result)
    # Expected: {'A': ['apple', 'avocado'], 'B': ['banana', 'blueberry']}
    # Actually gets: {} — all items lost
