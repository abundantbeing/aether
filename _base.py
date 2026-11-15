"""Start a theme from another one: a preset or a saved theme as the base, the call's fields on top.

``with_base`` layers what a call gives over the base's stored spec, so "Selene, but gold" is the base
"Selene" plus new colours and everything else (engine, finish, glass, speed, font, description) is
Selene's. Three fields follow the call instead of the base, because they only made sense with the
base's own colours: the text colour (chosen for the old background), the first scene stop when it was
the old background, and an engine's tuning when the engine changes.
"""
from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Tuple

from ._color import is_hex, normalize_hex
from ._spec import SpecError, slugify

_TOP = ("name", "description", "background", "accent", "foreground", "secondary", "font", "appearance")
# Engine tuning that only means something for the engine it was chosen for.
_ENGINE_TUNING = ("speed", "scale", "intensity", "density", "direction", "svg", "invert")


def _finish(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        return {"style": raw}
    return dict(raw) if isinstance(raw, dict) else {}


def _same(a: Any, b: Any) -> bool:
    return is_hex(a) and is_hex(b) and normalize_hex(a) == normalize_hex(b)


def with_base(args: Dict[str, Any], base: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """The spec for ``args`` layered over ``base`` (a stored record), and notes on what was carried."""
    base_spec = copy.deepcopy(base.get("spec") or {})
    spec: Dict[str, Any] = {k: base_spec[k] for k in _TOP if base_spec.get(k) not in (None, "")}
    notes: List[str] = []
    for key in _TOP:
        if args.get(key) not in (None, ""):
            spec[key] = args[key]

    new_background = args.get("background") not in (None, "") and not _same(args["background"], base_spec.get("background"))
    if new_background and not args.get("foreground") and spec.pop("foreground", None):
        notes.append(f"text colour re-derived for the new background (the base's was chosen for {base_spec.get('background')})")

    scene = dict(base_spec.get("scene") or {})
    given = args.get("scene") if isinstance(args.get("scene"), dict) else {}
    if given.get("engine") and str(given["engine"]).strip().lower() != str(scene.get("engine", "")).lower():
        for key in _ENGINE_TUNING:
            scene.pop(key, None)
    scene.update(given)
    stops = scene.get("colors")
    if (new_background and "colors" not in given and isinstance(stops, list) and stops
            and _same(stops[0], base_spec.get("background"))):
        scene["colors"] = [args["background"], *stops[1:]]
        notes.append("the scene's calmest colour follows the new background")
    if scene:
        spec["scene"] = scene

    finish = _finish(base_spec.get("finish"))
    given_finish = _finish(args.get("finish"))
    if given_finish.get("style") and given_finish["style"] != finish.get("style"):
        finish = {}  # a new style starts from its own cell size, levels and pattern
    finish.update(given_finish)
    if finish:
        spec["finish"] = finish

    glass = dict(base_spec.get("glass") or {})
    glass.update(args.get("glass") if isinstance(args.get("glass"), dict) else {})
    if glass:
        spec["glass"] = glass
    return spec, notes


def default_label(base: Dict[str, Any]) -> str:
    """A preset is never overwritten, so editing one makes "<Preset> (custom)"; a saved theme of your
    own is edited in place under its own name."""
    return f"{base['label']} (custom)" if base.get("source") == "preset" else base["label"]


def avoid_preset_names(spec: Dict[str, Any], preset_slugs: set, notes: List[str]) -> Dict[str, Any]:
    """A saved theme may not take a preset's name: the Desktop keeps presets first, so it would apply
    the preset instead and the new theme could never be picked."""
    name = str(spec.get("name") or "")
    if name and slugify(name) in preset_slugs:
        renamed = f"{name} (custom)"
        notes.append(f"named {renamed!r}: {name!r} is a preset, and presets keep their names")
        return {**spec, "name": renamed}
    return spec


def compose(args: Dict[str, Any], resolve: Callable[[str], Optional[Dict[str, Any]]],
            names: Callable[[], List[str]]) -> Tuple[Dict[str, Any], List[str], Optional[Dict[str, Any]]]:
    """``args`` as a full spec: layered over ``args["base"]`` when given. Returns (spec, notes, base)."""
    wanted = args.get("base")
    if wanted in (None, ""):
        missing = [k for k in ("background", "accent") if args.get(k) in (None, "")]
        if missing:
            raise SpecError(f"{' and '.join(missing)} {'is' if len(missing) == 1 else 'are'} required unless base "
                            "names a preset or saved theme to start from")
        return {k: v for k, v in args.items() if k not in ("base", "apply")}, [], None
    base = resolve(str(wanted))
    if base is None:
        raise SpecError(f"base: no preset or saved theme called {wanted!r}. Available: {', '.join(names())}")
    spec, notes = with_base({k: v for k, v in args.items() if k not in ("base", "apply")}, base)
    if not args.get("name"):
        spec["name"] = default_label(base)
    return spec, notes, base
