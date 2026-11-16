#!/usr/bin/env python3
"""Read-only audit of the local n8n automation runtime.

Reports, without ever printing a secret value:
  * which config files define which keys, and whether a secret-shaped value
    sits on a well-formed ``KEY=VALUE`` line;
  * how many workflow/execution/settings rows in the n8n SQLite database
    contain each discovered secret (counts only);
  * how many n8n export JSON files contain each secret.

The script never writes to the database (opened with ``mode=ro``), never
issues network calls and never emits file contents.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

AUTOMATION_ROOT = Path(r"C:\NaijaDeals-Automation")
CONFIG_DIRS = [AUTOMATION_ROOT / "config"]
DB_PATH = AUTOMATION_ROOT / "n8n-data" / "database.sqlite"
EXPORT_GLOBS = [
    AUTOMATION_ROOT / "*.json",
    AUTOMATION_ROOT / "exports" / "*.json",
]

# A value counts as secret-shaped if it looks like a JWT, a long random token,
# or is stored under a key whose name says it is a credential.
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
SECRET_KEY_RE = re.compile(
    r"(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|ENCRYPTION[_-]?KEY)",
    re.IGNORECASE,
)
SAFE_KEYS = {
    "N8N_LISTEN_ADDRESS",
    "N8N_HOST",
    "N8N_PORT",
    "N8N_PROTOCOL",
    "N8N_BASE_URL",
    "DB_TYPE",
    "DB_SQLITE_DATABASE",
    "N8N_USER_FOLDER",
    "GENERIC_TIMEZONE",
    "N8N_DIAGNOSTICS_ENABLED",
    "N8N_PERSONALIZATION_ENABLED",
    "N8N_SECURE_COOKIE",
    "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS",
    "N8N_RUNNERS_ENABLED",
    "N8N_BLOCK_ENV_ACCESS_IN_NODE",
    "NODE_FUNCTION_ALLOW_BUILTIN",
    "NODE_FUNCTION_ALLOW_EXTERNAL",
}


def classify_line(line: str) -> tuple[str, str, str] | None:
    """Return (key, value, form) for a config line, or None."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if "=" in stripped:
        key, value = stripped.split("=", 1)
        return key.strip(), value, "key=value"
    if ":" in stripped:
        key, value = stripped.split(":", 1)
        return key.strip(), value, "key:value(malformed)"
    return None


def discover_secrets() -> dict[str, dict]:
    """Find secret-shaped values; return name -> metadata (value kept in memory)."""
    found: dict[str, dict] = {}
    for directory in CONFIG_DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.iterdir()):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".env", ".txt", ".json", ".key", ""}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for raw in text.splitlines():
                parsed = classify_line(raw)
                if parsed is None:
                    continue
                key, value, form = parsed
                value = value.strip().strip('"').strip("'")
                if not value:
                    continue
                jwt = JWT_RE.search(value)
                secret_named = bool(SECRET_KEY_RE.search(key)) and key not in SAFE_KEYS
                if not (jwt or secret_named):
                    continue
                label = key if key else "(unnamed)"
                entry = found.setdefault(
                    label,
                    {"value": value, "files": [], "forms": set(), "length": len(value)},
                )
                entry["files"].append(str(path))
                entry["forms"].add(form)
    return found


def scan_database(secrets: dict[str, dict]) -> list[dict]:
    if not DB_PATH.is_file():
        return [{"error": f"database missing: {DB_PATH}"}]
    uri = f"file:{DB_PATH.as_posix()}?mode=ro"
    results: list[dict] = []
    try:
        conn = sqlite3.connect(uri, uri=True, timeout=10)
    except sqlite3.Error as exc:
        return [{"error": f"open failed: {type(exc).__name__}"}]
    try:
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        ]
        text_tables = [
            t
            for t in tables
            if t in {
                "workflow_entity",
                "execution_data",
                "execution_entity",
                "settings",
                "credentials_entity",
                "shared_workflow",
                "webhook_entity",
            }
        ]
        for name, meta in secrets.items():
            value = meta["value"]
            per_table = {}
            for table in text_tables:
                cols = [
                    row[1]
                    for row in conn.execute(f'PRAGMA table_info("{table}")')
                ]
                text_cols = [c for c in cols if c not in ("id",)]
                total = 0
                for col in text_cols:
                    # instr() keeps the match exact: LIKE would treat _ and %
                    # in a JWT/token as wildcards and over-count.
                    sql = (
                        f'SELECT COUNT(*) FROM "{table}" '
                        f'WHERE instr(CAST("{col}" AS TEXT), ?) > 0'
                    )
                    try:
                        n = conn.execute(sql, (value,)).fetchone()[0]
                    except sqlite3.Error:
                        continue
                    total += int(n or 0)
                per_table[table] = total
            results.append(
                {"secret": name, "length": meta["length"], "occurrences": per_table}
            )
    finally:
        conn.close()
    return results


def scan_exports(secrets: dict[str, dict]) -> list[dict]:
    out = []
    for pattern in EXPORT_GLOBS:
        for path in sorted(pattern.parent.glob(pattern.name)):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            counts = {name: text.count(meta["value"]) for name, meta in secrets.items()}
            if any(counts.values()):
                out.append({"file": str(path), "matches": counts})
    return out


def main() -> int:
    secrets = discover_secrets()
    report = {
        "config_secrets": [
            {
                "name": name,
                "length": meta["length"],
                "files": meta["files"],
                "forms": sorted(meta["forms"]),
            }
            for name, meta in secrets.items()
        ],
        "database": scan_database(secrets),
        "exports": scan_exports(secrets),
    }
    # Non-secret runtime bindings, safe to print.
    bindings = {}
    for directory in CONFIG_DIRS:
        for path in sorted(directory.glob("*.env")):
            for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
                parsed = classify_line(raw)
                if not parsed:
                    continue
                key, value, form = parsed
                if key in SAFE_KEYS and form == "key=value":
                    bindings.setdefault(key, {})[path.name] = value.strip()
    report["bindings"] = bindings
    json.dump(report, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
