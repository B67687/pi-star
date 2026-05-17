"""
Sample 01 FIX: Type annotation mismatch — fixed the caller to pass int.
"""

from typing import Optional


def process_item(item_id: int) -> Optional[str]:
    if item_id <= 0:
        return None
    return f"Processed item #{item_id}"


def main() -> None:
    # FIXED: item_id is now an int
    item_id: int = 42
    result = process_item(item_id)
    if result:
        print(result)


if __name__ == "__main__":
    main()
