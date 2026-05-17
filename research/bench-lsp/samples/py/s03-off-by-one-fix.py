"""
Sample 03 FIX: Off-by-one error — fixed the range to include limit.
"""


def find_divisible_by(limit: int, divisor: int) -> list[int]:
    """
    Return all numbers from 1 to limit that are divisible by divisor.
    """
    # FIXED: range(1, limit + 1) includes limit
    result = []
    for i in range(1, limit + 1):
        if i % divisor == 0:
            result.append(i)
    return result


def main() -> None:
    # Expected: [5, 10, 15, 20] — now works
    nums = find_divisible_by(20, 5)
    print(f"Numbers divisible by 5 up to 20: {nums}")
