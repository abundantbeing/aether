"""The editor's finish picker, through the same preview/save RPC as its colours.

The contract: any finish goes on any preset or saved theme; picking one changes only the finish (the
scene, its colours and the palette stay the base's); a new style starts from its own cell size and
pattern, as it does when asked for in chat; and every finish on every preset still meets the
readability floor, because the glass is measured again for the finish chosen.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from aether_plugin._color import contrast, over
from aether_plugin._presets import preset_records
from aether_plugin._spec import FINISH_PIXEL, FINISHES, SECONDARY_FLOOR
from aether_plugin._spec import ramp as scene_ramp
from conftest import hermes_available
from test_plugin_e2e import manager  # noqa: F401  (pytest fixture)

PRESETS = {r["label"]: r for r in preset_records()}

needs_hermes = pytest.mark.skipif(not hermes_available(), reason="needs hermes-agent importable")


def _rpc(manager, name, params):
    return manager._plugin_rpc_methods[f"plugin.aether.{name}"](params, session_id=None)


def _themes_file(home: Path) -> Path:
    return home / "plugin-data" / "aether" / "themes.json"


def _readable(record) -> bool:
    colors, scene = record["theme"]["colors"], record["scene"]
    reach = 1.0 if scene["finish"]["style"] in ("halftone", "ascii", "braille", "glitch") else scene["intensity"]
    brightest = scene_ramp(scene["colors"], reach)
    return (contrast(colors["foreground"], colors["background"]) >= 7.0
            and contrast(colors["primary"], colors["background"]) >= 3.0
            and contrast(colors["foreground"], over(colors["background"], brightest, scene["glass"]["tint"])) >= SECONDARY_FLOOR)


@needs_hermes
def test_picking_a_finish_changes_only_the_finish(manager, home):
    talaria = PRESETS["Talaria"]
    out = _rpc(manager, "preview", {"base": "aether-talaria", "finish": "halftone"})
    assert out["ok"], out
    record = out["record"]
    assert record["scene"]["finish"]["style"] == "halftone"
    assert record["scene"]["finish"]["pixel"] == FINISH_PIXEL["halftone"]
    assert record["scene"]["engine"] == talaria["scene"]["engine"]
    assert record["scene"]["colors"] == talaria["scene"]["colors"]
    assert record["theme"]["colors"] == talaria["theme"]["colors"]
    assert not _themes_file(home).exists()


@needs_hermes
def test_size_and_pattern_follow_the_pick_and_a_new_style_resets_them(manager):
    dither = _rpc(manager, "preview", {"base": "Selene", "finish": {"style": "dither", "pixel": 5, "pattern": "noise"}})
    assert dither["record"]["scene"]["finish"] | {"levels": 0} == {"style": "dither", "pixel": 5, "pattern": "noise", "levels": 0}

    # Olympus is dithered at 1px: switching to ascii must not keep a 1px cell.
    ascii_ = _rpc(manager, "preview", {"base": "Olympus", "finish": {"style": "ascii"}})
    assert ascii_["record"]["scene"]["finish"]["pixel"] == FINISH_PIXEL["ascii"]
    assert ascii_["record"]["scene"]["finish"]["pattern"] == "bayer4"


@needs_hermes
def test_an_unknown_finish_is_refused_in_words(manager, home):
    out = _rpc(manager, "save", {"base": "Selene", "finish": "watercolour"})
    assert not out["ok"] and "finish.style must be one of" in out["error"]
    assert not _themes_file(home).exists()


@needs_hermes
def test_saving_keeps_the_finish_and_reopening_updates_it_in_place(manager, home):
    first = _rpc(manager, "save", {"base": "Talaria", "label": "Talaria, halftone", "finish": "halftone"})
    assert first["ok"]
    slug = first["record"]["slug"]
    assert slug == "aether-talaria-halftone"
    themes = json.loads(_themes_file(home).read_text())["themes"]
    assert themes[slug]["scene"]["finish"]["style"] == "halftone"

    again = _rpc(manager, "save", {"base": slug, "finish": {"style": "halftone", "pixel": 10}})
    assert again["record"]["slug"] == slug
    themes = json.loads(_themes_file(home).read_text())["themes"]
    assert list(themes) == [slug] and themes[slug]["scene"]["finish"]["pixel"] == 10


@needs_hermes
def test_colours_and_finish_change_together(manager):
    out = _rpc(manager, "preview", {"base": "Selene", "accent": "#ffcd42", "finish": "braille"})
    assert out["record"]["theme"]["colors"]["primary"] == "#ffcd42"
    assert out["record"]["scene"]["finish"]["style"] == "braille"


@needs_hermes
@pytest.mark.parametrize("finish", list(FINISHES))
def test_every_finish_on_every_preset_meets_the_floor(manager, finish):
    for label, preset in PRESETS.items():
        out = _rpc(manager, "preview", {"base": preset["slug"], "finish": finish})
        assert out["ok"], (label, finish, out)
        assert _readable(out["record"]), (label, finish)
