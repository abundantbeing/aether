"""Every test runs against a throwaway HERMES_HOME, so ~/.hermes is never touched.

The plugin's pure modules are imported as the package ``aether_plugin`` straight from the repo root,
the way Hermes's loader binds siblings (``from ._spec import ...``). The end-to-end tests load the
real plugin through Hermes's own discovery instead; they need hermes-agent importable and are
skipped when it is not.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_package():
    if "aether_plugin" in sys.modules:
        return sys.modules["aether_plugin"]
    spec = importlib.util.spec_from_file_location(
        "aether_plugin", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules["aether_plugin"] = module
    for name in ("_svg", "_color", "_palette", "_spec", "_presets"):
        sub = importlib.util.spec_from_file_location(f"aether_plugin.{name}", ROOT / f"{name}.py")
        mod = importlib.util.module_from_spec(sub)
        sys.modules[f"aether_plugin.{name}"] = mod
        sub.loader.exec_module(mod)
    return module


_load_package()


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    return tmp_path


def hermes_available() -> bool:
    try:
        import hermes_cli.plugins  # noqa: F401
    except Exception:
        return False
    return True
