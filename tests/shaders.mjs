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
  const modeResults = await page.evaluate(async () => {
    const { ENGINES, POINTER_MODES, SceneRenderer } = window.aether
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#222"/><circle cx="5" cy="5" r="3" fill="#eee"/></svg>'
    const top = [0x40, 0x60, 0x80]
    const out = []
    const canvas = document.createElement('canvas')
    const r = new SceneRenderer(canvas)
    const read = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const grab = () => {
      read.canvas.width = r.canvas.width; read.canvas.height = r.canvas.height
      read.drawImage(r.canvas, 0, 0)
      return read.getImageData(0, 0, read.canvas.width, read.canvas.height).data
    }
    const W = 240, H = 150
    for (const engine of ENGINES) {
      for (const style of ['none', 'dither']) {
        r.setScene({ engine, colors: ['#05060f', '#203050', '#304868', '#406080'], speed: 1, scale: 1, intensity: 1,
          density: 0.6, direction: 15, seed: 7, svg, finish: { style, pixel: 3, levels: 0, pattern: 'bayer4' } })
        r.resize(W, H, 1)
        if (engine === 'svg' && r.svgImage && !r.svgImage.complete) await new Promise(ok => { r.svgImage.onload = ok; r.svgImage.onerror = ok })
        for (const mode of POINTER_MODES) {
          const key = `${engine}/${style}/${mode.id}`
          try {
            r.setInteraction(-1, 0, 0); r.setPointer(0, 0, 0, W, H)
            for (let i = 0; i < 4; i++) r.setClick(i, 0, 0, 99, W, H)
            if (!r.draw(23.7)) { out.push({ key, skipped: true }); continue }
            const base = grab().slice()
            // At rest (strength 0, no live clicks) the mode must change nothing.
            r.setInteraction(mode.index, 0.6, 0.2)
            r.draw(23.7)
            const rest = grab()
            let restDiff = 0
            for (let i = 0; i < rest.length; i += 4) if (rest[i] !== base[i] || rest[i + 1] !== base[i + 1] || rest[i + 2] !== base[i + 2]) restDiff++
            // Pointer moving, with two live click rings.
            r.setPointer(W * 0.45, H * 0.5, 1, W, H)
            r.setClick(0, W * 0.6, H * 0.4, 0.7, W, H)
            r.setClick(1, W * 0.3, H * 0.6, 1.5, W, H)
            r.draw(23.7)
            const px = grab()
            const colours = new Set()
            let diff = 0
            let over = 0
            for (let i = 0; i < px.length; i += 4) {
              if (i % 28 === 0) colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
              if (px[i] !== base[i] || px[i + 1] !== base[i + 1] || px[i + 2] !== base[i + 2]) diff++
              if (px[i] > top[0] + 1 || px[i + 1] > top[1] + 1 || px[i + 2] > top[2] + 1) over++
            }
            out.push({ key, colours: colours.size, diff, restDiff, over })
          } catch (error) {
            out.push({ key, error: String(error.message || error).slice(0, 300) })
          }
        }
      }
    }
    return out
  })
  const modeFailed = modeResults.filter(r => r.error || (!r.skipped && (r.colours < 2 || r.restDiff > 0 || r.over > 0 || (r.diff === 0 && !/^(svg)\//.test(r.key)))))
  for (const r of modeFailed) console.error(`FAIL ${r.key}: ${r.error || `colours ${r.colours}, effect pixels ${r.diff}, changed at rest ${r.restDiff}, brighter than the ramp top ${r.over}`}`)
  const failed = results.filter(r => r.error || (r.colours !== undefined && r.colours < 2)).concat(modeFailed)
  for (const r of failed.filter(x => !modeFailed.includes(x))) console.error(`FAIL ${r.key}: ${r.error || 'flat frame'}`)
  const ok = results.filter(r => r.colours >= 2).length
  const modesOk = modeResults.filter(r => !r.skipped && !modeFailed.includes(r)).length
  console.log(`shaders: ${ok} programs compiled and painted, ${results.filter(r => r.skipped).length} skipped, ${modeResults.length} pointer-mode paints (${modesOk} ok, still at rest, within the ramp), ${failed.length} failed`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
  server.close()
}
