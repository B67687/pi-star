"""
Sample 03: Logic error (LSP should NOT catch)
Off-by-one in range — algorithmically wrong, syntactically valid.
"""


def find_divisible_by(limit: int, divisor: int) -> list[int]:
    """
    Return all numbers from 1 to limit that are divisible by divisor.
    """
    # BUG: range(1, limit) excludes 'limit' itself
    result = []
    for i in range(1, limit):
        if i % divisor == 0:
            result.append(i)
    return result


def main() -> None:
    # Expected: [5, 10, 15, 20] (1..20 inclusive)
    nums = find_divisible_by(20, 5)
    print(f"Numbers divisible by 5 up to 20: {nums}")
