"""Validate and normalize an Aether theme spec into a stored record.

A spec is what the agent (or a preset) writes: a name, two or more seed colours, and a scene (one of
the built-in engines, or a hand-written SVG) with a finish and a glass layer. Normalizing it yields:

- ``theme``: a full ``DesktopTheme`` the Desktop registers through ``THEMES_AREA``;
- ``scene``: clamped engine parameters the Desktop renderer reads as uniforms;
- ``adjustments``: every change made to keep the result readable, in words the model can relay.

Untrusted input never reaches the renderer as code: engines are fixed shaders shipped with the plugin,
and an SVG scene is checked by ``_svg.check_svg`` and only ever shown through an ``<img>``.
"""
from __future__ import annotations

import re
import time
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from ._color import contrast, is_hex, mix, normalize_hex, over, parse_hex, to_hex
from ._palette import SECONDARY_FLOOR, derive, terminal_palette
from ._svg import SvgRejected, check_svg

SLUG_PREFIX = "aether-"
MAX_LABEL = 40
MAX_DESCRIPTION = 140

# name -> (one-line summary for the tool schema and the gallery, default params)
ENGINES: Dict[str, Tuple[str, Dict[str, float]]] = {
    "radiance": ("engraved rays fanning from a halo, the Hermes look", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "temple": ("a Greek temple backlit by an engraved sun, its roof floating on the light above a sea of cloud", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "summit": ("layered mountain ranges at dusk with sun, fog and stars", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "aurora": ("northern lights over mountains, mirrored in a lake", {"speed": 0.7, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "clouds": ("a sea of clouds at sunrise seen from above", {"speed": 0.6, "scale": 1.0, "intensity": 0.85, "density": 0.5}),
    "moonsea": ("a full moon and its path of light on a night sea", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "dunes": ("desert dunes at golden hour, sand blowing off crests", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "blackhole": ("a black hole ringed by its bent accretion disk", {"speed": 0.7, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "planet": ("dawn over a planet's edge, city lights on the night side", {"speed": 0.6, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "skyline": ("a neon city at night in the rain, reflected in the street", {"speed": 0.7, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "sakura": ("cherry blossom boughs with petals drifting down", {"speed": 0.7, "scale": 1.0, "intensity": 0.95, "density": 0.5}),
    "gradient": ("slow drifting colour bands; the calmest", {"speed": 0.6, "scale": 1.0, "intensity": 0.7, "density": 0.5}),
    "nebula": ("domain-warped clouds, smoke and ink in water", {"speed": 0.8, "scale": 1.0, "intensity": 0.8, "density": 0.5}),
    "tides": ("contour lines that swell like water", {"speed": 0.7, "scale": 1.0, "intensity": 0.7, "density": 0.55}),
    "starfield": ("parallax stars that twinkle over faint dust", {"speed": 0.6, "scale": 1.0, "intensity": 0.9, "density": 0.5}),
    "embers": ("sparks rising from a warm glow", {"speed": 0.8, "scale": 1.0, "intensity": 0.85, "density": 0.5}),
    "streaks": ("wind and speed lines along a direction", {"speed": 1.0, "scale": 1.0, "intensity": 0.75, "density": 0.5}),
    "wings": ("a great engraved wing beating slowly, feathers torn loose by the wind, cloud streaming far below", {"speed": 1.0, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
    "horizon": ("retro perspective grid under a striped sun", {"speed": 0.7, "scale": 1.0, "intensity": 0.85, "density": 0.5}),
    "rain": ("falling columns of light; pairs with ascii or braille", {"speed": 0.9, "scale": 1.0, "intensity": 0.85, "density": 0.55}),
    "constellation": ("drifting nodes joined by fine lines", {"speed": 0.6, "scale": 1.0, "intensity": 0.85, "density": 0.5}),
    "marble": ("veined stone that slowly flows", {"speed": 0.4, "scale": 1.0, "intensity": 0.75, "density": 0.5}),
    "plasma": ("interfering colour waves, psychedelic", {"speed": 0.7, "scale": 1.0, "intensity": 0.8, "density": 0.5}),
    "svg": ("your own SVG scene animated with CSS (see the skill)", {"speed": 1.0, "scale": 1.0, "intensity": 1.0, "density": 0.5}),
}

FINISHES: Dict[str, str] = {
    "none": "smooth colour",
    "dither": "ordered (Bayer) dithering to the scene colours, crisp pixels",
    "halftone": "printed dots sized by brightness",
    "ascii": "the scene drawn in text characters",
    "grain": "smooth colour with film grain",
    "braille": "the scene drawn in braille dots, dithered",
    "scanlines": "smooth colour with scanlines",
    "crt": "an old monitor: scanlines, phosphor mask, colour fringing, curved glass",
    "glitch": "clean, with brief signal-loss bursts every few seconds",
    "pixel": "chunky mosaic pixels without dithering",
}
PATTERNS = ("bayer4", "bayer8", "bayer2", "noise")
# Each style's default cell size in CSS pixels; a style not listed uses 2.
FINISH_PIXEL: Dict[str, int] = {"dither": 3, "pixel": 6, "halftone": 7, "ascii": 12, "braille": 12, "scanlines": 3, "crt": 3}

# key -> (CSS family, stylesheet URL or None when the font ships with the app)
FONTS: Dict[str, Optional[Tuple[str, Optional[str]]]] = {
    "system": None,
    "inter": ("Inter", "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"),
    "ibm-plex-sans": ("IBM Plex Sans", "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"),
    "space-grotesk": ("Space Grotesk", "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"),
    "courier-prime": ("Courier Prime", "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap"),
    "jetbrains-mono": ("JetBrains Mono", None),
}
_SANS_FALLBACK = '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'

# Scene + glass readability: body text must keep this ratio over the brightest part of the scene the
# finish can paint, after the glass tint is laid over it.
SCENE_TEXT_FLOOR = SECONDARY_FLOOR
_SCENE_MARGIN = 0.1  # searched against floor + margin, so rounding never lands a hair under it
MAX_TINT = 0.95


class SpecError(ValueError):
    """The spec cannot be turned into a theme; the message says what to change."""


# ── small coercions ─────────────────────────────────────────────────────────────────────────────


def _num(value: Any, default: float, lo: float, hi: float, name: str, notes: List[str]) -> float:
    if value is None:
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise SpecError(f"{name} must be a number between {lo:g} and {hi:g}") from None
    if number != number:  # NaN
        raise SpecError(f"{name} must be a number between {lo:g} and {hi:g}")
    clamped = min(hi, max(lo, number))
    if clamped != number:
        notes.append(f"{name} {number:g} clamped to {clamped:g}")
    return clamped


def _text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = "".join(ch for ch in unicodedata.normalize("NFC", value) if unicodedata.category(ch)[0] != "C")
    return " ".join(cleaned.split())[:limit]


def _hex(value: Any, name: str) -> str:
    if not is_hex(value):
        raise SpecError(f"{name} must be a hex colour like #0b1020 (got {value!r})")
    return normalize_hex(value)


def slugify(label: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:40].strip("-") or "theme"
    # The Desktop strips a trailing -dark / -light from a theme name when it paints (it reads them as
    # mode suffixes), so a theme called "Ocean Dark" would lose its own name. Say it another way.
    slug = re.sub(r"-dark$", "-night", SLUG_PREFIX + slug)
    return re.sub(r"-light$", "-day", slug)


# ── ramp sampling (mirrors the shader's piecewise-linear ramp in gamma sRGB) ──────────────────────


def ramp(colors: List[str], t: float) -> str:
    t = min(1.0, max(0.0, t)) * (len(colors) - 1)
    i = min(int(t), len(colors) - 2)
    a, b = parse_hex(colors[i]), parse_hex(colors[i + 1])
    f = t - i
    return to_hex(tuple(x + (y - x) * f for x, y in zip(a, b)))  # type: ignore[arg-type]


def _worst_text_contrast(colors: List[str], reach: float, chrome: str, fg: str, tint: float) -> float:
    # Every colour stop the scene can reach, plus a dense grid between them. On a dark theme the
    # worst point is always a stop (luminance along a gamma-space segment is convex); a light theme
    # can dip between stops, which the grid catches.
    stops = [i / (len(colors) - 1) for i in range(len(colors)) if i / (len(colors) - 1) <= reach]
    positions = sorted(set(stops + [reach * i / 64 for i in range(65)]))
    return min(contrast(fg, over(chrome, ramp(colors, t), tint)) for t in positions)


def _default_scene_colors(appearance: str, bg: str, accent: str, fg: str, second: str) -> List[str]:
    if appearance == "dark":
        return [bg, mix(bg, accent, 0.38), accent, mix(second, fg, 0.55)]
    return [bg, mix(bg, accent, 0.22), mix(accent, bg, 0.15), accent]


# ── the scene ───────────────────────────────────────────────────────────────────────────────────


def _finish(raw: Any, notes: List[str]) -> Dict[str, Any]:
    if raw is None:
        raw = {}
    if isinstance(raw, str):
        raw = {"style": raw}
    if not isinstance(raw, dict):
        raise SpecError("finish must be a style name or an object like {\"style\": \"dither\", \"pixel\": 3}")
    style = str(raw.get("style") or "none").strip().lower()
    if style not in FINISHES:
        raise SpecError(f"finish.style must be one of {', '.join(FINISHES)} (got {style!r})")
    pattern = str(raw.get("pattern") or "bayer4").strip().lower()
    if pattern not in PATTERNS:
        raise SpecError(f"finish.pattern must be one of {', '.join(PATTERNS)}")
    default_pixel = FINISH_PIXEL.get(style, 2)
    return {
        "style": style,
        "pixel": int(round(_num(raw.get("pixel"), default_pixel, 1, 24, "finish.pixel", notes))),
        "levels": int(round(_num(raw.get("levels"), 0, 0, 8, "finish.levels", notes))),  # 0 = one per colour
        "pattern": pattern,
    }


def _scene(raw: Any, appearance: str, colors: Dict[str, str], second: str,
           notes: List[str]) -> Dict[str, Any]:
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise SpecError("scene must be an object like {\"engine\": \"nebula\"}")
    engine = str(raw.get("engine") or "nebula").strip().lower()
    if engine not in ENGINES:
        raise SpecError(f"scene.engine must be one of {', '.join(ENGINES)} (got {engine!r})")
    defaults = ENGINES[engine][1]

    stops = raw.get("colors")
    if stops is None:
        palette = _default_scene_colors(appearance, colors["background"], colors["primary"], colors["foreground"], second)
    else:
        if not isinstance(stops, list) or not 2 <= len(stops) <= 5:
            raise SpecError("scene.colors must be a list of 2 to 5 hex colours, darkest/calmest first")
        palette = [_hex(c, f"scene.colors[{i}]") for i, c in enumerate(stops)]

    scene: Dict[str, Any] = {
        "engine": engine,
        "colors": palette,
        "speed": _num(raw.get("speed"), defaults["speed"], 0.0, 3.0, "scene.speed", notes),
        "scale": _num(raw.get("scale"), defaults["scale"], 0.25, 4.0, "scene.scale", notes),
        "intensity": _num(raw.get("intensity"), defaults["intensity"], 0.05, 1.0, "scene.intensity", notes),
        "density": _num(raw.get("density"), defaults["density"], 0.0, 1.0, "scene.density", notes),
        "direction": _num(raw.get("direction"), 0.0, -360.0, 360.0, "scene.direction", notes) % 360,
        "seed": int(_num(raw.get("seed"), 7, 0, 9999, "scene.seed", notes)),
        "invert": bool(raw.get("invert", False)),
        "svg": None,
    }
    if engine == "svg":
        try:
            scene["svg"] = check_svg(raw.get("svg"))
        except SvgRejected as exc:
            raise SpecError(f"scene.svg rejected: {exc}") from None
    elif raw.get("svg"):
        notes.append("scene.svg ignored: it is only read when scene.engine is \"svg\"")
    return scene


def _glass(raw: Any, scene: Dict[str, Any], finish: Dict[str, Any], colors: Dict[str, str],
           notes: List[str]) -> Dict[str, float]:
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise SpecError("glass must be an object like {\"tint\": 0.6, \"focus\": 0.3}")
    tint = _num(raw.get("tint"), 0.62, 0.0, MAX_TINT, "glass.tint", notes)
    focus = _num(raw.get("focus"), 0.35, 0.0, 0.9, "glass.focus", notes)
    if scene["engine"] == "svg":
        return {"tint": max(tint, 0.55), "focus": focus}  # an SVG cannot be measured here: keep a floor

    reach = 1.0 if finish["style"] in ("halftone", "ascii", "braille", "glitch") else scene["intensity"]
    chrome, fg = colors["background"], colors["foreground"]
    target = SCENE_TEXT_FLOOR + _SCENE_MARGIN
    if _worst_text_contrast(scene["colors"], reach, chrome, fg, tint) < SCENE_TEXT_FLOOR:
        needed = next((t / 100 for t in range(int(tint * 100), int(MAX_TINT * 100) + 1)
                       if _worst_text_contrast(scene["colors"], reach, chrome, fg, t / 100) >= target),
                      None)
        if needed is not None:
            notes.append(f"glass.tint {tint:g} -> {needed:g} so text keeps {SCENE_TEXT_FLOOR:g}:1 over the scene")
            tint = needed
        else:
            # Even the strongest veil cannot hold the floor: soften the scene toward the background,
            # hues kept. At softness 1 every stop is the background, so this always ends readable.
            tint = MAX_TINT
            original = list(scene["colors"])
            softness = 0.0
            while softness < 1.0 and _worst_text_contrast(scene["colors"], reach, chrome, fg, tint) < target:
                softness = round(softness + 0.1, 2)
                scene["colors"] = [mix(c, chrome, softness) for c in original]
            notes.append(f"scene too bright behind text: glass.tint -> {tint:g} and scene colours softened "
                         f"{int(softness * 100)}% toward the background")
    return {"tint": round(tint, 2), "focus": round(focus, 2)}


# ── the record ──────────────────────────────────────────────────────────────────────────────────


def _typography(key: Any, notes: List[str]) -> Optional[Dict[str, str]]:
    if key in (None, "", "system"):
        return None
    key = str(key).strip().lower()
    if key not in FONTS:
        notes.append(f"font {key!r} is not one of {', '.join(FONTS)}; kept the Hermes default")
        return None
    family, url = FONTS[key]  # type: ignore[misc]
    out = {"fontSans": f'"{family}", {_SANS_FALLBACK}'}
    if url:
        out["fontUrl"] = url
    return out


def normalize(spec: Any, *, source: str = "agent", now: Optional[float] = None) -> Dict[str, Any]:
    """Spec -> record ``{slug, label, description, appearance, theme, scene, spec, adjustments, ...}``.

    Raises :class:`SpecError` with a message the model can act on when the spec is unusable.
    """
    if not isinstance(spec, dict):
        raise SpecError("the theme spec must be an object")
    notes: List[str] = []
    label = _text(spec.get("name"), MAX_LABEL)
    if not label:
        raise SpecError("name is required: a short title for the theme, like \"Sunset Dither\"")
    background = _hex(spec.get("background"), "background")
    accent = _hex(spec.get("accent"), "accent")
    foreground = _hex(spec["foreground"], "foreground") if spec.get("foreground") else None
    secondary = _hex(spec["secondary"], "secondary") if spec.get("secondary") else None

    derived = derive(background, accent, foreground, secondary)
    notes.extend(derived.adjustments)
    asked = str(spec.get("appearance") or "").strip().lower()
    if asked in ("dark", "light") and asked != derived.appearance:
        notes.append(f"appearance {asked!r} ignored: background {background} reads {derived.appearance}, "
                     "so the theme paints as " + derived.appearance)

    colors = derived.colors
    finish = _finish(spec.get("finish"), notes)
    scene = _scene(spec.get("scene"), derived.appearance, colors, secondary or colors["primary"], notes)
    scene["finish"] = finish
    scene["glass"] = _glass(spec.get("glass"), scene, finish, colors, notes)

    slug = slugify(label)
    engine_label = scene["engine"]
    description = _text(spec.get("description"), MAX_DESCRIPTION) or (
        f"{'' if finish['style'] == 'none' else finish['style'] + ' '}{engine_label}, {derived.appearance}".capitalize())
    terminal = terminal_palette(colors)
    theme: Dict[str, Any] = {
        "name": slug,
        "label": label,
        "description": description,
        # One designed palette for both modes: an Aether theme is its scene, and the Desktop would
        # otherwise synthesize a white light palette under a dark scene.
        "colors": colors,
        "darkColors": colors,
        "terminal": terminal,
        "darkTerminal": terminal,
    }
    typography = _typography(spec.get("font"), notes)
    if typography:
        theme["typography"] = typography

    stamp = now if now is not None else time.time()
    stored_spec = {k: spec[k] for k in ("name", "description", "background", "accent", "foreground",
                                        "secondary", "scene", "finish", "glass", "font", "appearance")
                   if k in spec}
    return {
        "slug": slug,
        "label": label,
        "description": description,
        "appearance": derived.appearance,
        "source": source,
        "created_at": stamp,
        "updated_at": stamp,
        "theme": theme,
        "scene": scene,
        "spec": stored_spec,
        "adjustments": notes,
    }
