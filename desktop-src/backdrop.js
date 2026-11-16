// The backdrop: one fixed layer behind the whole window, plus one style tag that lets it show
// through. Both exist only while an Aether theme is painted; turning the theme off, disabling the
// plugin or reloading it removes them.
//
// The style applies the same rules Desktop's own Window Glass mode uses (styles.css, the
// `[data-hermes-glass]` block): the three field surface tokens go transparent, the app shell's
// full-window painters stop filling, and surfaces that declare `data-glass-opaque` /
// `data-glass-raised` keep their fills. The painters are found through the documented
// window-glass hook alone: `[data-contrib-shell]` and the elements that contain it, so no
// app-internal markup is named. Raised content
// (cards, menus, bubbles, the composer) is untouched, so it stays fully opaque over the scene.
//
// Motion runs through the SDK's createBudgetedLoop: an fps budget, parked while the window is hidden
// or minimised, and fully stopped on dispose.

import { cssFallback, SceneRenderer, svgDataUrl, svgLooksSafe } from './renderer.js'
import { makeLoop } from './loop.js'
import { CLICK_SLOTS, modeIndex } from './pointer.js'
import { effectiveMotion, QUALITY } from './state.js'

const LAYER_ID = 'aether-backdrop'
const STYLE_ID = 'aether-backdrop-style'
const ATTR = 'data-aether-backdrop'
const STILL_TIME = 23.7 // a composed moment, not the first frame of every field
const STRENGTH = {
  calm: { tint: 1.18, focus: 1.6 },
  balanced: { tint: 1, focus: 1 },
  vivid: { tint: 0.7, focus: 0 }
}

const CSS = `
:root[${ATTR}] {
  background-color: transparent !important;
  --ui-chat-surface-background: transparent;
  --ui-sidebar-surface-background: transparent;
  --ui-editor-surface-background: transparent;
  --ui-terminal-surface-background: var(--ui-bg-chrome);
}
:root[${ATTR}] body { background: transparent !important; }
:root[${ATTR}] [data-contrib-shell],
:root[${ATTR}] :has([data-contrib-shell]) { background-color: transparent !important; }
:root[${ATTR}] [data-glass-opaque] {
  --ui-chat-surface-background: var(--ui-bg-chrome);
  --ui-editor-surface-background: var(--ui-bg-chrome);
  --ui-sidebar-surface-background: var(--ui-bg-sidebar);
}
:root[${ATTR}] [data-glass-raised] {
  --ui-chat-surface-background: color-mix(in srgb, var(--ui-bg-chrome) 94%, transparent);
  --ui-sidebar-surface-background: color-mix(in srgb, var(--ui-bg-sidebar) 94%, transparent);
  --ui-editor-surface-background: var(--ui-bg-chrome);
}
#${LAYER_ID} {
  position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; contain: strict;
  background: var(--ui-bg-chrome);
}
#${LAYER_ID} > .aether-scene {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover;
  opacity: 0; transition: opacity 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
#${LAYER_ID} > .aether-scene[data-ready] { opacity: 1; }
#${LAYER_ID} > .aether-scene[data-leaving] { transition: none; }
#${LAYER_ID} > canvas.aether-scene[data-crisp] { image-rendering: pixelated; }
#${LAYER_ID} > .aether-veil {
  position: absolute; inset: 0;
  /* Calm edges for the title bar and status bar (small, dimmer text), the focus area behind the
     conversation column, then the even veil the readability floor is computed against. */
  background:
    linear-gradient(to bottom, color-mix(in srgb, var(--ui-bg-chrome) 70%, transparent) 0, transparent 56px),
    linear-gradient(to top, color-mix(in srgb, var(--ui-bg-chrome) 82%, transparent) 0, transparent 64px),
    radial-gradient(ellipse 62% 78% at 52% 54%,
      color-mix(in srgb, var(--ui-bg-chrome) var(--aether-focus, 30%), transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-chrome) var(--aether-tint, 60%), transparent);
  transition: background 400ms ease;
}
@media (prefers-reduced-motion: reduce) {
  #${LAYER_ID} > .aether-scene { transition: none; }
}
`

