"""
Sample 02 FIX: Undefined variable reference — fixed variable name.
"""


def calculate_discount(price: float, rate: float) -> float:
    """Apply a discount rate to a price."""
    discount = price * rate
    return price - discount  # FIXED: discout → discount


def main() -> None:
    print(calculate_discount(100.0, 0.2))
