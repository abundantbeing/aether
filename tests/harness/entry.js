// Harness entry: the real renderer, shaders and presets, bundled for a plain browser page.
import { PRESETS } from '../../desktop-src/presets.generated.js'
import { SceneRenderer } from '../../desktop-src/renderer.js'
import { ENGINES, FINISHES } from '../../desktop-src/shader.js'

window.aether = { ENGINES, FINISHES, PRESETS, SceneRenderer }
