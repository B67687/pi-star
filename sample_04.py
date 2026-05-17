"""
Sample 04: Missing null check (LSP should NOT catch)
Function returns Optional[str] but caller assumes non-None.
"""

from typing import Optional


def lookup_user(user_id: int) -> Optional[dict]:
    """Look up a user by ID. Returns None if not found."""
    users = {1: {"name": "Alice"}, 2: {"name": "Bob"}}
    return users.get(user_id)


def print_user_name(user_id: int) -> None:
    user = lookup_user(user_id)
    if user is None:
        print(f"User {user_id} not found")
        return
    print(user["name"])


def main() -> None:
    print_user_name(1)  # works
    print_user_name(3)  # now safe — prints "User 3 not found"
