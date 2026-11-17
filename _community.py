"""Themes from other creators: which installed plugin a Desktop theme came from, and who made it.

The Desktop half knows every theme Hermes Desktop has (``useTheme().availableThemes``) but not which
plugin registered it, so it sends the names it does not recognise here. This module reads the
installed plugins of the active profile (``<hermes home>/plugins``) and answers, per theme name, with
the plugin, its author (the manifest's ``author``, else the owner of the repo it was installed from),
its repo URL and a picture (the creator's own catalog banner or README image), so the gallery can
show the theme under its creator's name.

Read only, local only: nothing is written, nothing leaves the machine, and only files inside each
plugin's own folder are opened (a manifest, the Desktop half's script, one image).
"""
from __future__ import annotations

import base64
import json
import re
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

SELF = "aether"
MAX_NAMES = 80
MAX_NAME_LEN = 120
MAX_SCRIPT_BYTES = 4 * 1024 * 1024
MAX_IMAGE_BYTES = 3 * 1024 * 1024
_IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
                ".gif": "image/gif"}
# Where creators usually keep the picture the catalog or the README shows first.
_IMAGE_SPOTS = ("assets/catalog-banner", "assets/catalog-cover", "docs/catalog-cover", "docs/catalog-banner",
                "catalog-cover", "catalog-banner", "media/banner", "assets/banner", "docs/banner", "banner",
                "assets/cover", "docs/cover", "media/cover", "cover")
