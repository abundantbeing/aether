// Renders scenes as frame-exact PNG sequences, for video and promo footage. Time advances by exactly
// 1/fps per frame, so a clip never drops or doubles a frame, whatever the machine.
//
//   node tests/render_frames.mjs <preset|scene.json|all> <out-dir> [options]
//
//   <preset>      a preset by name or slug: "Event Horizon", event-horizon, aether-event-horizon
//   scene.json    a scene spec ({ engine, colors, finish, ... }), optionally wrapped as { name, scene }
//   all           every preset, each into its own folder
//
//   --width 1920 --height 1080   output size in pixels
//   --scale 1                    output pixels per CSS pixel; 2 gives a 4K frame that matches a 1080p
//                                window on a 2x display (dither cells and glyphs keep their in-app size)
//   --fps 30 --seconds 8         clip length
//   --start 23.7                 scene time of the first frame (23.7 is the composed still the app shows)
//   --motion full|calm           calm runs at the app's Calm speed
//   --finish <style>             override the finish (dither, braille, ascii, halftone, crt, glitch, ...)
//   --pixel <n>                  override the finish cell size
//   --veil                       lay the theme's glass veil over the scene, as the app does behind text
//   --pointer sweep              a slow scripted pointer drifting across the frame, reacting as in the app
//   --interaction <mode>         the reaction: auto (the scene's own default), lens, ripples, well, repel,
//                                wind or off
//   --clicks 1.5,3.2             click the pointer at these times (seconds); click rings show in ripples
//                                and repel
//   --move <seconds>             the pointer moves for this long, then rests; strength follows the app's
//                                easing (0 keeps the whole clip moving, fading in and out at the ends)
//   --hold <seconds>             how long after the pointer stops the effect stays up before it relaxes
//                                (the app holds 2.2)
//   --quality 1                  render resolution for smooth finishes (1 = full output resolution)
//   --software                   force software WebGL (otherwise the GPU is tried first)
//
// Encode a folder afterwards, for example:
//   ffmpeg -framerate 30 -i out/event-horizon/%05d.png -c:v libx264 -crf 12 -preset slow -pix_fmt yuv420p event-horizon.mp4
//   ffmpeg -framerate 30 -i out/event-horizon/%05d.png -c:v prores_ks -profile:v 3 event-horizon.mov
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from './harness/serve.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FINISH_PIXEL = { dither: 3, pixel: 6, halftone: 8, ascii: 13, braille: 12, scanlines: 3, crt: 3, glitch: 2, grain: 2, none: 1 }

function parseArgs(argv) {
  const [target, outDir, ...rest] = argv
  if (!target || !outDir) {
    console.error('usage: node tests/render_frames.mjs <preset|scene.json|all> <out-dir> [--width --height --scale --fps --seconds --start --motion --finish --pixel --veil --pointer sweep --interaction --clicks --move --hold --quality --software]')
    process.exit(2)
  }
  const opts = { width: 1920, height: 1080, scale: 1, fps: 30, seconds: 8, start: 23.7, motion: 'full', quality: 1, veil: false, software: false, pointer: 'none', interaction: 'auto', clicks: '', move: 0, hold: 2.2, finish: null, pixel: null }
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '')
    if (key === 'veil' || key === 'software') opts[key] = true
    else if (key in opts) opts[key] = typeof opts[key] === 'number' ? Number(rest[++i]) : rest[++i]
    else throw new Error(`unknown option ${rest[i]}`)
  }
  return { target, outDir: resolve(outDir), opts }
}

const slugOf = name => name.toLowerCase().replace(/^aether[- ]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function launch(software) {
  const args = software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  const browser = await chromium.launch({ args })
  const page = await browser.newPage()
  await page.goto(`${url}/tests/harness/index.html`)
  await page.waitForFunction(() => window.aether)
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'webgl'
  })
  return { browser, page, gpu }
}

