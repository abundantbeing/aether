// The editor's Randomize button keeps a theme's character and stays in one harmony.
// Run: node tests/harmony.mjs   (part of npm run check)
//
// For every preset and many seeds: each colour keeps its lightness (so dark stays dark and the
// highlight stays bright); the background and accent sit on the harmony's hues; every coloured scene
// stop sits on one of those hues; vivid colours keep most of their vividness (no muddy shifts); the
// same seed gives the same colours; and every harmony turns up.
import { FINISHES, PRESETS } from '../desktop-src/presets.generated.js'
import { hexToOklch, randomHarmony } from '../desktop-src/harmony.js'

const SEEDS = 150
const HEX = /^#[0-9a-f]{6}$/
const failures = []
const seen = new Set()
let bgKept = 0
let bgVivid = 0

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
// Rounding to 8-bit hex moves the hue of a faint colour by a few degrees; a vivid one by well under one.
const hueSlack = chroma => Math.max(2, 0.3 / chroma)
const check = (ok, what) => ok || failures.push(what)

for (const preset of PRESETS) {
  const c = preset.theme.colors
  const current = { background: c.background, accent: c.primary, stops: preset.scene.colors }
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = randomHarmony(current, mulberry32(seed))
    const where = `${preset.label} seed ${seed} (${out.harmony})`
    seen.add(out.harmony)
    const again = randomHarmony(current, mulberry32(seed))
    check(JSON.stringify(again) === JSON.stringify(out), `${where}: not repeatable`)
    check([out.background, out.accent, ...out.stops].every(h => HEX.test(h)), `${where}: bad hex`)
    check(out.stops.length === current.stops.length, `${where}: stop count changed`)

    const pairs = [[current.background, out.background, 'background'], [current.accent, out.accent, 'accent'],
      ...current.stops.map((s, i) => [s, out.stops[i], `stop ${i + 1}`])]
    for (const [before, after, name] of pairs) {
      const gap = Math.abs(hexToOklch(before).L - hexToOklch(after).L)
      check(gap < 0.02, `${where}: ${name} lightness moved ${gap.toFixed(3)}`)
    }

    const bg = hexToOklch(out.background)
    if (bg.C > 0.03) check(hueGap(bg.h, out.anchors[0]) < hueSlack(bg.C), `${where}: background off its base hue`)
    const acc = hexToOklch(out.accent)
    const accentHue = out.anchors.length > 1 ? out.anchors[1] : out.anchors[0]
    if (acc.C > 0.03) check(hueGap(acc.h, accentHue) < hueSlack(acc.C), `${where}: accent off its harmony hue`)
    for (const [i, stop] of out.stops.entries()) {
      const s = hexToOklch(stop)
      if (s.C > 0.03) check(out.anchors.some(h => hueGap(s.h, h) < 6 + hueSlack(s.C)), `${where}: stop ${i + 1} off the harmony`)
    }

    const before = hexToOklch(current.background)
    if (before.C > 0.06) {
      bgVivid++
      if (bg.C >= before.C * 0.7) bgKept++
    }
  }
}

check(seen.size === 5, `only these harmonies turned up: ${[...seen].join(', ')}`)
check(bgVivid === 0 || bgKept / bgVivid >= 0.9, `vivid backgrounds kept their chroma only ${bgKept}/${bgVivid} times`)
check(FINISHES.length === 10, 'the generated finish list is incomplete')

if (failures.length) {
  console.error(`harmony: ${failures.length} failure(s)`)
  for (const f of failures.slice(0, 25)) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`harmony: ok (${PRESETS.length} presets x ${SEEDS} seeds; ${[...seen].length} harmonies; vivid backgrounds kept their chroma ${bgKept}/${bgVivid})`)
