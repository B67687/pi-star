import os
import re
import logging
from typing import Any, Dict, Iterator, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Sentinel for the unnamed default section (keys before any [SECTION] header).
_DEFAULT = object()


class ConfigParser:
    """Parses a custom KEY=VALUE config format with [SECTION] headers.

    Features
    --------
    * KEY=VALUE and [SECTION] headers
    * ``#`` comments and blank lines are ignored
    * Dot-notation access: ``config.get('section.key')``
    * Automatic type coercion: ``true``/``false`` → bool,
      numeric strings → int or float, everything else stays str
    * ``$VAR`` and ``${VAR}`` expanded from the environment at parse time
    * Multi-file merging: later files override earlier keys
    * Malformed lines are logged instead of raising exceptions
    """

    # -- Sentinel for keys without an explicit section ------------------------
    _DEFAULT = _DEFAULT

    # Boxed booleans ----------------------------------------------------------
    _BOOL_TABLE: Dict[str, bool] = {'true': True, 'false': False}

    # ------------------------------------------------------------------
    def __init__(self) -> None:
        self._data: Dict[object, Dict[str, Any]] = {_DEFAULT: {}}

    # -- value processing ----------------------------------------------------

    @staticmethod
    def _coerce_value(raw: str) -> Any:
        """Auto-detect *bool*, *int*, *float*; fall back to *str*."""
        stripped = raw.strip()
        low = stripped.lower()

        # Boolean
        if low in ConfigParser._BOOL_TABLE:
            return ConfigParser._BOOL_TABLE[low]

        # Integer
        try:
            return int(stripped)
        except ValueError:
            pass

        # Float
        try:
            return float(stripped)
        except ValueError:
            pass

        # Plain string
        return stripped

    @staticmethod
    def _expand_env_vars(value: str) -> str:
        """Expand ``$VAR`` and ``${VAR}`` references from ``os.environ``.

        ``$$`` is treated as a literal ``$``.
        Undefined variables expand to an empty string.
        """
        if '$' not in value:
            return value

        # Protect escaped dollar signs
        cooked = value.replace('$$', '\x00')

        # ${NAME}
        cooked = re.sub(
            r'\$\{([^}]+)\}',
            lambda m: os.environ.get(m.group(1), ''),
            cooked,
        )

        # $NAME  (word characters only)
        cooked = re.sub(
            r'\$([A-Za-z_][A-Za-z0-9_]*)',
            lambda m: os.environ.get(m.group(1), ''),
            cooked,
        )

        # Restore literal $
        return cooked.replace('\x00', '$')

    # -- line parsing --------------------------------------------------------

    def _parse_line(self, line: str, current_section: object) -> object:
        """Parse a single line, returning the (possibly updated) section."""
        stripped = line.strip()

        # Blank / comment
        if not stripped or stripped.startswith('#'):
            return current_section

        # Section header  [NAME]
        m = re.match(r'^\[([^\]]+)\]$', stripped)
        if m:
            name = m.group(1).strip()
            if name not in self._data:
                self._data[name] = {}
            return name

        # Key = Value
        if '=' in stripped:
            key, _, raw_val = stripped.partition('=')
            key = key.strip()
            if not key:
                logger.warning("Skipping entry with empty key: %r", stripped)
                return current_section

            raw_val = raw_val.strip()
            try:
                val = self._expand_env_vars(raw_val)
                val = self._coerce_value(val)
            except Exception:
                logger.warning("Value processing failed for key %r; keeping raw", key)
                val = raw_val

            # Ensure section dict exists (handles default section + dynamic)
            if current_section not in self._data:
                self._data[current_section] = {}
            self._data[current_section][key] = val
            return current_section

        # Unrecognised line
        logger.warning("Skipping malformed line (no '=' and not a section): %r", stripped)
        return current_section

    # -- loading -------------------------------------------------------------

    def loads(self, text: str) -> 'ConfigParser':
        """Parse configuration from a string, merging into existing data."""
        current: object = _DEFAULT
        for lineno, line in enumerate(text.splitlines(), 1):
            try:
                current = self._parse_line(line, current)
            except Exception:
                logger.error("Unexpected error on line %d: %r", lineno, line, exc_info=True)
        return self

    def load(self, filepath: str) -> 'ConfigParser':
        """Parse configuration from a file, merging into existing data.

        Returns *self* for chaining.
        """
        try:
            with open(filepath, 'r', encoding='utf-8') as fh:
                self.loads(fh.read())
        except FileNotFoundError:
            logger.error("Config file not found: %s", filepath)
        except OSError as exc:
            logger.error("Could not read config file %s: %s", filepath, exc)
        except Exception:
            logger.error("Unexpected error loading %s", filepath, exc_info=True)
        return self

    def load_files(self, *filepaths: str) -> 'ConfigParser':
        """Load multiple files in order; later files override earlier keys.

        Returns *self* for chaining.
        """
        for fp in filepaths:
            self.load(fp)
        return self

    # -- access --------------------------------------------------------------

    def get(self, key: str, default: Any = None) -> Any:
        """Retrieve a value using dot notation: ``section.key``.

        If *key* contains no dot, it is looked up in the **default**
        section (keys that appear before any ``[SECTION]`` header).
        """
        if '.' in key:
            section, _, sub = key.partition('.')
        else:
            section = _DEFAULT
            sub = key

        section_data = self._data.get(section)
        if section_data is None:
            return default
        return section_data.get(sub, default)

    def get_section(self, section: str) -> Dict[str, Any]:
        """Return a (shallow) copy of every key-value pair in *section*."""
        return dict(self._data.get(section, {}))

    def sections(self) -> List[str]:
        """Return the names of all non-default sections."""
        return [k for k in self._data if k is not _DEFAULT and isinstance(k, str)]

    def all_sections(self, include_default: bool = False) -> List[str]:
        """Return every section name.

        When *include_default* is ``True`` the default section is listed
        as an empty string.
        """
        names: List[str] = []
        for k in self._data:
            if k is _DEFAULT:
                if include_default:
                    names.append('')
            else:
                names.append(k)  # type: ignore[arg-type]
        return names

    def has(self, key: str) -> bool:
        """Return ``True`` if *key* exists (dot-notation aware)."""
        if '.' in key:
            section, _, sub = key.partition('.')
        else:
            section = _DEFAULT
            sub = key
        section_data = self._data.get(section)
        return section_data is not None and sub in section_data

    def keys(self, section: Optional[str] = None) -> List[str]:
        """Return keys in *section* (or the default section if ``None``)."""
        target = section if section is not None else _DEFAULT
        return list(self._data.get(target, {}).keys())

    # -- dict-like sugar -----------------------------------------------------

    def __getitem__(self, key: str) -> Any:
        val = self.get(key, _MISSING)
        if val is _MISSING:
            raise KeyError(key)
        return val

    def __setitem__(self, key: str, value: Any) -> None:
        """Programmatic set using dot notation: ``cfg['db.host'] = 'x'``."""
        if '.' in key:
            section, _, sub = key.partition('.')
        else:
            section = _DEFAULT
            sub = key
        if section not in self._data:
            self._data[section] = {}
        self._data[section][sub] = value

    def __delitem__(self, key: str) -> None:
        if '.' in key:
            section, _, sub = key.partition('.')
        else:
            section = _DEFAULT
            sub = key
        section_data = self._data.get(section)
        if section_data is None or sub not in section_data:
            raise KeyError(key)
        del section_data[sub]

    def __contains__(self, key: str) -> bool:
        return self.has(key)

    def __len__(self) -> int:
        return sum(len(d) for d in self._data.values())

    def __iter__(self) -> Iterator[str]:
        """Yield every ``section.key`` string."""
        for section, pairs in self._data.items():
            prefix = '' if section is _DEFAULT else f'{section}.'
            for k in pairs:
                yield f'{prefix}{k}'

    def __repr__(self) -> str:
        secs = self.sections()
        count = len(self)
        return f'<ConfigParser sections={secs!r} keys={count}>'

    def __str__(self) -> str:
        """Render back to the config format."""
        lines: List[str] = []

        # Default section first
        default = self._data.get(_DEFAULT, {})
        if default:
            for k, v in default.items():
                lines.append(f'{k}={v}')
            lines.append('')

        # Named sections
        for name in sorted(k for k in self._data if k is not _DEFAULT and isinstance(k, str)):
            lines.append(f'[{name}]')
            for k, v in self._data[name].items():
                lines.append(f'{k}={v}')
            lines.append('')

        return '\n'.join(lines).rstrip('\n')


# Sentinel for missing values in __getitem__
_MISSING = object()


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------

def load_config(*filepaths: str) -> ConfigParser:
    """Create a new ``ConfigParser`` and load every *filepath* in order."""
    cp = ConfigParser()
    cp.load_files(*filepaths)
    return cp