const { target, outDir, opts } = parseArgs(process.argv.slice(2))
await build({ entryPoints: [resolve(root, 'tests/harness/entry.js')], bundle: true, format: 'esm', outfile: resolve(root, 'tests/harness/bundle.js'), logLevel: 'warning' })
const { server, url } = await serve(root)

let session = await launch(opts.software)
if (!session.gpu && !opts.software) {
  await session.browser.close()
  session = await launch(true)
}
const { browser, page, gpu } = session
if (!gpu) throw new Error('no WebGL in this browser')
console.log(`WebGL: ${gpu}`)

try {
  const presets = await page.evaluate(() => window.aether.PRESETS.map(p => ({ slug: p.slug, label: p.label, scene: p.scene, background: p.theme.colors.background })))
  let jobs
  if (target === 'all') {
    jobs = presets.map(p => ({ name: slugOf(p.slug), scene: p.scene, background: p.background }))
  } else if (target.endsWith('.json') && existsSync(target)) {
    const spec = JSON.parse(readFileSync(target, 'utf8'))
    jobs = [{ name: slugOf(spec.name || basename(target, '.json')), scene: spec.scene || spec, background: spec.background || '#000000' }]
  } else {
    const p = presets.find(x => slugOf(x.slug) === slugOf(target) || slugOf(x.label) === slugOf(target))
    if (!p) throw new Error(`no preset named ${target}; try one of: ${presets.map(x => x.label).join(', ')}`)
    jobs = [{ name: slugOf(p.slug), scene: p.scene, background: p.background }]
  }

  const frames = Math.max(1, Math.round(opts.fps * opts.seconds))
  for (const job of jobs) {
    const scene = { speed: 1, scale: 1, intensity: 1, density: 0.5, direction: 0, seed: 7, glass: { tint: 0.6, focus: 0.2 }, ...job.scene }
    scene.finish = { style: 'none', ...(scene.finish || {}) }
    if (opts.finish) scene.finish = { ...scene.finish, style: opts.finish, pixel: FINISH_PIXEL[opts.finish] || scene.finish.pixel }
    if (opts.pixel) scene.finish.pixel = opts.pixel
    const dir = resolve(outDir, job.name)
    mkdirSync(dir, { recursive: true })
    await page.evaluate(({ scene, opts, background }) => {
      const { SceneRenderer, modeIndex } = window.aether
      const cssW = opts.width / opts.scale
      const cssH = opts.height / opts.scale
      const glCanvas = document.createElement('canvas')
      const r = new SceneRenderer(glCanvas)
      r.setScene(scene)
      r.resize(cssW, cssH, opts.quality * opts.scale)
      const out = document.createElement('canvas')
      out.width = opts.width
      out.height = opts.height
      const g = out.getContext('2d')
      g.imageSmoothingEnabled = !['dither', 'pixel'].includes(scene.finish.style)
      const speed = (scene.speed ?? 1) * (opts.motion === 'calm' ? 0.45 : 1)
      const ease = x => x * x * (3 - 2 * x)
      const mode = opts.interaction === 'off' ? -1 : modeIndex({ pointerMode: opts.interaction }, scene.engine)
      const clicks = String(opts.clicks).split(',').map(Number).filter(n => Number.isFinite(n) && String(opts.clicks) !== '').sort((a, b) => a - b)
      const rate = k => 1 - Math.pow(1 - k, 24 / opts.fps) // the app's per-frame easing, as it runs at 24 fps
      const at = (sec, total) => {
        const u = opts.move > 0 ? Math.min(1, sec / opts.move) : (total > 0 ? sec / total : 0)
        return [0.5 + 0.3 * Math.sin(Math.PI * 2 * u * 0.85 + 0.6), 0.5 + 0.16 * Math.sin(Math.PI * 2 * u * 1.3 + 0.2)]
      }
      const sim = { x: 0, y: 0, s: 0, vx: 0, vy: 0, ready: false }
      window.renderFrame = (i, frames) => {
        const u = frames > 1 ? i / (frames - 1) : 0
        const sec = i / opts.fps
        if (opts.pointer === 'sweep') {
          const total = (frames - 1) / opts.fps
          const [tx, ty] = at(sec, total)
          if (opts.move > 0) {
            // The app's model: the drawn point eases toward the target, strength holds while the
            // pointer is fresh then relaxes, and velocity is the drawn point's own, eased.
            if (!sim.ready) { sim.x = tx * cssW; sim.y = ty * cssH; sim.ready = true }
            const px = sim.x
            const py = sim.y
            const kp = rate(0.14)
            sim.x += (tx * cssW - sim.x) * kp
            sim.y += (ty * cssH - sim.y) * kp
            const want = sec < opts.move + opts.hold ? 1 : 0
            sim.s += (want - sim.s) * rate(want ? 0.08 : 0.03)
            if (i > 0) {
              const k = cssH / opts.fps
              const kv = rate(0.3)
              sim.vx += ((sim.x - px) / k - sim.vx) * kv
              sim.vy += (-(sim.y - py) / k - sim.vy) * kv
              const m = Math.hypot(sim.vx, sim.vy)
              if (m > 1.4) { sim.vx *= 1.4 / m; sim.vy *= 1.4 / m }
            }
            r.setPointer(sim.x, sim.y, sim.s < 0.002 ? 0 : sim.s, cssW, cssH)
            r.setInteraction(mode, sim.vx, sim.vy)
          } else {
            const [nx, ny] = at(Math.max(0, sec - 1 / opts.fps), total)
            const s = ease(Math.min(1, u / 0.15)) * ease(Math.min(1, (1 - u) / 0.15))
            r.setPointer(tx * cssW, ty * cssH, s, cssW, cssH)
            r.setInteraction(mode, (tx - nx) * opts.fps * cssW / cssH, -(ty - ny) * opts.fps)
          }
          const live = clicks.filter(c => c <= sec).slice(-4)
          for (let n = 0; n < 4; n++) {
            const c = live[n]
            if (c === undefined) { r.setClick(n, 0, 0, 99, cssW, cssH); continue }
            const [cx, cy] = at(c, total)
            r.setClick(n, cx * cssW, cy * cssH, sec - c, cssW, cssH)
          }
        }
        if (!r.draw(opts.start + (i / opts.fps) * speed)) throw new Error('draw failed')
        g.globalAlpha = 1
        g.drawImage(glCanvas, 0, 0, opts.width, opts.height)
        if (opts.veil) {
          const { width: w, height: h } = out
          g.globalAlpha = scene.glass.tint
          g.fillStyle = background
          g.fillRect(0, 0, w, h)
          const grad = g.createRadialGradient(w * 0.52, h * 0.54, 0, w * 0.52, h * 0.54, Math.max(w, h) * 0.5)
          grad.addColorStop(0, background)
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          g.globalAlpha = scene.glass.focus
          g.fillStyle = grad
          g.fillRect(0, 0, w, h)
          g.globalAlpha = 1
        }
        return out.toDataURL('image/png')
      }
    }, { scene, opts, background: job.background })
    const began = Date.now()
    for (let i = 0; i < frames; i++) {
      const data = await page.evaluate(([i, n]) => window.renderFrame(i, n), [i, frames])
      writeFileSync(resolve(dir, `${String(i + 1).padStart(5, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'))
    }
    const secs = ((Date.now() - began) / 1000).toFixed(1)
    console.log(`${job.name}: ${frames} frames at ${opts.width}x${opts.height} in ${secs}s -> ${dir}`)
  }
  console.log(`encode: ffmpeg -framerate ${opts.fps} -i <folder>/%05d.png -c:v libx264 -crf 12 -preset slow -pix_fmt yuv420p <name>.mp4`)
} finally {
  await browser.close()
  server.close()
}
