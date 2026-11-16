// Themes from other creators: the theme plugins this Hermes already has (Borealis, say), shown in the
// gallery under their creator's name, switched to with one click, and recoloured the way Hermes itself
// recolours any theme (only the accent moves, saved as `<base>-accent-<hex>`). Nothing here copies or
// changes another plugin: switching asks Hermes for the theme by name, so the creator's own scene and
// styles run exactly as they made them.
//
// Hermes Desktop lists every theme's name but not which plugin made it, so the names Aether does not
// recognise go to the agent half (plugin.aether.community), which reads the installed plugins' manifests.

import { sdk } from './sdk.js'

import {
  $agentHalf,
  $community,
  $recolouring,
  $recolours,
  $themeList,
  accentParts,
  forgetRecolour,
  isAetherName,
  rememberRecolour
} from './state.js'
import { later, request } from './sync.js'

const PLUGIN_ID = 'aether'
// Hermes Desktop's own themes: never another creator's.
const HERMES_THEMES = new Set(['nous', 'nous-alt', 'github', 'catppuccin', 'everforest', 'solarized', 'classic',
  'midnight', 'ember', 'mono', 'cyberpunk', 'slate'])
const EMPTY = { themes: {}, plugins: {} }

const ours = name => HERMES_THEMES.has(name) || isAetherName(name)

/** The names worth asking about: not Hermes's own, not Aether's, and not a recolour of either. */
export function candidateNames(list) {
  const out = []
  for (const { name } of list) {
    if (!name || ours(name)) continue
    const parts = accentParts(name)
    if (parts && ours(parts.base)) continue
    out.push(name)
  }
  return out
}

let asked = ''
let pending = null

/** Ask the agent half who made the unrecognised themes, once per distinct set of names. */
export function lookUp({ force = false } = {}) {
  if (pending) return
  pending = later(() => {
    pending = null
    const names = candidateNames($themeList.get())
    const key = [...names].sort().join('\n')
    if (!force && key === asked) return
    asked = key
    if (!names.length) {
      $community.set(EMPTY)
      return
    }
    sdk.host
      .request(`plugin.${PLUGIN_ID}.community`, { names })
      .then(out => {
        if (out && out.ok) $community.set({ themes: out.themes || {}, plugins: out.plugins || {} })
      })
      .catch(() => {
        asked = '' // the agent half is off or still connecting: ask again on the next change
      })
  }, 250)
}

/**
 * The cards for the gallery: each creator's theme, followed by its recolours (yours, or ones Hermes saved
 * when you asked it for a new accent). A recolour shows only while its theme's plugin is installed.
 */
export const $communityThemes = sdk.computed([$themeList, $community, $recolours], (list, community, recolours) => {
  const listed = new Map(list.map(t => [t.name, t]))
  const bases = []
  const variants = new Map() // base -> recolour entries
  for (const [name, pluginId] of Object.entries(community.themes || {})) {
    const plugin = (community.plugins || {})[pluginId]
    const theme = listed.get(name)
    if (!plugin || !theme) continue
    const parts = accentParts(name)
    if (parts) continue // placed under its base below
    bases.push({ name, label: theme.label, description: theme.description, plugin })
  }
  const known = new Set(bases.map(b => b.name))
  const addVariant = (name, label, mine) => {
    const parts = accentParts(name)
    if (!parts || !known.has(parts.base)) return
    const row = variants.get(parts.base) || []
    if (row.some(v => v.name === name)) return
    row.push({ name, label, hex: parts.hex, mine })
    variants.set(parts.base, row)
  }
  for (const theme of Object.values(recolours)) addVariant(theme.name, theme.label, true)
  for (const theme of list) addVariant(theme.name, theme.label, false)
  bases.sort((a, b) => (a.plugin.author || '').localeCompare(b.plugin.author || '') || a.label.localeCompare(b.label))
  const out = []
  for (const base of bases) {
    out.push(base)
    for (const v of (variants.get(base.name) || []).sort((a, b) => a.label.localeCompare(b.label))) {
      out.push({ ...v, base: base.name, description: base.description, plugin: base.plugin })
    }
  }
  return out
})

