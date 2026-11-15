"""Saved themes for the active profile, in ``<hermes home>/plugin-data/aether/themes.json``.

The file holds the custom themes the agent made (presets ship with the plugin and are never written
here) and one ``pending`` slot: a theme that was made while no Desktop window was viewing the chat,
which the next Desktop to sync applies once and acknowledges.
"""
from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

PLUGIN_ID = "aether"
FILE_NAME = "themes.json"
MAX_SAVED = 60
_SCHEMA = 1
_lock = threading.RLock()


def _path() -> Path:
    # Resolved on every call: plugin_data_dir follows the active profile, and one gateway process
    # serves several profiles, so a cached path would write one profile's themes into another's home.
    from plugins.plugin_storage import plugin_data_dir

    return plugin_data_dir(PLUGIN_ID) / FILE_NAME


def _read() -> Dict[str, Any]:
    from utils import read_json_or_empty

    data = read_json_or_empty(_path())
    if not isinstance(data, dict) or data.get("schema") != _SCHEMA:
        data = {}
    themes = data.get("themes")
    return {
        "schema": _SCHEMA,
        "themes": themes if isinstance(themes, dict) else {},
        "pending": data.get("pending") if isinstance(data.get("pending"), dict) else None,
    }


def _write(data: Dict[str, Any]) -> None:
    from utils import atomic_json_write

    atomic_json_write(_path(), data)


def list_themes() -> List[Dict[str, Any]]:
    with _lock:
        themes = list(_read()["themes"].values())
    return sorted(themes, key=lambda r: r.get("updated_at", 0), reverse=True)


def get(slug: str) -> Optional[Dict[str, Any]]:
    with _lock:
        return _read()["themes"].get(slug)


def save(record: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or replace by slug. Replacing keeps the original ``created_at``."""
    with _lock:
        data = _read()
        themes = data["themes"]
        previous = themes.get(record["slug"])
        if previous is None and len(themes) >= MAX_SAVED:
            oldest = min(themes.values(), key=lambda r: r.get("updated_at", 0))
            themes.pop(oldest["slug"], None)
        if previous:
            record = {**record, "created_at": previous.get("created_at", record["created_at"])}
        stored = {k: v for k, v in record.items() if k != "adjustments"}
        themes[record["slug"]] = stored
        _write(data)
        return stored


def delete(slug: str) -> bool:
    with _lock:
        data = _read()
        removed = data["themes"].pop(slug, None) is not None
        if data["pending"] and data["pending"].get("slug") == slug:
            data["pending"] = None
        if removed:
            _write(data)
        return removed


def set_pending(action: str, slug: Optional[str] = None) -> Dict[str, Any]:
    """Remember an apply (``slug``) or ``off`` for the next Desktop that syncs."""
    pending = {"id": uuid.uuid4().hex[:12], "action": action, "slug": slug, "at": time.time()}
    with _lock:
        data = _read()
        data["pending"] = pending
        _write(data)
    return pending


def clear_pending(pending_id: str) -> bool:
    with _lock:
        data = _read()
        if not data["pending"] or data["pending"].get("id") != pending_id:
            return False
        data["pending"] = None
        _write(data)
        return True


def pending() -> Optional[Dict[str, Any]]:
    with _lock:
        return _read()["pending"]
