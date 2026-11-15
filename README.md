<p align="center">
  <img src="docs/catalog-cover.jpg" alt="Aether: living themes for Hermes Desktop" width="1200">
</p>

**Living themes for Hermes Desktop.** Tell Hermes the look you want ("a slow dithered sunset over the sea", "a black hole, but gold", "my terminal, amber and raining") and it paints a full palette plus an animated scene behind your chats. Or pick one of eighteen hand-tuned scenes: auroras over still lakes, dawn over the edge of the world, a neon city in the rain, a temple above the clouds in Nous blue and gold.

![Asking Hermes for a dithered sunset: the theme, the scene and a preview card with Undo](docs/screenshots/hero-agent-theme.png)

Screenshots show the actual plugin in the Hermes Webapp (the Desktop renderer in a browser), driven through a real Hermes gateway.

## What you get

- **Ask for any look.** Describe a mood, a place, a palette or a texture in any chat. Hermes picks the scene, the colours and the finish, calls `aether_theme`, and the window you are chatting in repaints a moment later. Ask for changes the same way ("slower", "more violet", "less busy").
- **Eighteen scenes worth looking at.** Landscapes, skies, space, a city and the Hermes brand itself, each animated, most of them dithered.
- **Twenty-four scene engines, ten finishes.** A Greek temple, wings in flight, mountains, auroras, cloud seas, moonlit water, dunes, black holes, planets, skylines, blossoms, engraved rays and more, printed smooth, dithered (Bayer 2x2, 4x4, 8x8 or blue noise, down to one bit), as halftone dots, in ascii, in braille, with film grain, scanlines, a full CRT (phosphor mask, colour fringing, curved glass), occasional glitch bursts, or as chunky pixels.
- **It reacts to you.** The scene bends gently around your pointer like a lens drifting under glass, then settles when you stop to read. Switching themes dissolves one scene into the next.
- **Text stays readable, always.** Every theme is held to a floor: body text 7:1 on its background, secondary text 4.5:1, accents 3:1, and body text 4.5:1 over the brightest part of the moving scene once the glass veil is laid over it. When a request would break that, Aether moves the colour (hue kept) or thickens the veil and says exactly what it changed.
- **Your call on intensity.** Scene strength is Balanced by default (the readability floor), Vivid when you want the scene first, Calm for long reading sessions.
- **A real theme, not a wallpaper.** Each Aether theme registers with Hermes Desktop like a built-in: it shows in Settings, Appearance, the theme picker and `/skin`, it is remembered per profile, and picking any other theme removes the scene.
- **Undo, everywhere it changed.** A short notice with Undo when Hermes or `/aether` changes your theme, and a live preview card with Undo right in the conversation that made it.
- **Motion that sleeps.** Scenes pause while Hermes is hidden or minimised, hold still when your system asks for reduced motion, and offer Full, Calm and Still plus a Battery, Balanced or High quality setting.

## The scenes

![All eighteen scenes in Hermes](docs/screenshots/presets.png)

