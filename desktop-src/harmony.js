// Colour harmony for the editor's Randomize button.
//
// A theme's character lives in its values: how dark the background is, how bright the highlight, how
// vivid the accent. Randomizing keeps every colour's lightness and chroma in OKLCH (where equal numbers
// look equally light and equally vivid) and only gives the colours new hues, taken from one classic
// harmony around a random base hue: analogous, complementary, split complementary, triadic or
// monochrome. The background takes the base hue, the accent the harmony's contrasting hue, and the
// scene runs from the base hue at its calm end toward the other hues at its bright end, so most of the
// picture stays in one family with the contrast saved for the highlights.
//
// The base hue is chosen where sRGB can actually hold the background's and accent's chroma at their
// lightness, so a vivid blue never turns into a muddy olive and a dark background never goes brown.
// The agent half still applies the readability floor to whatever comes out.

const HARMONIES = [
  { id: 'analogous', label: 'Analogous', weight: 3, offsets: rng => { const s = 24 + rng() * 16; return [0, s, -s] } },
  { id: 'complementary', label: 'Complementary', weight: 3, offsets: () => [0, 180] },
  { id: 'split', label: 'Split complementary', weight: 2, offsets: rng => { const s = 24 + rng() * 12; return [0, 180 - s, 180 + s] } },
  { id: 'triadic', label: 'Triadic', weight: 2, offsets: () => [0, 120, 240] },
  { id: 'monochrome', label: 'Monochrome', weight: 1, offsets: () => [0] }
]

// Upper bounds of OKLCH hue ranges and the word people use for them.
const HUE_NAMES = [
  [12, 'pink'], [40, 'red'], [65, 'orange'], [95, 'gold'], [120, 'yellow'], [160, 'green'], [185, 'teal'],
  [225, 'cyan'], [275, 'blue'], [310, 'violet'], [345, 'magenta'], [361, 'pink']
]

const ACCENT_MIN_CHROMA = 0.12 // an accent has to read as a colour
const ACCENT_NEEDED_CHROMA = 0.18 // vivid enough for an accent; past this, more hues are worth having
const INNER_MIN_CHROMA = 0.05 // mid-scene stops get a little colour even when the preset had none
const JITTER = 12 // degrees, so stops sharing a hue are not identical

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const wrap = h => ((h % 360) + 360) % 360

function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const inGamut = lin => lin.every(c => c >= -1e-4 && c <= 1 + 1e-4)

function linearAt(L, C, h) {
  const rad = (h * Math.PI) / 180
  return oklabToLinear(L, C * Math.cos(rad), C * Math.sin(rad))
}

/** OKLCH {L, C, h} of a #rrggbb colour. */
export function hexToOklch(hex) {
  const n = parseInt(String(hex).slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLinear(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), h: wrap((Math.atan2(B, A) * 180) / Math.PI) }
}

/** The most chroma sRGB can show at this lightness and hue. */
export function maxChroma(L, h) {
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(linearAt(L, mid, h))) lo = mid
    else hi = mid
  }
  return lo
}

/** #rrggbb for OKLCH, reducing chroma (never lightness or hue) until it fits sRGB. */
export function oklchToHex(L, C, h) {
  const lightness = Math.min(1, Math.max(0, L))
  const chroma = Math.min(Math.max(0, C), maxChroma(lightness, wrap(h)))
  return (
    '#' +
    linearAt(lightness, chroma, wrap(h))
      .map(c => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255))
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

export function hueName(h) {
  const hue = wrap(h)
  return HUE_NAMES.find(([top]) => hue < top)[1]
}

function pickHarmony(rng) {
  const total = HARMONIES.reduce((sum, h) => sum + h.weight, 0)
  let roll = rng() * total
  for (const harmony of HARMONIES) {
    roll -= harmony.weight
    if (roll < 0) return harmony
  }
  return HARMONIES[0]
}

// How much of a colour's chroma survives at a new hue (1 = all of it). Near-greys always fit. Yellow
// to olive hues only look like themselves when light; darker, they read as mud, so they score low.
function fit(colour, h) {
  if (colour.C < 0.03) return 1
  const kept = Math.min(1, maxChroma(colour.L, h) / colour.C)
  const hue = wrap(h)
  return hue > 60 && hue < 130 && colour.L < 0.62 ? kept * 0.5 : kept
}

const sameHex = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()

/**
 * New colours for {background, accent, stops} in one harmony, keeping each colour's lightness and
 * chroma. Returns {harmony, label, hue, anchors, background, accent, stops}; `rng` is Math.random
 * unless a test passes a seeded one.
 */
export function randomHarmony(current, rng = Math.random) {
  const bg = hexToOklch(current.background)
  const acc = hexToOklch(current.accent)
  const accChroma = Math.max(acc.C, ACCENT_MIN_CHROMA)
  const harmony = pickHarmony(rng)
  const offsets = harmony.offsets(rng)
  const accentOffset = offsets.length > 1 ? offsets[1] : 0

  let best = null
  for (let i = 0; i < 48; i++) {
    const h0 = rng() * 360
    const score = Math.min(fit(bg, h0), fit({ L: acc.L, C: Math.min(accChroma, ACCENT_NEEDED_CHROMA) }, h0 + accentOffset))
    if (!best || score > best.score) best = { h0, score }
    if (score >= 0.92) break
  }
  const anchors = offsets.map(o => wrap(best.h0 + o))
  const background = oklchToHex(bg.L, bg.C, anchors[0])
  const accent = oklchToHex(acc.L, accChroma, wrap(best.h0 + accentOffset))

  const n = current.stops.length
  const stops = current.stops.map((hex, i) => {
    if (sameHex(hex, current.background)) return background
    if (sameHex(hex, current.accent)) return accent
    const stop = hexToOklch(hex)
    const t = n > 1 ? i / (n - 1) : 0
    const k = Math.min(anchors.length - 1, Math.floor(t ** 1.5 * anchors.length))
    const midTone = i > 0 && i < n - 1 && stop.L > 0.25 && stop.L < 0.85
    const chroma = midTone ? Math.max(stop.C, INNER_MIN_CHROMA) : stop.C
    return oklchToHex(stop.L, chroma, anchors[k] + (rng() - 0.5) * JITTER)
  })

  return { harmony: harmony.id, label: harmony.label, hue: hueName(anchors[0]), anchors, background, accent, stops }
}
