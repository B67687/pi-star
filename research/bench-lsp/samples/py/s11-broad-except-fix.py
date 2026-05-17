"""
Sample 11 FIX: Catch specific exceptions.
"""


def read_config(path: str) -> dict:
    """Read a JSON config file."""
    try:
        with open(path) as f:
            return __import__("json").load(f)
    except FileNotFoundError:
        return {}
    except ValueError:
        return {}


def main() -> None:
    config = read_config("/nonexistent/config.json")
    port = config.get("port", 8080)
    print(f"Starting on port {port}")
