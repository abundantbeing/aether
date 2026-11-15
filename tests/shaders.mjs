// Compiles every engine x finish program in headless Chromium's WebGL and checks each frame paints
// more than one colour (a shader that compiles but draws a flat field is a bug too).
// Run: node tests/shaders.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve } from './harness/serve.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await build({
  entryPoints: [resolve(root, 'tests/harness/entry.js')], bundle: true, format: 'esm',
  outfile: resolve(root, 'tests/harness/bundle.js'), logLevel: 'warning'
})
const { server, url } = await serve(root)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage()
  await page.goto(`${url}/tests/harness/index.html`)
  await page.waitForFunction(() => window.aether)
  const results = await page.evaluate(async () => {
    const { ENGINES, FINISHES, SceneRenderer } = window.aether
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#222"/><circle cx="5" cy="5" r="3" fill="#eee"/></svg>'
    const out = []
    const canvas = document.createElement('canvas')
    const r = new SceneRenderer(canvas)
    if (!r.ok) return [{ key: 'webgl', error: 'no WebGL context' }]
    const read = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    for (const engine of ENGINES) {
      for (const style of FINISHES) {
        const key = `${engine}/${style}`
        try {
          r.setScene({ engine, colors: ['#05060f', '#3e5bff', '#ffd700', '#ffffff'], speed: 1, scale: 1, intensity: 0.9,
            density: 0.6, direction: 15, seed: 7, svg, finish: { style, pixel: 6, levels: 0, pattern: 'bayer4' } })
          r.resize(240, 150, 1)
          if (engine === 'svg' && r.svgImage && !r.svgImage.complete) await new Promise(ok => { r.svgImage.onload = ok; r.svgImage.onerror = ok })
          const drew = r.draw(23.7)
          if (engine === 'svg' && !drew) { out.push({ key, skipped: 'svg image still loading' }); continue }
          read.canvas.width = r.canvas.width; read.canvas.height = r.canvas.height
          read.drawImage(r.canvas, 0, 0)
          const px = read.getImageData(0, 0, read.canvas.width, read.canvas.height).data
          const colours = new Set()
          for (let i = 0; i < px.length; i += 4 * 7) colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
          out.push({ key, colours: colours.size })
        } catch (error) {
          out.push({ key, error: String(error.message || error).slice(0, 300) })
        }
      }
    }
    return out
  })
  const failed = results.filter(r => r.error || (r.colours !== undefined && r.colours < 2))
  for (const r of failed) console.error(`FAIL ${r.key}: ${r.error || 'flat frame'}`)
  const ok = results.filter(r => r.colours >= 2).length
  console.log(`shaders: ${ok} programs compiled and painted, ${results.filter(r => r.skipped).length} skipped, ${failed.length} failed`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  server.close()
}