| Scene | What it is |
|---|---|
| Olympus | A temple above the clouds, its roof lifted on the light of an engraved sun, in Nous blue (#0000F2) and gold |
| Cyanotype | Nous blue ink stippled through paper, drifting like a print still developing |
| Aether | Northern lights pouring over a mountain lake, mirrored in still water |
| Alpenglow | Ranges fading into a violet dusk, valley fog drifting between them |
| Event Horizon | A black hole wearing its own light: the disk bent into a burning ring |
| Earthrise | Dawn breaking over the edge of the world, city lights on the night side |
| Selene | A full moon laying a road of light across a quiet night sea |
| Mirage | Golden-hour dunes, sand streaming off their crests |
| Above the Clouds | A sea of cloud at first light, seen from the window seat |
| After Hours | A neon city in the rain, its windows doubled in the wet street |
| Hanami | Cherry boughs overhead and petals drifting down through spring light |
| Helios | A striped sun over an endless grid, dithered like an old arcade cabinet |
| Talaria | Silver wings at full speed over a sea of cloud, feathers torn loose by the wind |
| Styx | Dark river contours drifting slowly |
| Phosphor | The classic Hermes amber terminal, raining in text characters |
| Caduceus Gold | Sparks rising in the gold-to-bronze of the Hermes banner |
| Folio | Mountains in one-bit ink on paper, like a page from a field journal |
| Pocket | A moonlit sea in four shades of handheld green |

### The gallery

Open it from the command palette (Aether: Open theme gallery), the status-bar chip, or Settings, Plugins, Aether. Every card is a live preview of the theme with a small mock of the app painted in its colours; hover to animate. The box at the top hands your description to Hermes in a fresh chat.

![The Aether gallery](docs/screenshots/gallery.png)

### Balanced and Vivid

![Selene at Balanced and at Vivid](docs/screenshots/strength-balanced-vivid.png)

## Install

You need Hermes 0.23.1 or newer with Hermes Desktop (or the Webapp).

```bash
hermes plugins install abundantbeing/aether --enable
```

Then, in Hermes Desktop:

1. Open **Capabilities, Plugins** and select **Aether**.
2. Confirm **Agent** is enabled. This gives Hermes the theme tools, the `/aether` command and the design skill.
3. Enable **Desktop**. This adds the scenes, the gallery, the status chip and the settings page. The Desktop half is opt-in.
4. Ask Hermes for a theme, or run **Aether: Open theme gallery** from the command palette.

Use the same Hermes profile for installation and Desktop. No API keys or extra services are needed.

## Using it

- **Ask in any chat.** "Make me a background like rainy Tokyo at night", "something calm for late-night coding", "Selene, but in gold". Hermes finds `aether_theme` through tool search and calls it.
- **Slash command.** `/aether` opens a picker, `/aether event horizon` applies one, `/aether off` returns to your previous theme, `/aether list` lists everything.
- **From another app.** Ask from Telegram or the CLI and the theme is saved; Hermes Desktop applies it the next time it connects to that profile.
- **The status chip.** While a scene is on, the status bar shows its name. Click it for motion, scene strength, the gallery and Off.
- **Settings, Plugins, Aether.** Motion, scene strength, reduced motion, pointer reaction, pausing in the background, quality, and whether theme changes are announced.

![The /aether slash command applying Event Horizon](docs/screenshots/slash-command.png)

### Changing a theme's colours

Every card in the gallery has a **Colours** button (so does the status chip, for the theme that is on). It opens an editor with the theme's background, accent, text and 2 to 5 scene colours, and a live preview of the scene. As you change them, Aether checks readability exactly as it does for Hermes's themes and says in plain words what it had to move, for example an accent lightened so it stays visible. **Save and apply** keeps the result for this profile: a preset becomes "Selene (custom)" next to the original, and a theme of your own is updated in place. You can also just ask: "Selene, but gold" starts from Selene and changes only the colours. Saving needs the Agent half; without it the editor shows the colours read-only.

## How it works

```mermaid
flowchart LR
  subgraph Agent["Hermes agent (Python half)"]
    T["aether_theme / aether_gallery<br/>/aether"] --> N["normalize: palette from seeds,<br/>readability floor, scene clamps,<br/>SVG guard"]
    N --> S[("plugin-data/aether/themes.json<br/>(per profile)")]
    N -- "ctx.emit_to_session<br/>plugin.aether.theme" --> E
    R["RPC plugin.aether.state / ack / delete<br/>preview / save (colour editor)"] --- S
  end
  subgraph Desktop["Hermes Desktop (desktop/plugin.js)"]
    E["session event"] --> A["THEMES_AREA + requestTheme"]
    A --> H["backdrop host (titleBar.center)"]
    H --> G["WebGL scene + glass veil<br/>createBudgetedLoop"]
    Y["sync on connect / profile switch"] --- R
  end
```

A theme reaches the Desktop window that is viewing the chat through a session event, so asking in one window never repaints another window on a different profile. When nobody is viewing (the request came from a messaging app), the theme waits in a pending slot that the next Desktop to connect applies once.

Every scene is a fixed shader that ships with the plugin; the agent only chooses parameters. A hand-written SVG scene is checked on the agent side (no script, no foreign content, no external references, no event attributes) and is only ever shown as an image, where the browser runs no script and fetches nothing.

## Privacy and disclosure

- **No network calls of its own, no telemetry, no credentials.** The Desktop half talks only to your configured Hermes backend through the plugin SDK.
- **Fonts.** A theme may pick one of five UI fonts. Choosing Inter, IBM Plex Sans, Space Grotesk or Courier Prime loads that font from Google Fonts through Hermes Desktop's own theme typography, the same way Hermes's built-in themes load Courier Prime. JetBrains Mono ships with the app. The default keeps your current font and loads nothing.
- **Pointer.** With pointer reaction on, the Desktop half listens to pointer movement inside the Hermes window to bend the scene. Nothing is recorded or sent anywhere.
- **Stored data:** themes Hermes made, in `<hermes home>/plugin-data/aether/themes.json` for each profile. Desktop preferences (motion, strength, quality) and a cache of seen themes are in the app's own plugin storage on your machine.
- **Desktop surface:** only the documented SDK (`ctx.register`, `ctx.registerSettingsPage`, `ctx.onEvent`, `ctx.storage`, `ctx.setTimeout`, `ctx.addEventListener`, `host.request`, `host.composer`, `host.notify`, `requestTheme`, `useTheme`, `createBudgetedLoop`, `DecodeText`, `Dialog` and `Input` (the colour editor), the `titleBar.center` and `statusBar.right` slots, `THEMES_AREA`, `TRANSCRIPT_DIRECTIVE_AREA`). While a scene is on, it adds one fixed layer behind the window and one style tag that applies Desktop's own Window Glass transparent-surface rules under its own `data-aether-backdrop` attribute. The app shell is found only through `[data-contrib-shell]`, the documented window-glass hook; no app-internal markup is named. Turning the theme off or disabling the plugin removes all three.
- **No tools beyond its own two, no hooks, no shell commands, no background processes, no self-update, no binaries, no third-party code.**

## Compatibility and known limits

- Needs Hermes 0.23.1 or newer (session events and plugin RPC). The Desktop half feature-detects newer SDK pieces.
- Scenes need WebGL. Without it, a theme falls back to a still gradient of its colours.
- A plugin theme registers when the Desktop half loads, so the very first frame of a cold start paints your previous palette for a moment.
- Tested in the Hermes Webapp (the Desktop renderer) on Linux with software WebGL. Native macOS and Windows windows use the same renderer and SDK but have not been runtime-verified yet.
- At Vivid strength, text that crosses the brightest part of a scene can fall below the readability floor. Balanced always holds it.
- A main-branch checkout of Hermes reports the last tag on its own branch (0.22.x), so the loader skips plugins that require 0.23.x there. Install on a release, or lower `requires_hermes` in your local copy.

## Development

The Desktop half is written in `desktop-src/` and bundled with esbuild into `desktop/plugin.js`, which is what Hermes loads and what reviewers read. The presets are defined once in `_presets.py`; `scripts/gen_presets.py` writes them, normalized by the same code the agent uses, into the Desktop bundle.

```bash
npm install
npm run build                 # presets + desktop/plugin.js
npm run check                 # presets in sync, house lint, every shader compiles and paints

# Python: contract tests (including 300 fuzzed themes) and end-to-end tests through Hermes's real
# plugin discovery
cd tests && python -m pytest -q

# Catalog admission check, in a scratch HERMES_HOME
hermes plugins validate .
```

`tests/shaders.mjs` compiles every engine and finish pair (240 programs) in headless Chromium and checks each paints more than one colour. `tests/render_presets.mjs` and `tests/render_scenes.mjs` render presets or any scene spec to PNG for art direction.

`tests/render_frames.mjs` renders any preset (or `all` of them, or a scene spec) as a frame-exact PNG sequence for video, up to 4K, with optional finish override, glass veil and a scripted pointer sweep:

```bash
node tests/render_frames.mjs "Event Horizon" out --width 3840 --height 2160 --scale 2 --fps 60 --seconds 10 --pointer sweep
ffmpeg -framerate 60 -i out/event-horizon/%05d.png -c:v libx264 -crf 12 -preset slow -pix_fmt yuv420p event-horizon.mp4
```

## Credits

OKLab and OKLCH by Bjorn Ottosson. The cyanotype, gold and amber palettes and Nous blue follow the Hermes Agent and Nous Research visual identity; this is an unofficial community plugin and Hermes and Nous Research belong to their owners.

MIT licence, see [LICENSE](LICENSE).
