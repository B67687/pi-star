"""
Sample 07: Unused import (LSP SHOULD catch this)
"""

import os  # BUG: os is imported but never used


def set_timeout(seconds: int) -> str:
    return f"Timeout set to {seconds}ms"


def main() -> None:
    print(set_timeout(30))
