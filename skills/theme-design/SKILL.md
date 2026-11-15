---
name: theme-design
description: Design living Hermes Desktop themes with Aether.
version: 0.1.0
author: abundantbeing, Hermes Agent
license: MIT
metadata:
  hermes:
    category: creative
    tags: [desktop, theme, design, animation]
---

# Theme Design Skill

Turns a description ("a slow dithered sunset", "my terminal, but amber") into a living Hermes
Desktop theme with `aether_theme`: a palette plus an animated scene behind the chat. It covers
choosing colours, an engine and a finish, and writing a hand-drawn SVG scene. It does not change
fonts beyond the listed ones or edit any other app setting.

## When to Use

- The user asks to change how Hermes looks: background, wallpaper, colours, vibe, theme, mood.
- The user describes a place, artwork, film look or texture they want behind their chats.
- The user wants a preset (`aether_gallery` action `list`, then `apply`) or wants it off (`off`).

## Prerequisites

The Aether plugin with both halves enabled: the agent half (these tools) and the Desktop half
(Capabilities, Plugins, Aether, Desktop). Without a Desktop window on this chat the theme is saved
and applied the next time Hermes Desktop connects.

## Quick Reference

| Engine | Looks like | Good with |
|---|---|---|
| `radiance` | engraved rays fanning from a halo | `none`; brand, celestial, heroic |
| `temple` | a Greek temple backlit by an engraved sun, its roof floating above cloud | `dither` bayer8 1px; classical, mythic, Nous blue and gold |
| `summit` | layered mountain ranges at dusk | `dither` bayer4 3px; `invert` for one-bit ink |
| `aurora` | northern lights mirrored in a lake | `dither` bayer8 2px, `none` |
| `clouds` | a sea of clouds at sunrise | `dither` noise; `invert` for a light theme |
| `moonsea` | a moon and its path on the sea | `dither` bayer8, four-colour palettes |
| `dunes` | golden-hour desert dunes | `dither` bayer4 3px |
| `blackhole` | a black hole and its bent disk | `dither` noise 2px |
| `planet` | dawn over a planet's edge | `dither` bayer8 2px |
| `skyline` | neon city in the rain | `scanlines`, `crt`, `glitch` |
| `sakura` | blossom boughs, falling petals | light palettes, `dither` noise |
| `gradient` | slow colour bands | `grain`; calm themes |
| `nebula` | smoke, clouds, ink in water | `dither` (print), `none` |
| `tides` | contour lines that swell | `none`; water, maps, plotters |
| `starfield` | parallax twinkling stars | `dither` bayer8, `braille` |
| `embers` | sparks rising from a glow | `dither`; fire, forges, gold |
| `streaks` | speed lines on a `direction` | `none`, `pixel`; motion, wind |
| `wings` | a pair of engraved wings beating, feathers torn loose, cloud streaming below | `dither` bayer8 2px, `none`; flight, speed, Hermes |
| `horizon` | grid floor and a striped sun | `dither`; retro, arcade |
| `rain` | falling columns of light | `ascii`, `braille`; terminals, code |
| `constellation` | drifting linked nodes | `none`; networks, minds |
| `marble` | veined stone | `grain`; luxury, classical |
| `plasma` | interfering colour waves | `halftone`; pop, psychedelic |
| `svg` | your own drawing (below) | `none`, or any finish |

Finishes: `none`, `dither` (Bayer or noise, crisp pixels; `pixel` 2 to 4; `pattern` bayer2, bayer4,
bayer8 or noise; `levels` 2 for one-bit), `halftone` (`pixel` 7 to 12 is the dot cell), `ascii`
(`pixel` 11 to 15 is the glyph height), `braille` (dots in 2x4 cells), `grain`, `scanlines`, `crt`
(scanlines, phosphor mask, colour fringing, curved glass), `glitch` (clean with brief signal-loss
bursts), `pixel` (mosaic).

Scenes describe brightness: dark parts take the first colours, bright parts the last. For a light
theme of a bright scene (clouds, snow), set `scene.invert` so the brightest parts become the paper.

## Procedure

1. Read the request for four things: light or dark, two or three key colours, a motion
   (drifting, falling, rising, flowing, still) and a texture (smooth, printed, pixel, text).
2. Pick `background` (the calm base) and `accent` (buttons and focus). A dark background makes a
   dark theme. Add `secondary` for a second hue; it tints the user's chat bubbles.
3. Pick the engine whose scene or motion matches (a place or a sky beats an abstract pattern), and 3 to 5 `scene.colors` from the background up to the
   brightest highlight. Start the list with the background colour so the calm parts of the scene
   melt into the app.
4. Pick a finish for the texture. Dither and pixel suit retro and print; halftone suits pop art and
   newsprint; ascii suits terminals; grain suits photographic and soft looks.
5. Keep it calm: `speed` 0.4 to 0.9 for most themes, `intensity` 0.6 to 0.9, big `scale` (1 to
   1.6) for soft fields. A busy scene behind text is tiring; the glass veil and the focus area keep
   the conversation column quiet, and the tool raises them if text would get hard to read.
6. Call `aether_theme`. Tell the user the name, what the scene does, and any `adjustments` the
   tool reports in one short sentence. If the result has `preview_card`, end your reply with that
   directive line on its own so Desktop shows a live preview with Undo.
7. For changes ("slower", "more purple", "less busy"), call `aether_theme` with `base` set to the
   theme's name and only the fields that change; reusing the same `name` replaces it in place.
8. To start from a preset or another saved theme ("Selene, but gold", "Folio in Nous blue"), pass
   `base` with that theme's name, a new `name`, and only what differs, usually `accent`, `background`
   and `scene.colors`. The scene, finish, glass, speed and font carry over. A new background
   re-derives the text colour and, when the scene's first colour was the old background, swaps it
   too. A theme cannot take a preset's own name; the tool saves it as "<name> (custom)".
   People can also change a theme's colours themselves from the Aether gallery (the Colours button).

### Hand-drawn SVG scenes

Use `scene.engine` `svg` when the user wants a specific picture (a skyline, a mountain range, a
logo-like motif) that no engine draws. Put the full markup in `scene.svg`.

- One root `<svg>` with a `viewBox` (16:10 such as `0 0 1600 1000` fits most windows) and
  `preserveAspectRatio="xMidYMid slice"`.
- Animate with CSS in a `<style>` element (`@keyframes`, `transform`, `opacity`) or SMIL
  (`<animate>`, `<animateTransform>`). Long durations (20 to 120 s), ease-in-out, big soft shapes.
- Add `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`.
- Self-contained only: no `<script>`, `<foreignObject>`, `<image>`, links, event attributes, or
  `url()` that is not `url(#id)`. The tool refuses those, and Desktop shows the SVG as an image
  where scripts never run anyway.
- Stay under 128 KiB. Gradients and a few dozen shapes beat thousands of tiny paths.
- Keep the middle third quiet; that is where the conversation sits.

## Pitfalls

- Never write CSS for the app itself or ask the user to edit files; Aether owns the theme.
- A light background with bright scene colours washes text out; the tool will raise `glass.tint`,
  but pick softer stops first.
- Theme names ending in "Dark" or "Light" are renamed internally ("Night", "Day"); the label the
  user sees is kept.
- `finish.levels` above the number of scene colours adds in-between shades to a dither; leave it
  at 0 for a strict palette.

## Verification

The tool result has `"ok": true` and `"status": "live"` when a Desktop window viewing this chat
applied it, or `"pending"` when it will apply on the next Desktop connection. `aether_gallery`
`list` shows the saved theme.
