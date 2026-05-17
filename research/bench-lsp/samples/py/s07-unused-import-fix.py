"""
Sample 07 FIX: Remove unused import, fix misleading unit label.
"""

from typing import Optional


def set_timeout(seconds: int) -> str:
    return f"Timeout set to {seconds}s"


def main() -> None:
    print(set_timeout(30))
