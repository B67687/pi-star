import os
import re
import logging

logger = logging.getLogger(__name__)


class ConfigParser:
    """Parse a custom config format with sections, comments, type coercion,
    environment variable expansion, and multi-file merging.

    Format::

        # comment
        [section]
        key = value
        nested.key = value    # accessible as config.get('section.nested.key')
    """

    def __init__(self):
        self._data = {}                # flat dict: "section.key" -> raw string
        self._section = ""             # current section during parse
        self._errors = []              # (line_number, line, reason)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load(self, *paths: str) -> "ConfigParser":
        """Load one or more config files.  Later files override earlier ones.

        Malformed lines are logged as warnings and collected in
        ``self.errors`` instead of raising.
        """
        for path in paths:
            self._load_one(path)
        return self

    def load_string(self, text: str, source: str = "<string>") -> "ConfigParser":
        """Parse config from a string.  Useful for testing or inline config."""
        self._parse_lines(text.splitlines(), source)
        return self

    def get(self, key: str, default=None):
        """Access a value by dotted path, e.g. ``cfg.get('database.host')``.

        The key is looked up as ``section.key``.  If the key contains no dot
        it is looked up under the global (empty section) scope first, then
        under any single section.
        """
        raw = self._resolve_key(key)
        if raw is None:
            return default
        return self._coerce(raw)

    def getraw(self, key: str, default=None):
        """Return the raw string for *key*, without type coercion."""
        raw = self._resolve_key(key)
        return raw if raw is not None else default

    def items(self, section: str = "") -> list:
        """Return all ``(key, coerced_value)`` pairs under *section*."""
        prefix = f"{section}." if section else ""
        result = []
        for flat_key, raw in self._data.items():
            if flat_key.startswith(prefix):
                local_key = flat_key[len(prefix):]
                result.append((local_key, self._coerce(raw)))
        return result

    @property
    def errors(self) -> list:
        """List of ``(line_number, line, reason)`` tuples for malformed lines."""
        return list(self._errors)

    def sections(self) -> list:
        """Return the list of section names (including the global section as '')."""
        seen = set()
        seen.add("")
        for key in self._data:
            parts = key.split(".", 1)
            if len(parts) == 2:
                seen.add(parts[0])
        return sorted(seen, key=lambda s: (s == "", s))

    def as_dict(self) -> dict:
        """Return a nested dictionary view of the parsed config."""
        nested: dict = {}
        for flat_key, raw in self._data.items():
            raw_val = self._coerce(raw)
            parts = flat_key.split(".")
            target = nested
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = raw_val
        return nested

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_one(self, path: str):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except FileNotFoundError:
            logger.warning("Config file not found, skipping: %s", path)
            return
        self._parse_lines([l.rstrip("\n") for l in lines], path)

    def _parse_lines(self, lines: list, source: str):
        for lineno, raw_line in enumerate(lines, start=1):
            line = raw_line.strip()

            # blank / comment
            if not line or line.startswith("#"):
                continue

            # section header
            m = re.match(r"^\[(.+)\]$", line)
            if m:
                self._section = m.group(1).strip()
                continue

            # key = value  (may contain '=' in the value)
            eq_pos = line.find("=")
            if eq_pos == -1:
                msg = f"Malformed line (no '=' found): {raw_line!r}"
                logger.warning("%s:%d -- %s", source, lineno, msg)
                self._errors.append((lineno, raw_line, msg))
                continue

            key = line[:eq_pos].strip()
            value = line[eq_pos + 1:].strip()

            if not key:
                msg = f"Empty key on line: {raw_line!r}"
                logger.warning("%s:%d -- %s", source, lineno, msg)
                self._errors.append((lineno, raw_line, msg))
                continue

            # strip inline comment  (respect escaped hashes)
            value = self._strip_inline_comment(value)

            # environment variable expansion
            value = self._expand_env(value)

            # flat storage key
            flat_key = f"{self._section}.{key}" if self._section else key

            # merge semantics: later values override
            self._data[flat_key] = value

    @staticmethod
    def _strip_inline_comment(value: str) -> str:
        """Remove an inline comment (``# ...``) that is not escaped (``\#``)."""
        result = []
        i = 0
        while i < len(value):
            if value[i] == "\\" and i + 1 < len(value) and value[i + 1] == "#":
                result.append("#")
                i += 2
                continue
            if value[i] == "#":
                break  # inline comment starts here
            result.append(value[i])
            i += 1
        return "".join(result).rstrip()

    @staticmethod
    def _expand_env(value: str) -> str:
        """Expand ``$VAR`` and ``${VAR}`` placeholders using the current
        environment.  Unset variables expand to an empty string.
        """

        def _replacer(m: re.Match) -> str:
            name = m.group(1) or m.group(2) or ""
            return os.environ.get(name, "")

        pattern = r"\$([A-Za-z_][A-Za-z0-9_]*|\{([A-Za-z_][A-Za-z0-9_]*)\})"
        return re.sub(pattern, _replacer, value)

    def _resolve_key(self, key: str):
        """Look up *key* in order:
        1. fully qualified ``section.key``
        2. under the first/only section if key has no dot
        3. global scope (no section)
        """
        # exact match
        if key in self._data:
            return self._data[key]

        # dotted key given -> nothing else to try
        if "." in key:
            return None

        # no dot: try global scope, then any single section
        if key in self._data:
            return self._data[key]

        sections = [k for k in self._data if k.startswith(f"{self._section}.")]
        # Try the current section first, then any section
        candidates = []
        if self._section:
            candidates.append(f"{self._section}.{key}")
        # also try global
        candidates.append(key)
        for cand in candidates:
            if cand in self._data:
                return self._data[cand]
        return None

    @staticmethod
    def _coerce(raw: str):
        """Auto-detect type: bool -> int -> float -> str."""

        # quoted strings -> str (no further coercion)
        if (raw.startswith('"') and raw.endswith('"')) or \
           (raw.startswith("'") and raw.endswith("'")):
            return raw[1:-1]

        # boolean
        low = raw.lower()
        if low in ("true", "yes", "on"):
            return True
        if low in ("false", "no", "off"):
            return False

        # integer
        try:
            return int(raw)
        except ValueError:
            pass

        # float
        try:
            return float(raw)
        except ValueError:
            pass

        # fallback: plain string
        return raw
