"""
Sample 11: Catching too-broad exception (LSP should NOT catch)
Catching Exception instead of the specific error type.
"""


def read_config(path: str) -> dict:
    """Read a JSON config file. BUG: catches everything."""
    try:
        with open(path) as f:
            return __import__("json").load(f)
    except Exception:  # BUG: too broad — hides FileNotFoundError, JSONDecodeError, etc.
        return {}


def main() -> None:
    config = read_config("/nonexistent/config.json")
    port = config.get("port", 8080)
    print(f"Starting on port {port}")
