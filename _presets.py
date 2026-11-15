"""The preset gallery: living themes built as wallpapers people actually want.

Each preset is an ordinary spec, normalized by the same code path as a theme the agent writes, so
presets obey the same readability floor. ``scripts/gen_presets.py`` writes the normalized records
into the Desktop half, which shows them even when the agent half is off.

Brand colours are the official ones: Nous blue #0000F2, paper #F2F2F2, deep ink #000091 and the
Hermes accent yellow #FFCD42.
"""
from __future__ import annotations

from typing import Any, Dict, List

PRESET_SPECS: List[Dict[str, Any]] = [
    {
        "name": "Olympus",
        "description": "A temple above the clouds, its roof lifted on the light of an engraved sun, in Nous blue and gold",
        "background": "#0000f2", "accent": "#ffcd42", "foreground": "#ffffff",
        "scene": {"engine": "temple", "colors": ["#000091", "#0000f2", "#7d8bff", "#f2f2f2", "#ffcd42"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 1, "pattern": "bayer8"},
        "glass": {"tint": 0.6, "focus": 0.18},
    },
    {
        "name": "Cyanotype",
        "description": "Nous blue ink stippled through paper, drifting like a print still developing",
        "background": "#f2f2f2", "accent": "#0000f2", "foreground": "#000091",
        "scene": {"engine": "nebula", "colors": ["#f2f2f2", "#cdd0f7", "#6a71f2", "#0000f2", "#000091"],
                  "speed": 0.5, "scale": 1.25, "intensity": 0.7},
        "finish": {"style": "dither", "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.55, "focus": 0.25},
    },
    {
        "name": "Aether",
        "description": "Northern lights pouring over a mountain lake, mirrored in still water",
        "background": "#03060f", "accent": "#5ef0b4", "secondary": "#7c8cff",
        "scene": {"engine": "aurora", "colors": ["#03060f", "#0b2340", "#1f7a6e", "#5ef0b4", "#d8fff0"],
                  "speed": 0.7, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.58, "focus": 0.18},
    },
    {
        "name": "Alpenglow",
        "description": "Ranges fading into a violet dusk, valley fog drifting between them",
        "background": "#1a1033", "accent": "#ff9a6b", "secondary": "#ffd29a",
        "scene": {"engine": "summit", "colors": ["#1a1033", "#3d1f4f", "#8a3b5c", "#e0795a", "#ffd29a"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 3, "pattern": "bayer4"},
        "glass": {"tint": 0.56, "focus": 0.18},
    },
    {
        "name": "Event Horizon",
        "description": "A black hole wearing its own light: the disk bent into a burning ring",
        "background": "#000000", "accent": "#ffb347",
        "scene": {"engine": "blackhole", "colors": ["#000000", "#2a1606", "#a8551a", "#ffb347", "#fff3d6"],
                  "speed": 0.7, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 2, "pattern": "noise"},
        "glass": {"tint": 0.56, "focus": 0.18},
    },
    {
        "name": "Earthrise",
        "description": "Dawn breaking over the edge of the world, city lights on the night side",
        "background": "#01030a", "accent": "#7cc4ff",
        "scene": {"engine": "planet", "colors": ["#01030a", "#06173a", "#1f5fa8", "#7cc4ff", "#f2fbff"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.58, "focus": 0.18},
    },
    {
        "name": "Selene",
        "description": "A full moon laying a road of light across a quiet night sea",
        "background": "#030712", "accent": "#9db8e0",
        "scene": {"engine": "moonsea", "colors": ["#030712", "#0c1a33", "#2d4b7a", "#9db8e0", "#f4f7ff"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.59, "focus": 0.18},
    },
    {
        "name": "Mirage",
        "description": "Golden-hour dunes, sand streaming off their crests in the wind",
        "background": "#2a0f1e", "accent": "#f0a35c",
        "scene": {"engine": "dunes", "colors": ["#2a0f1e", "#6b2a2f", "#c4623a", "#f0a35c", "#ffe2a8"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 3, "pattern": "bayer4"},
        "glass": {"tint": 0.6, "focus": 0.18},
    },
    {
        "name": "Above the Clouds",
        "description": "A sea of cloud at first light, seen from the window seat",
        "background": "#fff6ea", "accent": "#3d4a9e", "foreground": "#1d2347",
        "scene": {"engine": "clouds", "invert": True,
                  "colors": ["#fff6ea", "#f6d9b8", "#e3a88a", "#9097cc", "#3d4a86"],
                  "speed": 0.6, "intensity": 0.8},
        "finish": {"style": "dither", "pixel": 2, "pattern": "noise"},
        "glass": {"tint": 0.5, "focus": 0.25},
    },
    {
        "name": "After Hours",
        "description": "A neon city in the rain, its windows doubled in the wet street",
        "background": "#07040f", "accent": "#ff3fa4", "secondary": "#7df9ff",
        "scene": {"engine": "skyline", "colors": ["#07040f", "#1c0f33", "#7b1e6b", "#ff3fa4", "#7df9ff"],
                  "speed": 0.7, "intensity": 1.0},
        "finish": {"style": "scanlines", "pixel": 3},
        "glass": {"tint": 0.55, "focus": 0.18},
        "font": "space-grotesk",
    },
    {
        "name": "Hanami",
        "description": "Cherry boughs overhead and petals drifting down through spring light",
        "background": "#fff6f8", "accent": "#c4456f", "foreground": "#3a1626",
        "scene": {"engine": "sakura", "colors": ["#fff6f8", "#fbe3ea", "#f4b6c8", "#e58aa6", "#9c3d62"],
                  "speed": 0.7, "intensity": 0.95},
        "finish": {"style": "dither", "pixel": 2, "pattern": "noise"},
        "glass": {"tint": 0.45, "focus": 0.25},
    },
    {
        "name": "Helios",
        "description": "A striped sun over an endless grid, dithered like an old arcade cabinet",
        "background": "#120a24", "accent": "#ff7a59", "secondary": "#ffe08a",
        "scene": {"engine": "horizon", "colors": ["#120a24", "#4a1b5c", "#d9426b", "#ff9b45", "#ffe08a"],
                  "speed": 0.6, "intensity": 0.9},
        "finish": {"style": "dither", "pixel": 3, "pattern": "bayer4"},
        "glass": {"tint": 0.58, "focus": 0.18},
        "font": "space-grotesk",
    },
    {
        "name": "Talaria",
        "description": "Golden wings at full speed over a sea of cloud, feathers torn loose by the wind",
        "background": "#060a1f", "accent": "#f0c25a",
        "scene": {"engine": "wings", "colors": ["#04061a", "#121a4a", "#9a7434", "#f0c25a", "#fff3cf"],
                  "speed": 1.0, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.6, "focus": 0.18},
    },
    {
        "name": "Styx",
        "description": "Dark river contours drifting slowly, Hermes guiding the way across",
        "background": "#03100f", "accent": "#3fd1bd",
        "scene": {"engine": "tides", "colors": ["#03100f", "#0a2b2a", "#1e7f78", "#7de3d1"],
                  "speed": 0.6, "density": 0.6, "intensity": 0.8},
        "finish": "none",
        "glass": {"tint": 0.45, "focus": 0.18},
    },
    {
        "name": "Phosphor",
        "description": "The classic Hermes amber terminal, raining in text characters",
        "background": "#0d0a05", "accent": "#ffbf00",
        "scene": {"engine": "rain", "colors": ["#0d0a05", "#3a2606", "#c98a00", "#ffbf00", "#ffe7a3"],
                  "speed": 0.8, "density": 0.7, "intensity": 0.95},
        "finish": {"style": "ascii", "pixel": 13},
        "glass": {"tint": 0.6, "focus": 0.18},
        "font": "jetbrains-mono",
    },
    {
        "name": "Caduceus Gold",
        "description": "Sparks rising in the gold-to-bronze of the Hermes banner, pixel dithered",
        "background": "#0f0d0a", "accent": "#ffcd42", "secondary": "#cd7f32",
        "scene": {"engine": "embers", "colors": ["#0f0d0a", "#3a2408", "#cd7f32", "#ffbf00", "#ffe48a"],
                  "speed": 0.8, "density": 0.55, "intensity": 0.9},
        "finish": {"style": "dither", "pixel": 3, "pattern": "bayer4"},
        "glass": {"tint": 0.53, "focus": 0.18},
        "font": "courier-prime",
    },
    {
        "name": "Folio",
        "description": "Mountains in one-bit ink on paper, like a page from an old field journal",
        "background": "#f2efe6", "accent": "#1b1b1f",
        "scene": {"engine": "summit", "invert": True, "colors": ["#f2efe6", "#1b1b1f"],
                  "speed": 0.5, "intensity": 1.0},
        "finish": {"style": "dither", "levels": 2, "pixel": 2, "pattern": "bayer8"},
        "glass": {"tint": 0.6, "focus": 0.25},
        "font": "courier-prime",
    },
    {
        "name": "Pocket",
        "description": "Moonlit sea in four shades of handheld green, chunky and nostalgic",
        "background": "#0f380f", "accent": "#9bbc0f",
        "scene": {"engine": "moonsea", "colors": ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
                  "speed": 0.6, "intensity": 1.0},
        "finish": {"style": "dither", "pixel": 4, "pattern": "bayer4"},
        "glass": {"tint": 0.55, "focus": 0.18},
        "font": "jetbrains-mono",
    },
]


def preset_records() -> List[Dict[str, Any]]:
    """Every preset normalized into the record shape the Desktop registers (stable timestamps, so the
    generated file only changes when a preset does)."""
    from ._spec import normalize

    out = []
    for order, spec in enumerate(PRESET_SPECS):
        record = normalize(spec, source="preset", now=0.0)
        record["order"] = order
        out.append(record)
    return out
