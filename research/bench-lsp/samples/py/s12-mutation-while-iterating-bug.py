"""
Sample 12: List mutation during iteration (LSP should NOT catch)
Modifying a list while iterating over it — skips elements.
"""


def remove_odds(numbers: list[int]) -> list[int]:
    """Remove all odd numbers from a list."""
    # BUG: Mutating the list while iterating — when an element is removed,
    # the next element shifts into its place and gets skipped.
    for i, n in enumerate(numbers):
        if n % 2 != 0:
            del numbers[i]
    return numbers


def main() -> None:
    nums = [1, 2, 3, 4, 5, 6]
    # Expected: [2, 4, 6]
    # Bug: 1 is removed → 3 shifts to index 0 → i=1 processes 4 instead of 3
    result = remove_odds(nums)
    print(f"Result: {result}")
