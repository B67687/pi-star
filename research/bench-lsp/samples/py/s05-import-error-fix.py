"""
Sample 05 FIX: Wrong import — using json.loads instead of json.load.
"""

import json


def load_config() -> dict:
    config_str = '{"debug": true, "port": 8080}'
    # FIXED: json.load reads from file, json.loads reads from string
    return json.loads(config_str)
