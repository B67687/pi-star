# Config Parser Spec

## Interface

```python
config = ConfigParser()
config.load("defaults.cfg")
config.load("override.cfg")  # later files override

# Access
config.get("server.port")        # → 8080 (int)
config.get("server.host")        # → "localhost" (str)
config.get("server.host", str)   # → "localhost"
config.get("debug", bool)        # → True

# Sections
config.sections()                # → ["server", "database"]
config.keys("server")            # → ["host", "port"]
```

## File format

```ini
# This is a comment
server.host=localhost
server.port=8080
debug=true

[database]
host=${server.host}
port=5432
```

## Requirements

1. **SECTION headers**: `[section]` defines a section. Everything below belongs to it.
2. **KEY=VALUE**: Simple key-value parsing
3. **Comments**: Lines starting with `#` are ignored
4. **Blank lines**: Ignored
5. **Auto type coercion**: `"true"/"false"` → bool, integer strings → int, float strings → float, everything else → str
6. **Env var expansion**: `$VAR` or `${VAR}` expands from environment. If not set, keep literal.
7. **Section.key access**: `config.get("section.key")` or `config.get("section", "key")`
8. **File merging**: Load multiple files. Later values override earlier ones.
9. **Error tolerance**: Malformed lines are logged but don't crash the parser
10. **No external dependencies**: Standard library only
