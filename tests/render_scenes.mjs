// Renders arbitrary scenes to PNG for art direction: node tests/render_scenes.mjs <scenes.json> <out-dir> [w h time]
// scenes.json: [{ "name": "...", "scene": { engine, colors, finish, ... } }, ...]
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from './harness/serve.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [file, outDir, W = '960', H = '600', T = '23.7'] = process.argv.slice(2)
const scenes = JSON.parse(readFileSync(file, 'utf8'))
mkdirSync(outDir, { recursive: true })
await build({ entryPoints: [resolve(root, 'tests/harness/entry.js')], bundle: true, format: 'esm', outfile: resolve(root, 'tests/harness/bundle.js'), logLevel: 'warning' })
const { server, url } = await serve(root)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage()
  await page.goto(`${url}/tests/harness/index.html`)
  await page.waitForFunction(() => window.aether)
  const shots = await page.evaluate(async ({ scenes, w, h, t }) => {
    const { SceneRenderer } = window.aether
    const gl = document.createElement('canvas')
    const r = new SceneRenderer(gl)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    const out = []
    for (const { name, scene } of scenes) {
      const s = { speed: 1, scale: 1, intensity: 1, density: 0.5, direction: 0, seed: 7, finish: { style: 'none' }, ...scene }
      try {
        r.setScene(s)
        r.resize(w, h, 0.75)
        r.draw(t)
        g.imageSmoothingEnabled = !['dither', 'pixel'].includes(s.finish.style)
        g.drawImage(gl, 0, 0, w, h)
        out.push({ name, data: c.toDataURL('image/png') })
      } catch (error) {
        out.push({ name, error: String(error.message || error) })
      }
    }
    return out
  }, { scenes, w: Number(W), h: Number(H), t: Number(T) })
  for (const s of shots) {
    if (s.error) console.error(`${s.name}: ${s.error}`)
    else writeFileSync(resolve(outDir, `${s.name}.png`), Buffer.from(s.data.split(',')[1], 'base64'))
  }
  console.log(`rendered ${shots.filter(s => !s.error).length}/${shots.length} scenes to ${outDir}`)
} finally {
  await browser.close()
  server.close()
}