class Backdrop {
  constructor() {
    this.record = null
    this.key = ''
    this.layer = null
    this.style = null
    this.scene = null
    this.renderer = null
    this.loop = null
    this.time = STILL_TIME
    this.lastNow = 0
    this.settings = null
    this.ctx = null
    this.offResize = null
    this.offPointer = null
    this.offClick = null
    this.mode = -1
    this.clicksOn = false
    this.onResize = () => this.resize()
    // Pointer reaction: the target follows the mouse; the drawn point eases toward it each frame, and
    // its strength fades out after a short rest so a reader's still cursor never warps the page. The
    // velocity is the eased point's own, so it dies as the point settles. Clicks go in a small ring
    // buffer; each ring ages on its own and is spent after a couple of seconds.
    this.pointerTarget = { x: -1, y: -1, at: 0 }
    this.pointerNow = { x: -1, y: -1, s: 0, vx: 0, vy: 0 }
    this.clickX = new Float32Array(CLICK_SLOTS)
    this.clickY = new Float32Array(CLICK_SLOTS)
    this.clickAt = new Float64Array(CLICK_SLOTS)
    this.clickNext = 0
    this.onClick = event => {
      if (!this.clicksOn) return
      const i = this.clickNext
      this.clickNext = (i + 1) % CLICK_SLOTS
      this.clickX[i] = event.clientX
      this.clickY[i] = event.clientY
      this.clickAt[i] = performance.now()
    }
    this.onPointer = event => {
      this.pointerTarget = { x: event.clientX, y: event.clientY, at: performance.now() }
      if (this.pointerNow.x < 0) this.pointerNow = { x: event.clientX, y: event.clientY, s: 0, vx: 0, vy: 0 }
    }
  }

  /** Listeners and timers go through ctx so the plugin host retires them on unload. */
  attach(ctx) {
    this.ctx = ctx
  }

  show(record, settings) {
    const key = `${record.slug}:${record.updated_at}:${JSON.stringify(settings)}`
    if (key === this.key && this.layer) return
    const sceneChanged = !this.record || this.record.slug !== record.slug || this.record.updated_at !== record.updated_at
    this.key = key
    this.record = record
    this.settings = settings
    this.mount()
    const glass = record.scene.glass || {}
    // Balanced is the theme's own veil, the one its readability floor was computed for. Vivid thins
    // it for people who want the scene first; Calm thickens it for long reading sessions.
    const strength = STRENGTH[settings.strength] || STRENGTH.balanced
    const tint = Math.min(0.95, (glass.tint ?? 0.6) * strength.tint)
    const focus = Math.min(0.9, (glass.focus ?? 0.3) * strength.focus)
    this.layer.style.setProperty('--aether-tint', `${Math.round(tint * 100)}%`)
    this.layer.style.setProperty('--aether-focus', `${Math.round(focus * 100)}%`)
    if (sceneChanged || !this.scene) this.buildScene(record.scene)
    this.mode = modeIndex(settings, record.scene.engine)
    // Battery keeps the cheapest path: the pointer reaction stays, click rings do not.
    this.clicksOn = this.mode >= 0 && settings.quality !== 'battery'
    if (!this.clicksOn) this.clickAt.fill(0)
    this.restartLoop()
  }

  mount() {
    if (!this.style || !this.style.isConnected) {
      this.style = document.createElement('style')
      this.style.id = STYLE_ID
      this.style.textContent = CSS
      document.head.appendChild(this.style)
    }
    if (!this.layer || !this.layer.isConnected) {
      this.layer = document.createElement('div')
      this.layer.id = LAYER_ID
      this.layer.setAttribute('aria-hidden', 'true')
      const veil = document.createElement('div')
      veil.className = 'aether-veil'
      this.layer.append(veil)
      document.body.prepend(this.layer)
      this.offResize = this.ctx ? this.ctx.addEventListener(window, 'resize', this.onResize) : null
      this.offPointer = this.ctx ? this.ctx.addEventListener(window, 'pointermove', this.onPointer, { passive: true }) : null
      this.offClick = this.ctx ? this.ctx.addEventListener(window, 'pointerdown', this.onClick, { passive: true, capture: true }) : null
    }
    document.documentElement.setAttribute(ATTR, '')
  }

  buildScene(scene) {
    this.retireScene()
    const finish = (scene.finish && scene.finish.style) || 'none'
    let node
    if (scene.engine === 'svg' && finish === 'none' && svgLooksSafe(scene.svg)) {
      node = document.createElement('img')
      node.alt = ''
      node.decoding = 'async'
      node.onload = () => node.setAttribute('data-ready', '')
      node.src = svgDataUrl(scene.svg)
    } else {
      node = document.createElement('canvas')
      const renderer = new SceneRenderer(node)
      if (renderer.ok) {
        try {
          renderer.setScene(scene)
          this.renderer = renderer
        } catch (error) {
          console.warn('[aether] scene failed to compile, using a gradient', error)
          renderer.dispose()
        }
      }
      if (!this.renderer) {
        node = document.createElement('div')
        node.style.background = cssFallback(scene)
        node.setAttribute('data-ready', '')
      } else if (finish === 'dither' || finish === 'pixel') {
        node.setAttribute('data-crisp', '')
      }
    }
    node.className = 'aether-scene'
    // Above the scene it replaces (which holds until it is covered), below the veil.
    this.layer.insertBefore(node, this.layer.querySelector('.aether-veil'))
    this.scene = node
    this.time = STILL_TIME
    this.resize()
  }

