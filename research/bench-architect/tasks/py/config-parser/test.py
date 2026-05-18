"""Tests for config_parser. Run with: python test.py"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from solution import ConfigParser


def make_cfg(lines: list[str]) -> str:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".cfg", delete=False)
    f.write("\n".join(lines))
    f.close()
    return f.name


def test_basic_kv():
    f = make_cfg(["host=localhost", "port=8080"])
    c = ConfigParser()
    c.load(f)
    assert c.get("host") == "localhost"
    assert c.get("port") == 8080
    os.unlink(f)
    print("  ✓ basic KV")


def test_sections():
    f = make_cfg(["[server]", "host=localhost", "[db]", "port=5432"])
    c = ConfigParser()
    c.load(f)
    assert c.get("server.host") == "localhost"
    assert c.get("db.port") == 5432
    os.unlink(f)
    print("  ✓ sections")


def test_type_coercion():
    f = make_cfg(["count=42", "pi=3.14", "debug=true", "name=hello"])
    c = ConfigParser()
    c.load(f)
    assert c.get("count") == 42
    assert isinstance(c.get("count"), int)
    assert c.get("pi") == 3.14
    assert isinstance(c.get("pi"), float)
    assert c.get("debug") == True
    assert isinstance(c.get("debug"), bool)
    assert c.get("name") == "hello"
    os.unlink(f)
    print("  ✓ type coercion")


def test_comments():
    f = make_cfg(["# comment", "key=value", "# another"])
    c = ConfigParser()
    c.load(f)
    assert c.get("key") == "value"
    os.unlink(f)
    print("  ✓ comments")


def test_env_expansion():
    os.environ["TEST_VAR"] = "expanded"
    f = make_cfg(["path=$TEST_VAR", "static=hello"])
    c = ConfigParser()
    c.load(f)
    assert c.get("path") == "expanded"
    assert c.get("static") == "hello"
    os.unlink(f)
    print("  ✓ env expansion")


def test_file_merging():
    f1 = make_cfg(["key=first"])
    f2 = make_cfg(["key=second"])
    c = ConfigParser()
    c.load(f1)
    c.load(f2)
    assert c.get("key") == "second"  # later file wins
    os.unlink(f1)
    os.unlink(f2)
    print("  ✓ file merging")


def test_section_key():
    f = make_cfg(["[server]", "port=8080"])
    c = ConfigParser()
    c.load(f)
    assert c.get("server.port") == 8080
    os.unlink(f)
    print("  ✓ section.key access")


def test_malformed_line():
    f = make_cfg(["valid=yes", ";;;;garbage;;;;", "also=ok"])
    c = ConfigParser()
    c.load(f)
    assert c.get("valid") == "yes"
    assert c.get("also") == "ok"
    os.unlink(f)
    print("  ✓ malformed lines tolerated")


if __name__ == "__main__":
    tests = [n for n in dir() if n.startswith("test_")]
    passed = 0
    failed = 0
    for name in tests:
        try:
            globals()[name]()
            passed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
    print(f"\n{passed}/{passed + failed} passed")
    exit(0 if failed == 0 else 1)