/** Open the recolour dialog on another creator's theme, optionally starting from one of its recolours' accents. */
export function openRecolour(name, hex = null) {
  $recolouring.set(name ? { name, hex } : null)
}

export function closeRecolour() {
  $recolouring.set(null)
}

/** Switch to a theme by name: Hermes paints it, and its own plugin runs its own scene. */
export function switchTo(name) {
  request(name)
}

// ── recolours ────────────────────────────────────────────────────────────────────────────────────

const registered = new Map() // name -> { theme, dispose }
let ctxRef = null

/**
 * Register each saved recolour with THEMES_AREA (so Settings > Appearance and /skin list it too) while its
 * base theme is installed. Before the first theme list arrives every recolour is registered, so a recolour
 * that was on when Hermes closed is there to be restored on start.
 */
export function registerRecolours() {
  if (!ctxRef) return
  const list = $themeList.get()
  const names = new Set(list.map(t => t.name))
  for (const [name, theme] of Object.entries($recolours.get())) {
    const wanted = !list.length || names.has(theme.accentOf)
    const seen = registered.get(name)
    if (seen && (!wanted || seen.theme !== theme)) {
      seen.dispose()
      registered.delete(name)
    }
    if (wanted && !registered.has(name)) {
      registered.set(name, { theme, dispose: ctxRef.register({ id: `recolour-${name}`, area: sdk.THEMES_AREA, data: theme }) })
    }
  }
  for (const [name, entry] of registered) {
    if (!$recolours.get()[name]) {
      entry.dispose()
      registered.delete(name)
    }
  }
}

/** Save a recolour and switch to it. */
export function saveRecolour(theme) {
  if (!rememberRecolour(theme)) return false
  registerRecolours()
  request(theme.name)
  return true
}

/** Delete one of your recolours; if it is on, its creator's original takes its place. */
export function deleteRecolour(name, current) {
  const theme = $recolours.get()[name]
  if (!theme) return
  if (current === name) request(theme.accentOf)
  forgetRecolour(name)
  registerRecolours()
}

/**
 * Keep each recolour's copy of its base's styles current: when the creator updates their theme, the next
 * time it is painted its own CSS, fonts and terminal colours flow into your recolours of it.
 */
export function refreshFromBase(painted, baseName) {
  if (!painted || painted.accentOf) return
  const next = {}
  let changed = false
  for (const [name, theme] of Object.entries($recolours.get())) {
    if (theme.accentOf !== baseName) continue
    const fresh = { ...theme }
    for (const key of ['customCSS', 'typography', 'terminal', 'darkTerminal']) {
      if (painted[key] === undefined) delete fresh[key]
      else fresh[key] = painted[key]
    }
    if (JSON.stringify(fresh) !== JSON.stringify(theme)) {
      next[name] = fresh
      changed = true
    }
  }
  if (changed) for (const theme of Object.values(next)) rememberRecolour(theme)
}

/** Open the creator's page (their repo) in the browser. */
export function openCreator(url) {
  if (ctxRef && ctxRef.os && typeof ctxRef.os.openExternal === 'function' && /^https:\/\//.test(url)) {
    ctxRef.os.openExternal(url)
  }
}

export function wireCommunity(ctx) {
  ctxRef = ctx
  registerRecolours()
  const unList = $themeList.subscribe(() => {
    registerRecolours()
    lookUp()
  })
  const unRecolours = $recolours.subscribe(() => registerRecolours())
  const unAgent = $agentHalf.subscribe(on => {
    if (on) lookUp({ force: true })
  })
  ctx.onDispose(unList)
  ctx.onDispose(unRecolours)
  ctx.onDispose(unAgent)
  ctx.onDispose(() => {
    if (sdk.setAccentOverride) sdk.setAccentOverride(null)
    for (const entry of registered.values()) entry.dispose()
    registered.clear()
    ctxRef = null
  })
}
