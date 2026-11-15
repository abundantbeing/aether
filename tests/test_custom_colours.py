"""Starting a theme from another one, and the colour editor's preview/save RPC.

The contract: a base carries over everything the call does not change; what the call gives wins; a
preview never writes; a save is per profile and updates in place under the same name; and a user's
colours are held to the same readability floor as the agent's, with the moves said in words.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from aether_plugin._base import plain, with_base
from aether_plugin._presets import preset_records
from aether_plugin._spec import SECONDARY_FLOOR, normalize
from aether_plugin._color import contrast, over
from aether_plugin._spec import ramp as scene_ramp
from conftest import hermes_available
from test_plugin_e2e import _tool, manager  # noqa: F401  (pytest fixture)

PRESETS = {r["label"]: r for r in preset_records()}
GOLD = ["#05070f", "#2a1c05", "#b98a1f", "#ffcd42", "#fff3c4"]

needs_hermes = pytest.mark.skipif(not hermes_available(), reason="needs hermes-agent importable")


def _rpc(manager, name, params):
    return manager._plugin_rpc_methods[f"plugin.aether.{name}"](params, session_id=None)


def _themes_file(home: Path) -> Path:
    return home / "plugin-data" / "aether" / "themes.json"


# ── base inheritance (pure) ─────────────────────────────────────────────────────────────────────


def test_a_base_carries_its_scene_finish_glass_and_speed():
    selene = PRESETS["Selene"]
    spec, _ = with_base({"name": "Selene Gold", "accent": "#ffcd42", "scene": {"colors": GOLD}}, selene)
    record = normalize(spec)
    assert record["scene"]["engine"] == selene["scene"]["engine"]
    assert record["scene"]["finish"] == selene["scene"]["finish"]
    assert record["scene"]["speed"] == selene["scene"]["speed"]
    assert record["scene"]["colors"] == GOLD
    assert record["description"] == selene["description"]


def test_what_the_call_gives_wins_over_the_base():
    folio = PRESETS["Folio"]
    spec, _ = with_base({"scene": {"speed": 0.2}, "finish": {"pixel": 5}, "glass": {"focus": 0.4}}, folio)
    record = normalize({**spec, "name": "Folio slow"})
    assert record["scene"]["speed"] == 0.2
    assert record["scene"]["finish"]["pixel"] == 5
    assert record["scene"]["finish"]["style"] == folio["scene"]["finish"]["style"]
    assert record["scene"]["glass"]["focus"] == 0.4


def test_a_new_finish_style_or_engine_starts_from_its_own_defaults():
    pocket = PRESETS["Pocket"]  # dither with a big cell and few levels
    spec, _ = with_base({"finish": "ascii", "scene": {"engine": "rain"}}, pocket)
    record = normalize({**spec, "name": "Pocket rain"})
    assert record["scene"]["finish"]["style"] == "ascii"
    assert record["scene"]["finish"]["pixel"] == 12 and record["scene"]["finish"]["levels"] == 0
    assert record["scene"]["engine"] == "rain"
    assert record["scene"]["speed"] == 0.9  # the rain engine's own pace, not Pocket's


def test_a_new_background_redraws_text_and_the_calm_end_of_the_scene():
    blue = PRESETS["Hermes Blue"]  # white text chosen for Nous blue
    spec, notes = with_base({"background": "#f2f2f2"}, blue)
    assert "foreground" not in spec
    assert spec["scene"]["colors"][0] == "#f2f2f2"
    record = normalize({**spec, "name": "Blue on paper"})
    colors = record["theme"]["colors"]
    assert record["appearance"] == "light"
    assert contrast(colors["foreground"], colors["background"]) >= 7.0
    assert len(notes) == 2


def test_the_editor_notes_read_as_sentences():
    notes = plain([
        "accent #0a0a12 -> #5b5b66 to reach 3:1 on the background",
        "glass.tint 0.59 -> 0.62 so text keeps 4.5:1 over the scene",
        "background #7e60ec -> #3d2a8a: too mid-tone for readable text, moved darker with its hue kept",
        "something new",
    ])
    assert notes[0] == "Accent lightened from #0a0a12 to #5b5b66 so it stays visible on the background (3:1)."
    assert notes[1].startswith("The glass over the scene is a little thicker (0.59 to 0.62)")
    assert notes[2].startswith("Background moved darker from #7e60ec to #3d2a8a")
    assert notes[3] == "Something new."


# ── through the real plugin ─────────────────────────────────────────────────────────────────────


@needs_hermes
def test_registers_the_colour_editor_rpc(manager):
    assert {"plugin.aether.preview", "plugin.aether.save"} <= set(manager._plugin_rpc_methods)


@needs_hermes
def test_the_tool_starts_from_a_preset_and_never_takes_its_name(manager, home):
    result = json.loads(_tool(manager, "aether_theme")(
        {"base": "Selene", "name": "Selene", "accent": "#ffcd42", "scene": {"colors": GOLD}}, session_id=""))
    assert result["ok"], result
    assert result["slug"] == "aether-selene-custom" and result["based_on"] == "aether-selene"
    assert any("is a preset" in note for note in result["adjustments"])
    saved = json.loads(_themes_file(home).read_text())["themes"]["aether-selene-custom"]
    assert saved["scene"]["engine"] == "moonsea" and saved["scene"]["colors"] == GOLD


@needs_hermes
def test_the_tool_needs_colours_or_a_base(manager, home):
    result = json.loads(_tool(manager, "aether_theme")({"name": "Nothing"}, session_id=""))
    assert not result["ok"] and "unless base" in result["error"]
    result = json.loads(_tool(manager, "aether_theme")({"name": "X", "base": "Atlantis"}, session_id=""))
    assert not result["ok"] and "no preset or saved theme called 'Atlantis'" in result["error"]
    assert not _themes_file(home).exists()


@needs_hermes
def test_preview_normalizes_like_a_save_and_writes_nothing(manager, home):
    out = _rpc(manager, "preview", {"base": "aether-selene", "accent": "#ffcd42", "scene_colors": GOLD})
    assert out["ok"] and out["record"]["label"] == "Selene (custom)"
    assert out["record"]["slug"] == "aether-selene-custom" and out["replaces"] is False
    assert out["record"]["theme"]["colors"]["primary"] == "#ffcd42"
    assert not _themes_file(home).exists()


@needs_hermes
def test_save_is_per_profile_and_the_same_name_updates_in_place(manager, home, tmp_path, monkeypatch):
    first = _rpc(manager, "save", {"base": "Selene", "accent": "#ffcd42", "scene_colors": GOLD})
    assert first["ok"] and first["record"]["source"] == "custom"
    assert first["record"]["based_on"] == "aether-selene"
    slug = first["record"]["slug"]

    # Editing the custom theme again (it is now the base) keeps its name and replaces it.
    again = _rpc(manager, "save", {"base": slug, "accent": "#ff9b45"})
    assert again["record"]["slug"] == slug
    themes = json.loads(_themes_file(home).read_text())["themes"]
    assert list(themes) == [slug] and themes[slug]["theme"]["colors"]["primary"] == "#ff9b45"
    assert themes[slug]["scene"]["colors"] == GOLD
    assert _rpc(manager, "preview", {"base": slug})["replaces"] is True

    other = tmp_path / "other-profile"
    other.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(other))
    assert _rpc(manager, "state", {})["themes"] == []


@needs_hermes
def test_a_users_low_contrast_colours_are_held_to_the_floor_and_said_in_words(manager):
    # Near-black accent on a near-black background, and a scene that climbs to pure white.
    out = _rpc(manager, "save", {"base": "Selene", "label": "Too dark", "background": "#05070f",
                                 "accent": "#0a0a12", "scene_colors": ["#05070f", "#ffffff"]})
    assert out["ok"]
    record = out["record"]
    colors, scene = record["theme"]["colors"], record["scene"]
    assert contrast(colors["primary"], colors["background"]) >= 3.0
    assert contrast(colors["foreground"], colors["background"]) >= 7.0
    reach = 1.0 if scene["finish"]["style"] in ("halftone", "ascii", "braille", "glitch") else scene["intensity"]
    brightest = scene_ramp(scene["colors"], reach)
    assert contrast(colors["foreground"], over(colors["background"], brightest, scene["glass"]["tint"])) >= SECONDARY_FLOOR
    assert any(n.startswith("Accent lightened from #0a0a12") for n in out["notes"])
    assert any("glass" in n for n in out["notes"])


@needs_hermes
def test_editor_errors_come_back_as_messages(manager, home):
    assert "base is required" in _rpc(manager, "preview", {})["error"]
    assert "scene.colors" in _rpc(manager, "save", {"base": "Selene", "scene_colors": ["#000000"]})["error"]
    assert "no preset or saved theme" in _rpc(manager, "save", {"base": "Atlantis"})["error"]
    assert not _themes_file(home).exists()