_README_IMAGE = re.compile(r"""!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.I)
_THEMES_HINT = re.compile(r"\bTHEMES_AREA\b|\barea\s*:\s*['\"]themes['\"]")
_GITHUB_OWNER = re.compile(r"github\.com[:/]+([A-Za-z0-9][A-Za-z0-9-]*)/", re.I)
_ACCENT = re.compile(r"^(.+)-accent-[0-9a-f]{6}$")

_lock = threading.Lock()
_cache: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}  # plugin dir -> (mtime, info)


def _home() -> Path:
    from hermes_constants import get_hermes_home

    return get_hermes_home()


def _read_text(path: Path, limit: int) -> str:
    try:
        if not path.is_file() or path.stat().st_size > limit:
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _manifest(folder: Path) -> Dict[str, Any]:
    text = _read_text(folder / "plugin.yaml", 256 * 1024) or _read_text(folder / "plugin.yml", 256 * 1024)
    if not text:
        return {}
    # Hermes's own reader (public plugin API); PyYAML is not guaranteed in a Hermes install.
    from hermes_yaml import safe_load

    try:
        data = safe_load(text)
    except Exception:  # another creator's malformed manifest: skip that plugin, not the gallery
        return {}
    return data if isinstance(data, dict) else {}


def _install_sources(plugins: Path) -> Dict[str, str]:
    """``name -> source URL`` from the installer's own record (``plugins/.install-metadata.json``)."""
    try:
        data = json.loads(_read_text(plugins / ".install-metadata.json", 1024 * 1024) or "{}")
    except ValueError:
        return {}
    out: Dict[str, str] = {}
    if isinstance(data, dict):
        for name, row in data.items():
            if isinstance(row, dict) and isinstance(row.get("source"), str):
                out[str(name)] = row["source"]
    return out


def _git_remote(folder: Path) -> str:
    text = _read_text(folder / ".git" / "config", 64 * 1024)
    match = re.search(r'\[remote "origin"\][^\[]*?url\s*=\s*(\S+)', text)
    return match.group(1) if match else ""


def _repo_url(source: str) -> str:
    url = (source or "").strip()
    if url.startswith("git@github.com:"):
        url = "https://github.com/" + url[len("git@github.com:"):]
    if url.endswith(".git"):
        url = url[:-4]
    return url if url.startswith("https://") else ""


def _inside(folder: Path, candidate: Path) -> Optional[Path]:
    try:
        resolved = candidate.resolve()
        resolved.relative_to(folder.resolve())
    except (OSError, ValueError):
        return None
    return resolved if resolved.is_file() else None


def _image_file(folder: Path) -> Optional[Path]:
    for stem in _IMAGE_SPOTS:
        for ext in _IMAGE_TYPES:
            found = _inside(folder, folder / f"{stem}{ext}")
            if found:
                return found
    readme = _read_text(folder / "README.md", 512 * 1024)
    for match in _README_IMAGE.finditer(readme):
        ref = (match.group(1) or match.group(2) or "").split("#")[0].split("?")[0]
        if not ref or "://" in ref or ref.startswith(("data:", "/")):
            continue
        if Path(ref).suffix.lower() in _IMAGE_TYPES:
            found = _inside(folder, folder / ref)
            if found:
                return found
    return None


def _data_url(path: Optional[Path]) -> str:
    if path is None:
        return ""
    try:
        if path.stat().st_size > MAX_IMAGE_BYTES:
            return ""
        raw = path.read_bytes()
    except OSError:
        return ""
    return f"data:{_IMAGE_TYPES[path.suffix.lower()]};base64,{base64.b64encode(raw).decode('ascii')}"


def _scripts(folder: Path) -> Iterable[Path]:
    desktop = folder / "desktop"
    if not desktop.is_dir():
        return []
    return sorted(p for p in desktop.iterdir() if p.suffix in (".js", ".mjs") and p.is_file())


def _plugin_info(folder: Path, sources: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """What the gallery shows for one installed plugin with a Desktop half that registers themes."""
    script = ""
    for path in _scripts(folder):
        script += _read_text(path, MAX_SCRIPT_BYTES) + "\n"
    if not _THEMES_HINT.search(script):
        return None
    manifest = _manifest(folder)
    name = str(manifest.get("name") or folder.name)
    repo = _repo_url(sources.get(folder.name) or sources.get(name) or _git_remote(folder))
    author = manifest.get("author") or manifest.get("maintainer") or ""
    if isinstance(author, dict):
        author = author.get("name") or ""
    if not author and repo:
        owner = _GITHUB_OWNER.search(repo)
        author = owner.group(1) if owner else ""
    return {
        "id": folder.name,
        "name": name,
        "title": str(manifest.get("title") or ""),
        "author": str(author).strip()[:80],
        "version": str(manifest.get("version") or ""),
        "repo": repo,
        "image": _data_url(_image_file(folder)),
        "_script": script,
    }


def _mtime(folder: Path) -> float:
    stamps = [folder.stat().st_mtime]
    for path in (folder / "plugin.yaml", *_scripts(folder)):
        try:
            stamps.append(path.stat().st_mtime)
        except OSError:
            pass
    return max(stamps)


def theme_plugins() -> List[Dict[str, Any]]:
    """Every installed plugin (this profile) whose Desktop half registers themes, Aether excluded."""
    plugins = _home() / "plugins"
    if not plugins.is_dir():
        return []
    sources = _install_sources(plugins)
    found: List[Dict[str, Any]] = []
    with _lock:
        for folder in sorted(plugins.iterdir()):
            if not folder.is_dir() or folder.name.startswith(".") or folder.name == SELF:
                continue
            try:
                stamp = _mtime(folder)
            except OSError:
                continue
            key = str(folder)
            cached = _cache.get(key)
            if cached is None or cached[0] != stamp:
                cached = (stamp, _plugin_info(folder, sources))
                _cache[key] = cached
            if cached[1]:
                found.append(cached[1])
    return found


def _cli_skins() -> set:
    """The profile's own CLI skins (``<hermes home>/skins/*.yaml``): themes, but nobody's plugin."""
    try:
        return {p.stem for p in (_home() / "skins").glob("*.y*ml")}
    except OSError:
        return set()


def _quoted(name: str, script: str) -> bool:
    return any(f"{q}{name}{q}" in script for q in ("'", '"', "`"))


def attribute(names: Any) -> Dict[str, Any]:
    """``{themes: {theme name: plugin id}, plugins: {plugin id: info}}`` for the names a plugin registers.

    A theme belongs to a plugin when its name appears as a string in that plugin's Desktop script; a
    saved accent (``<base>-accent-<hex>``) belongs to its base's plugin. Names that match no installed
    plugin (Hermes's own themes, CLI skins, imported themes) are left out."""
    wanted: List[str] = []
    for raw in names if isinstance(names, list) else []:
        name = str(raw or "").strip()
        if name and len(name) <= MAX_NAME_LEN and name not in wanted:
            wanted.append(name)
        if len(wanted) >= MAX_NAMES:
            break
    if not wanted:
        return {"themes": {}, "plugins": {}}
    plugins = theme_plugins()
    skins = _cli_skins()
    themes: Dict[str, str] = {}
    used: Dict[str, Dict[str, Any]] = {}
    for name in wanted:
        accent = _ACCENT.match(name)
        base = accent.group(1) if accent else name
        if base in skins:
            continue
        owners = [p for p in plugins if _quoted(base, p["_script"])]
        if len(owners) > 1:  # the plugin named after the theme wins a tie (hermes-borealis for borealis)
            named = [p for p in owners if base in p["id"] or base in p["name"]]
            owners = named or owners
        if owners:
            owner = owners[0]
            themes[name] = owner["id"]
            used[owner["id"]] = {k: v for k, v in owner.items() if not k.startswith("_")}
    return {"themes": themes, "plugins": used}
