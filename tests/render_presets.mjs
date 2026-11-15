// Renders each preset's scene (with its glass veil) to PNGs for visual review.
// Run: node tests/render_presets.mjs <out-dir> [width height time]
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from './harness/serve.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [outDir = resolve(root, 'tests/out'), W = '960', H = '600', T = '23.7', VEIL = '1'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
await build({ entryPoints: [resolve(root, 'tests/harness/entry.js')], bundle: true, format: 'esm', outfile: resolve(root, 'tests/harness/bundle.js'), logLevel: 'warning' })
const { server, url } = await serve(root)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage()
  await page.goto(`${url}/tests/harness/index.html`)
  await page.waitForFunction(() => window.aether)
  const shots = await page.evaluate(async ({ w, h, t, veil }) => {
    const { PRESETS, SceneRenderer } = window.aether
    const out = []
    const gl = document.createElement('canvas')
    const r = new SceneRenderer(gl)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    for (const p of PRESETS) {
      r.setScene(p.scene)
      r.resize(w, h, 0.75)
      r.draw(t)
      const crisp = ['dither', 'pixel'].includes(p.scene.finish.style)
      g.imageSmoothingEnabled = !crisp
      g.drawImage(gl, 0, 0, w, h)
      if (veil) {
        const bg = p.theme.colors.background
        g.globalAlpha = p.scene.glass.tint; g.fillStyle = bg; g.fillRect(0, 0, w, h)
        const grad = g.createRadialGradient(w * 0.52, h * 0.54, 0, w * 0.52, h * 0.54, Math.max(w, h) * 0.5)
        grad.addColorStop(0, bg); grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.globalAlpha = p.scene.glass.focus; g.fillStyle = grad; g.fillRect(0, 0, w, h); g.globalAlpha = 1
      }
      out.push({ slug: p.slug, data: c.toDataURL('image/png') })
    }
    return out
  }, { w: Number(W), h: Number(H), t: Number(T), veil: VEIL === '1' })
  for (const s of shots) writeFileSync(resolve(outDir, `${s.slug}.png`), Buffer.from(s.data.split(',')[1], 'base64'))
  console.log(`rendered ${shots.length} presets to ${outDir}`)
} finally {
  await browser.close()
  server.close()
}
