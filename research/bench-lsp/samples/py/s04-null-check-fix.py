"""
Sample 04 FIX: Missing null check — added None guard before access.
"""

from typing import Optional


def lookup_user(user_id: int) -> Optional[dict]:
    """Look up a user by ID. Returns None if not found."""
    users = {1: {"name": "Alice"}, 2: {"name": "Bob"}}
    return users.get(user_id)


def print_user_name(user_id: int) -> None:
    # FIXED: check for None before accessing ['name']
    user = lookup_user(user_id)
    if user is None:
        print(f"User {user_id} not found")
        return
    print(user["name"])


def main() -> None:
    print_user_name(1)
    print_user_name(3)  # now handles gracefully
