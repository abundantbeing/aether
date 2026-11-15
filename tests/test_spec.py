"""Behaviour contracts for theme normalization: any spec the agent can send either becomes a
readable theme or is refused with a message naming the field to fix."""
from __future__ import annotations

import random

import pytest

from aether_plugin._color import contrast, over
from aether_plugin._presets import PRESET_SPECS, preset_records
from aether_plugin._spec import ENGINES, FINISHES, SCENE_TEXT_FLOOR, SpecError, normalize, ramp, slugify


def _worst_over_scene(record):
    colors, scene = record["theme"]["colors"], record["scene"]
    reach = 1.0 if scene["finish"]["style"] in ("halftone", "ascii", "braille", "glitch") else scene["intensity"]
    tint = scene["glass"]["tint"]
    return min(contrast(colors["foreground"], over(colors["background"], ramp(scene["colors"], reach * i / 40), tint))
               for i in range(41))


def _rand_hex(rng):
    return "#" + "".join(f"{rng.randrange(256):02x}" for _ in range(3))


@pytest.mark.parametrize("seed", range(300))
def test_any_seed_colours_yield_a_readable_theme(seed):
    rng = random.Random(seed)
    spec = {
        "name": f"Random {seed}",
        "background": _rand_hex(rng),
        "accent": _rand_hex(rng),
        "scene": {"engine": rng.choice(sorted(e for e in ENGINES if e != "svg")),
                  "invert": rng.random() < 0.3,
                  "colors": [_rand_hex(rng) for _ in range(rng.randint(2, 5))],
                  "intensity": rng.random()},
        "finish": rng.choice(sorted(FINISHES)),
        "glass": {"tint": rng.random() * 0.9},
    }
    if rng.random() < 0.5:
        spec["foreground"] = _rand_hex(rng)
    record = normalize(spec)
    c = record["theme"]["colors"]
    assert contrast(c["foreground"], c["background"]) >= 7.0 - 1e-6
    assert contrast(c["mutedForeground"], c["background"]) >= 4.5 - 1e-6
    assert contrast(c["primary"], c["background"]) >= 3.0 - 1e-6
    assert _worst_over_scene(record) >= SCENE_TEXT_FLOOR - 0.05


def test_presets_are_readable_and_need_no_adjustment():
    for spec, record in zip(PRESET_SPECS, preset_records()):
        assert record["adjustments"] == [], (spec["name"], record["adjustments"])
        assert _worst_over_scene(record) >= SCENE_TEXT_FLOOR


def test_theme_paints_one_palette_in_both_modes():
    record = normalize({"name": "Night", "background": "#05060f", "accent": "#7c8cff"})
    assert record["theme"]["colors"] == record["theme"]["darkColors"]
    assert record["appearance"] == "dark"


def test_slug_never_ends_in_a_mode_word():
    for label in ("Ocean Dark", "paper light", "Dark", "Light"):
        slug = slugify(label)
        assert slug.startswith("aether-")
        assert not slug.endswith(("-dark", "-light")), slug


def test_appearance_follows_the_background_and_says_so():
    record = normalize({"name": "Mismatch", "background": "#f6f4ef", "accent": "#8a5d00", "appearance": "dark"})
    assert record["appearance"] == "light"
    assert any("appearance" in note for note in record["adjustments"])


@pytest.mark.parametrize("spec, field", [
    ({"background": "#000", "accent": "#fff"}, "name"),
    ({"name": "x", "background": "black", "accent": "#fff"}, "background"),
    ({"name": "x", "background": "#000", "accent": "#fff", "scene": {"engine": "lava"}}, "scene.engine"),
    ({"name": "x", "background": "#000", "accent": "#fff", "scene": {"colors": ["#000"]}}, "scene.colors"),
    ({"name": "x", "background": "#000", "accent": "#fff", "finish": {"style": "oil"}}, "finish.style"),
    ({"name": "x", "background": "#000", "accent": "#fff", "scene": {"engine": "svg", "svg": "<svg><script/></svg>"}}, "scene.svg"),
])
def test_unusable_specs_name_the_field(spec, field):
    with pytest.raises(SpecError) as err:
        normalize(spec)
    assert field in str(err.value)


def test_numbers_are_clamped_and_reported():
    record = normalize({"name": "Fast", "background": "#000000", "accent": "#ffffff",
                        "scene": {"engine": "streaks", "speed": 99, "intensity": -4}})
    assert record["scene"]["speed"] == 3.0
    assert record["scene"]["intensity"] == 0.05
    assert any("scene.speed" in n for n in record["adjustments"])
