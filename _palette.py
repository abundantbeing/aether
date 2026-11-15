"""Derive a complete Hermes Desktop palette (``DesktopThemeColors``) from a few seeds.

The agent (or a preset) names a background, an accent and optionally a foreground and a second
accent. Everything else is mixed from those in OKLab and then held to a readability floor: body text
7:1, secondary text 4.5:1, the accent 3:1 against the surfaces it marks. Each fix is reported, so the
model can tell the user what moved and why instead of silently shipping a different colour.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ._color import contrast, ensure_contrast, is_dark, mix, normalize_hex, oklch_to_rgb, readable_ink, rgb_to_oklch, parse_hex, to_hex

# Body text, secondary text, accent marks. WCAG AAA body, AA everything a person must read, and the
# 3:1 non-text floor for the accent where it is the only signal (focus rings, active pills).
TEXT_FLOOR = 7.0
SECONDARY_FLOOR = 4.5
ACCENT_FLOOR = 3.0

_DESTRUCTIVE = {"dark": "#f85149", "light": "#cf222e"}


@dataclass
class Derived:
    appearance: str
    colors: Dict[str, str]
    adjustments: List[str] = field(default_factory=list)


def _floor(name: str, color: str, background: str, target: float, notes: List[str], on: str) -> str:
    fixed = ensure_contrast(color, background, target)
    if fixed != normalize_hex(color):
        notes.append(f"{name} {normalize_hex(color)} -> {fixed} to reach {target:g}:1 on {on}")
    return fixed


_INK = {"dark": "#f4f2ec", "light": "#16161a"}
# The background must leave room for body text above the floor, with margin for the tinted inks the
# palette mixes. A mid-tone (#7e60ec) carries 7:1 in no ink at all, so it is moved, hue kept.
_BACKGROUND_ROOM = TEXT_FLOOR + 1.5


def _settle_background(bg: str, notes: List[str], foreground: Optional[str] = None) -> str:
    appearance = "dark" if is_dark(bg) else "light"
    ink = _INK[appearance]
    if contrast(ink, bg) >= _BACKGROUND_ROOM:
        return bg
    # An explicit foreground that already clears the body-text floor keeps a brand background exact
    # (white on #0000F2 is 9.2:1 even though the default ink is not).
    if foreground and contrast(foreground, bg) >= TEXT_FLOOR + 0.5:
        return bg
    L, C, h = rgb_to_oklch(parse_hex(bg))
    lo, hi = (0.0, L) if appearance == "dark" else (L, 1.0)
    settled = bg
    for _ in range(28):
        mid = (lo + hi) / 2
        candidate = to_hex(oklch_to_rgb(mid, C, h))
        if contrast(ink, candidate) >= _BACKGROUND_ROOM:
            settled = candidate
            if appearance == "dark":
                lo = mid
            else:
                hi = mid
        elif appearance == "dark":
            hi = mid
        else:
            lo = mid
    if settled == bg:
        settled = "#000000" if appearance == "dark" else "#ffffff"
    notes.append(f"background {bg} -> {settled}: too mid-tone for readable text, moved {'darker' if appearance == 'dark' else 'lighter'} with its hue kept")
    return settled


def derive(background: str, accent: str, foreground: Optional[str] = None,
           secondary: Optional[str] = None) -> Derived:
    """Full palette for one appearance. The appearance follows the background, exactly as the
    Desktop decides it (gamma luma at 0.5), so a palette can never paint dark text on a dark field."""
    notes: List[str] = []
    bg = _settle_background(normalize_hex(background), notes, normalize_hex(foreground) if foreground else None)
    acc = normalize_hex(accent)
    dark = is_dark(bg)
    appearance = "dark" if dark else "light"

    ink_seed = _INK[appearance]
    fg = normalize_hex(foreground) if foreground else mix(ink_seed, acc, 0.06)
    fg = _floor("foreground", fg, bg, TEXT_FLOOR, notes, "the background")

    sidebar = mix(bg, "#000000" if dark else "#ffffff", 0.18 if dark else 0.35)
    card = mix(bg, fg, 0.05 if dark else 0.03)
    popover = mix(bg, fg, 0.08 if dark else 0.02)
    muted = mix(bg, fg, 0.09)
    muted_fg = mix(fg, bg, 0.36)
    muted_fg = _floor("muted text", muted_fg, bg, SECONDARY_FLOOR, notes, "the background")
    muted_fg = ensure_contrast(muted_fg, muted, SECONDARY_FLOOR)

    primary = _floor("accent", acc, bg, ACCENT_FLOOR, notes, "the background")
    primary = ensure_contrast(primary, sidebar, ACCENT_FLOOR)
    second = normalize_hex(secondary) if secondary else primary

    soft = mix(bg, primary, 0.14 if dark else 0.10)
    softer = mix(bg, primary, 0.09 if dark else 0.06)
    soft_fg = ensure_contrast(mix(fg, primary, 0.22), soft, SECONDARY_FLOOR)
    border = mix(bg, fg, 0.15 if dark else 0.13)
    bubble = mix(bg, second, 0.20 if dark else 0.12)
    bubble = bubble if contrast(fg, bubble) >= TEXT_FLOOR else mix(bg, second, 0.12 if dark else 0.07)
    bubble_border = mix(bg, second, 0.36 if dark else 0.26)
    destructive = ensure_contrast(_DESTRUCTIVE[appearance], bg, SECONDARY_FLOOR)

    colors = {
        "background": bg,
        "foreground": fg,
        "card": card,
        "cardForeground": ensure_contrast(fg, card, TEXT_FLOOR),
        "muted": muted,
        "mutedForeground": muted_fg,
        "popover": popover,
        "popoverForeground": ensure_contrast(fg, popover, TEXT_FLOOR),
        "primary": primary,
        "primaryForeground": readable_ink(primary),
        "secondary": soft,
        "secondaryForeground": soft_fg,
        "accent": softer,
        "accentForeground": ensure_contrast(fg, softer, TEXT_FLOOR),
        "border": border,
        "input": mix(bg, fg, 0.20 if dark else 0.17),
        "ring": primary,
        "midground": primary,
        "midgroundForeground": readable_ink(primary),
        "composerRing": mix(primary, fg, 0.12),
        "destructive": destructive,
        "destructiveForeground": readable_ink(destructive),
        "sidebarBackground": sidebar,
        "sidebarBorder": border,
        "userBubble": bubble,
        "userBubbleBorder": bubble_border,
    }
    return Derived(appearance=appearance, colors=colors, adjustments=notes)


def terminal_palette(colors: Dict[str, str]) -> Dict[str, str]:
    """ANSI colours that sit in the theme: hues fixed, lightness tuned to the background so every
    colour reads in the integrated terminal (4.5:1)."""
    bg = colors["background"]
    base = {
        "red": "#e5534b", "green": "#57ab5a", "yellow": "#c69026", "blue": "#539bf5",
        "magenta": "#b083f0", "cyan": "#39c5cf",
    }
    out = {"foreground": colors["foreground"], "cursor": colors["primary"]}
    for name, hue in base.items():
        out[name] = ensure_contrast(hue, bg, SECONDARY_FLOOR)
        out["bright" + name.capitalize()] = ensure_contrast(mix(hue, "#ffffff", 0.25), bg, SECONDARY_FLOOR)
    out["black"] = mix(bg, colors["foreground"], 0.25)
    out["brightBlack"] = ensure_contrast(mix(bg, colors["foreground"], 0.45), bg, 3.0)
    out["white"] = colors["mutedForeground"]
    out["brightWhite"] = colors["foreground"]
    return out