  resize() {
    if (!this.renderer || !this.settings) return
    const q = QUALITY[this.settings.quality] || QUALITY.balanced
    this.renderer.resize(window.innerWidth, window.innerHeight, q.scale)
    this.paintOnce()
  }

  paintOnce() {
    if (this.renderer && this.renderer.draw(this.time)) this.scene.setAttribute('data-ready', '')
  }

  restartLoop() {
    if (this.loop) this.loop.dispose()
    this.loop = null
    if (!this.renderer) return
    const motion = effectiveMotion(this.settings)
    const q = QUALITY[this.settings.quality] || QUALITY.balanced
    const speed = (this.record.scene.speed ?? 1) * (motion === 'calm' ? 0.45 : 1)
    if (motion === 'still' || speed === 0) {
      this.paintOnce()
      // An SVG with a finish is rasterised from an animating image; give it a moment to load.
      if (this.record.scene.engine === 'svg' && this.ctx) this.ctx.setTimeout(() => this.paintOnce(), 300)
      return
    }
    const fps = motion === 'calm' ? Math.min(15, q.fps) : q.fps
    this.lastNow = 0
    this.loop = makeLoop(now => {
      const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1000) : 0
      this.lastNow = now
      this.time += dt * speed
      this.stepPointer(dt)
      if (this.renderer && this.renderer.draw(this.time)) this.scene.setAttribute('data-ready', '')
    }, fps, Boolean(this.settings.pauseUnfocused))
  }

  /** Hand the current scene off to fade out under the new one, then free it. */
  retireScene() {
    if (this.loop) this.loop.dispose()
    this.loop = null
    const node = this.scene
    const renderer = this.renderer
    this.scene = null
    this.renderer = null
    if (!node) return
    node.setAttribute('data-leaving', '')
    const free = () => {
      node.remove()
      if (renderer) renderer.dispose()
    }
    if (this.ctx) this.ctx.setTimeout(free, 900)
    else free()
  }

  stepPointer(dt) {
    if (!this.renderer) return
    const now = performance.now()
    const enabled = this.mode >= 0
    const fresh = now - this.pointerTarget.at < 2200
    const want = enabled && fresh && this.pointerTarget.x >= 0 ? 1 : 0
    const p = this.pointerNow
    const w = window.innerWidth
    const h = window.innerHeight
    const px = p.x
    const py = p.y
    p.x += (this.pointerTarget.x - p.x) * 0.14
    p.y += (this.pointerTarget.y - p.y) * 0.14
    p.s += (want - p.s) * (want ? 0.08 : 0.03)
    // Velocity in field units (screen heights) per second, eased and capped so a flick stays gentle.
    if (dt > 0 && px >= 0) {
      const k = Math.max(1, h) * dt
      p.vx += ((p.x - px) / k - p.vx) * 0.3
      p.vy += (-(p.y - py) / k - p.vy) * 0.3
      const m = Math.hypot(p.vx, p.vy)
      if (m > 1.4) { p.vx *= 1.4 / m; p.vy *= 1.4 / m }
    }
    this.renderer.setPointer(p.x, p.y, p.s < 0.002 ? 0 : p.s, w, h)
    this.renderer.setInteraction(this.mode, p.vx, p.vy)
    for (let i = 0; i < CLICK_SLOTS; i++) {
      const at = this.clickAt[i]
      this.renderer.setClick(i, this.clickX[i], this.clickY[i], at ? (now - at) / 1000 : 99, w, h)
    }
  }

  disposeScene() {
    if (this.loop) this.loop.dispose()
    this.loop = null
    if (this.renderer) this.renderer.dispose()
    this.renderer = null
    if (this.scene) this.scene.remove()
    this.scene = null
  }

  hide() {
    this.disposeScene()
    if (this.layer) this.layer.remove()
    if (this.style) this.style.remove()
    if (this.offResize) this.offResize()
    if (this.offPointer) this.offPointer()
    if (this.offClick) this.offClick()
    document.documentElement.removeAttribute(ATTR)
    this.offResize = null
    this.offPointer = null
    this.offClick = null
    this.layer = null
    this.style = null
    this.record = null
    this.key = ''
  }
}

export const backdrop = new Backdrop()
