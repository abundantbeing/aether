"""End to end through Hermes's real plugin discovery, against a throwaway HERMES_HOME.

The plugin folder is copied into ``<home>/plugins/aether``, enabled in config.yaml, and loaded by
``PluginManager.discover_and_load()``: the same path ``hermes`` and the gateway take. The tests then
drive the registered tool, slash command and RPC methods the way the agent and Desktop do.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from conftest import ROOT, hermes_available

pytestmark = pytest.mark.skipif(not hermes_available(), reason="needs hermes-agent importable")

SPEC = {
    "name": "Sunset Dither",
    "background": "#120a24",
    "accent": "#ff7a59",
    "scene": {"engine": "horizon", "colors": ["#120a24", "#4a1b5c", "#d9426b", "#ff9b45", "#ffe08a"]},
    "finish": {"style": "dither", "pixel": 3},
}


@pytest.fixture
def manager(home, monkeypatch):
    from hermes_cli import plugins_manifest
    from hermes_cli.plugins import PluginManager

    # A main checkout describes itself from the last tag on its own line (0.22.x) even though it
    # carries the 0.23.1 APIs this plugin needs; run the load as the release it declares.
    monkeypatch.setattr(plugins_manifest, "running_hermes_version", lambda: "0.23.1")
    target = home / "plugins" / "aether"
    shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns(
        ".git", "node_modules", "tests", "desktop-src", "docs", "__pycache__", "*.pyc"))
    (home / "config.yaml").write_text(json.dumps({"plugins": {"enabled": ["aether"]}}))  # JSON is YAML
    mgr = PluginManager()
    mgr.discover_and_load()
    state = mgr._plugins.get("aether")
    assert state is not None and state.enabled and not state.error, getattr(state, "error", "not discovered")
    return mgr


def _tool(manager, name):
    from tools.registry import registry

    entry = registry.get_entry(name, scope=manager.scope_key)
    assert entry is not None, f"{name} not registered"
    return entry.handler


def test_registers_tools_command_rpc_and_skill(manager):
    _tool(manager, "aether_theme")
    _tool(manager, "aether_gallery")
    assert "aether" in manager._plugin_commands
    assert {"plugin.aether.state", "plugin.aether.ack", "plugin.aether.delete",
            "plugin.aether.community"} <= set(manager._plugin_rpc_methods)
    assert manager.list_plugin_skills("aether") == ["theme-design"]


def test_a_theme_made_with_no_viewer_waits_for_desktop_once(manager, home):
    result = json.loads(_tool(manager, "aether_theme")(dict(SPEC), session_id=""))
    assert result["ok"] and result["status"] == "pending"
    assert result["slug"] == "aether-sunset-dither"
    saved = json.loads((home / "plugin-data" / "aether" / "themes.json").read_text())
    assert "aether-sunset-dither" in saved["themes"]

    state = manager._plugin_rpc_methods["plugin.aether.state"]({}, session_id=None)
    assert [t["slug"] for t in state["themes"]] == ["aether-sunset-dither"]
    pending = state["pending"]
    assert pending["action"] == "apply" and pending["slug"] == "aether-sunset-dither"

    assert manager._plugin_rpc_methods["plugin.aether.ack"]({"id": pending["id"]}, session_id=None)["ok"]
    assert manager._plugin_rpc_methods["plugin.aether.state"]({}, session_id=None)["pending"] is None


def test_a_viewed_chat_gets_the_theme_live_as_a_session_event(manager, monkeypatch):
    from hermes_cli import plugin_rpc

    sent = []
    monkeypatch.setattr(plugin_rpc, "emit_plugin_session_event",
                        lambda plugin_id, session_id, event, payload: sent.append((plugin_id, session_id, event, payload)) or True)
    result = json.loads(_tool(manager, "aether_theme")(dict(SPEC), session_id="local-123"))
    assert result["status"] == "live"
    assert "::aether-theme{name=\"aether-sunset-dither\"}" in result["preview_card"]
    plugin_id, session_id, event, payload = sent[0]
    assert (plugin_id, session_id, event, payload["action"]) == ("aether", "local-123", "theme", "apply")
    theme = payload["record"]["theme"]
    assert theme["name"] == "aether-sunset-dither" and theme["colors"] == theme["darkColors"]
    assert manager._plugin_rpc_methods["plugin.aether.state"]({}, session_id=None)["pending"] is None


def test_bad_spec_is_refused_with_the_field_and_nothing_is_saved(manager, home):
    result = json.loads(_tool(manager, "aether_theme")({"name": "x", "background": "navy", "accent": "#fff"}, session_id=""))
    assert not result["ok"] and "background" in result["error"]
    assert not (home / "plugin-data" / "aether" / "themes.json").exists()


def test_gallery_applies_a_preset_by_label_and_lists_saved_themes(manager, monkeypatch):
    from hermes_cli import plugin_rpc

    sent = []
    monkeypatch.setattr(plugin_rpc, "emit_plugin_session_event", lambda *a: sent.append(a) or True)
    gallery = _tool(manager, "aether_gallery")
    applied = json.loads(gallery({"action": "apply", "name": "event horizon"}, session_id="s1"))
    assert applied["ok"] and applied["status"] == "live" and applied["theme"] == "Event Horizon"
    assert sent[-1][3]["record"]["slug"] == "aether-event-horizon"

    _tool(manager, "aether_theme")(dict(SPEC), session_id="s1")
    listed = json.loads(gallery({"action": "list"}, session_id="s1"))["themes"]
    kinds = {t["slug"]: t["kind"] for t in listed}
    assert kinds["aether-sunset-dither"] == "saved" and kinds["aether-helios"] == "preset"
    assert not json.loads(gallery({"action": "delete", "name": "Helios"}, session_id="s1"))["ok"]
    assert json.loads(gallery({"action": "delete", "name": "Sunset Dither"}, session_id="s1"))["ok"]


def test_slash_command_lists_and_applies(manager, monkeypatch):
    from hermes_cli import plugin_rpc

    sent = []
    monkeypatch.setattr(plugin_rpc, "emit_plugin_session_event", lambda *a: sent.append(a) or True)
    handler = manager._plugin_commands["aether"]["handler"]
    assert "Cyanotype" in handler("list")
    assert handler("phosphor", session_id="s9").startswith("Aether: Phosphor.")
    assert sent[-1][1] == "s9" and sent[-1][3]["record"]["slug"] == "aether-phosphor"
    assert "Usage" in handler("") or sent  # no picker outside a live session: usage text, never a hang


def test_themes_are_kept_per_profile(manager, home, tmp_path, monkeypatch):
    _tool(manager, "aether_theme")(dict(SPEC), session_id="")
    other = tmp_path / "other-profile"
    other.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(other))
    assert manager._plugin_rpc_methods["plugin.aether.state"]({}, session_id=None)["themes"] == []
    assert not (Path(other) / "plugin-data" / "aether" / "themes.json").exists()


def test_desktop_half_passes_catalog_admission_with_no_review_cues():
    """Catalog rule 8, as `hermes plugins validate` checks it: no refusals, and no review cues
    either (the backdrop finds the app shell through the documented window-glass hook alone)."""
    from hermes_cli.plugin_validate_desktop import desktop_review_findings, desktop_surface_hits

    assert desktop_surface_hits(ROOT) == []
    assert desktop_surface_hits(ROOT, desktop_review_findings) == []
