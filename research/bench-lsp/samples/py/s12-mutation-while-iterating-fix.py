"""
Sample 12 FIX: Build a new list instead of mutating in-place.
"""


def remove_odds(numbers: list[int]) -> list[int]:
    """Remove all odd numbers from a list."""
    return [n for n in numbers if n % 2 == 0]


def main() -> None:
    nums = [1, 2, 3, 4, 5, 6]
    result = remove_odds(nums)
    print(f"Result: {result}")
