"""
Sample 05: Import from wrong module (LSP SHOULD catch)
Importing a function from a module where it doesn't exist.
"""

# BUG: json.dump exists, but json.dumps doesn't — should be json.dumps or json.dump
# Actually json.dumps does exist! Let me change this.

# BUG: json.load is not a function — should be json.loads (string) or json.load (file)
# But the input is a dict literal, not a file. Wrong import entirely.
import json


def load_config() -> dict:
    config_str = '{"debug": true, "port": 8080}'
    # BUG: json.load reads from a file, not a string. Should be json.loads.
    return json.load(config_str)
