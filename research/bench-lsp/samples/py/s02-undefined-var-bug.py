"""
Sample 02: Undefined variable reference (LSP SHOULD catch)
Using a variable that was never declared.
"""


def calculate_discount(price: float, rate: float) -> float:
    """Apply a discount rate to a price."""
    # BUG: 'discounted' is never defined — variable name misspelled
    discount = price * rate
    return price - discout  # should be 'discount'


def main() -> None:
    print(calculate_discount(100.0, 0.2))
