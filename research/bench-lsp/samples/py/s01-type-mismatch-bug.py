"""
Sample 01: Type annotation mismatch (LSP SHOULD catch)
A function declares `int` parameter but gets a `str` from the caller.
"""

# --- main.py ---
from typing import Optional


def process_item(item_id: int) -> Optional[str]:
    """Fetch and process an item by ID."""
    if item_id <= 0:
        return None
    return f"Processed item #{item_id}"


def main() -> None:
    # BUG: item_id is a string, but process_item expects int
    item_id: str = "42"
    result = process_item(item_id)
    if result:
        print(result)


if __name__ == "__main__":
    main()
