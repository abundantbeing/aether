"""Colour maths for Aether: sRGB <-> OKLab/OKLCH, WCAG contrast, and contrast-guaranteed adjustment.

Pure functions over hex strings. Everything that derives a palette goes through here, so a theme the
agent writes and a preset shipped with the plugin are held to the same readability floor.
"""
from __future__ import annotations

import math
import re
from typing import Tuple

RGB = Tuple[float, float, float]

_HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def parse_hex(value: str) -> RGB:
    """``'#0053fd'`` / ``'0053FD'`` / ``'#05f'`` -> sRGB floats in 0..1. Raises ValueError otherwise."""
    if not isinstance(value, str):
        raise ValueError("colour must be a hex string like #0053fd")
    match = _HEX.match(value.strip())
    if not match:
        raise ValueError(f"{value!r} is not a hex colour like #0053fd")
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(ch * 2 for ch in digits)
    return tuple(int(digits[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def is_hex(value: object) -> bool:
    return isinstance(value, str) and bool(_HEX.match(value.strip()))


def to_hex(rgb: RGB) -> str:
    return "#" + "".join(f"{round(min(1.0, max(0.0, c)) * 255):02x}" for c in rgb)


def normalize_hex(value: str) -> str:
    return to_hex(parse_hex(value))


# ── transfer functions ──────────────────────────────────────────────────────────────────────────


def _to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _to_gamma(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


# ── OKLab (Bjorn Ottosson, public domain matrices) ─────────────────────────────────────────────


def rgb_to_oklab(rgb: RGB) -> Tuple[float, float, float]:
    r, g, b = (_to_linear(c) for c in rgb)
    l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l_, m_, s_))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklab_to_linear(lab: Tuple[float, float, float]) -> RGB:
    L, a, b = lab
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (
        +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )


def _in_gamut(lin: RGB, eps: float = 1e-4) -> bool:
    return all(-eps <= c <= 1 + eps for c in lin)


def oklch_to_rgb(L: float, C: float, h: float) -> RGB:
    """OKLCH -> sRGB, reducing chroma (hue and lightness kept) until the colour fits the gamut."""
    L = min(1.0, max(0.0, L))
    rad = math.radians(h)
    lo, hi = 0.0, max(0.0, C)
    lin = oklab_to_linear((L, hi * math.cos(rad), hi * math.sin(rad)))
    if not _in_gamut(lin):
        for _ in range(24):
            mid = (lo + hi) / 2
            if _in_gamut(oklab_to_linear((L, mid * math.cos(rad), mid * math.sin(rad)))):
                lo = mid
            else:
                hi = mid
        lin = oklab_to_linear((L, lo * math.cos(rad), lo * math.sin(rad)))
    return tuple(_to_gamma(min(1.0, max(0.0, c))) for c in lin)  # type: ignore[return-value]


def rgb_to_oklch(rgb: RGB) -> Tuple[float, float, float]:
    L, a, b = rgb_to_oklab(rgb)
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


# ── measures ─────────────────────────────────────────────────────────────────────────────────────


def luminance(rgb: RGB) -> float:
    r, g, b = (_to_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    """WCAG 2 contrast ratio between two hex colours (1.0 .. 21.0)."""
    la, lb = luminance(parse_hex(a)), luminance(parse_hex(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def is_dark(value: str) -> bool:
    """The Desktop's own test (themes/context.tsx renderedModeFor): gamma-space luma at 0.5."""
    r, g, b = parse_hex(value)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.5


def readable_ink(background: str) -> str:
    """``#161616`` or ``#ffffff``, whichever measures better on *background* (the Desktop's ink pick)."""
    return "#161616" if contrast("#161616", background) >= contrast("#ffffff", background) else "#ffffff"


# ── mixing ───────────────────────────────────────────────────────────────────────────────────────


def mix(a: str, b: str, t: float) -> str:
    """Perceptual mix in OKLab: ``t=0`` is *a*, ``t=1`` is *b*."""
    la, lb = rgb_to_oklab(parse_hex(a)), rgb_to_oklab(parse_hex(b))
    lab = tuple(x + (y - x) * t for x, y in zip(la, lb))
    lin = oklab_to_linear(lab)  # type: ignore[arg-type]
    return to_hex(tuple(_to_gamma(min(1.0, max(0.0, c))) for c in lin))  # type: ignore[arg-type]


def over(top: str, bottom: str, alpha: float) -> str:
    """*top* at *alpha* composited over *bottom* in gamma sRGB, the way CSS ``color-mix(in srgb)`` and
    a translucent layer blend on screen."""
    ta, ba = parse_hex(top), parse_hex(bottom)
    return to_hex(tuple(t * alpha + b * (1 - alpha) for t, b in zip(ta, ba)))  # type: ignore[arg-type]


# ── contrast enforcement ─────────────────────────────────────────────────────────────────────────


def ensure_contrast(color: str, background: str, target: float) -> str:
    """Move *color*'s OKLCH lightness away from *background* until the pair reaches *target*.

    Hue is kept and chroma only shrinks where the gamut forces it, so an accent stays recognisably
    itself. Returns the input unchanged when it already passes. When even pure black or white cannot
    reach the target (a mid-grey background asking for 7:1), returns whichever of the two comes closest.
    """
    color = normalize_hex(color)
    if contrast(color, background) >= target:
        return color
    L, C, h = rgb_to_oklch(parse_hex(color))
    lighter = is_dark(background)  # on a dark background the fix is always lighter
    lo, hi = (L, 1.0) if lighter else (0.0, L)
    best = color
    for _ in range(28):
        mid = (lo + hi) / 2
        candidate = to_hex(oklch_to_rgb(mid, C, h))
        if contrast(candidate, background) >= target:
            best = candidate
            if lighter:
                hi = mid
            else:
                lo = mid
        else:
            if lighter:
                lo = mid
            else:
                hi = mid
    if contrast(best, background) >= target:
        return best
    extreme = "#ffffff" if lighter else "#000000"
    return extreme
