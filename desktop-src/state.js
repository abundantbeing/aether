// Renderer-side state. The backend (plugin-data/aether/themes.json, per profile) is authoritative
// for saved themes; this module caches every theme it has seen in ctx.storage so they stay
// registered across restarts and profile switches, and so the gallery works before the gateway is up.

import { sdk } from './sdk.js'

import { PRESETS } from './presets.generated.js'

export const SETTINGS_KEY = 'settings.v1'
export const SAVED_KEY = 'saved.v1'
export const PREVIOUS_KEY = 'previous.v1'
export const SEEN_PENDING_KEY = 'pending-seen.v1'
export const UNDO_KEY = 'undo.v1'
export const RECOLOURS_KEY = 'recolours.v1'

export const DEFAULT_SETTINGS = {
  motion: 'full', // full | calm | still
  followReducedMotion: true,
  pauseUnfocused: false,
  pointer: true, // false keeps meaning Off (older saves)
  pointerMode: 'auto', // auto | lens | ripples | well | repel | wind | off: how the scene reacts to the pointer
  strength: 'balanced', // calm | balanced | vivid: how much the glass veil covers the scene
  quality: 'balanced', // battery | balanced | high
  toast: true
}

const presetMap = Object.fromEntries(PRESETS.map(r => [r.slug, r]))

export const $saved = sdk.atom({})
export const $settings = sdk.atom({ ...DEFAULT_SETTINGS })
/** The committed theme name, published by the backdrop host (the only place useTheme runs). */
export const $themeName = sdk.atom('')
/** The painted theme name: the committed one, or the one a picker is previewing on hover. */
export const $paintedName = sdk.atom('')
/** True once the agent half answered plugin.aether.state on this connection. */
export const $agentHalf = sdk.atom(null)
/** The slug whose colours the editor is open on, or '' when it is closed. */
export const $editing = sdk.atom('')

/** Every theme Hermes Desktop lists ({ name, label, description }), published by the backdrop host. */
export const $themeList = sdk.atom([])
/** Which installed plugin made each theme Aether does not recognise, as the agent half read it. */
export const $community = sdk.atom({ themes: {}, plugins: {} })
/** Accent recolours of other creators' themes, saved on this computer: name -> DesktopTheme. */
export const $recolours = sdk.atom({})
/** The recolour dialog: `{ name, hex }` for the other creator's theme it is open on, or null. */
export const $recolouring = sdk.atom(null)

export function openEditor(slug) {
  $editing.set(typeof slug === 'string' ? slug : '')
}

export function closeEditor() {
  $editing.set('')
}

export const $catalog = sdk.computed($saved, saved => ({ ...presetMap, ...saved }))
export const $active = sdk.computed([$catalog, $paintedName], (catalog, name) => catalog[name] || null)

let storage = null

export function bindStorage(ctxStorage) {
  storage = ctxStorage
  const settings = storage.get(SETTINGS_KEY, null)
  $settings.set({ ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) })
  const saved = storage.get(SAVED_KEY, {})
  $saved.set(saved && typeof saved === 'object' ? sanitizeSaved(saved) : {})
  const recolours = storage.get(RECOLOURS_KEY, {})
  $recolours.set(recolours && typeof recolours === 'object' ? sanitizeRecolours(recolours) : {})
}

const ACCENT_NAME = /^(.+)-accent-([0-9a-f]{6})$/

/** `{ base, hex }` for a saved accent's name (`<base>-accent-<hex>`, Hermes's own naming), else null. */
export function accentParts(name) {
  const match = ACCENT_NAME.exec(typeof name === 'string' ? name : '')
  return match ? { base: match[1], hex: `#${match[2]}` } : null
}

function isRecolour(theme) {
  const parts = theme && accentParts(theme.name)
  const colors = theme && theme.colors
  return Boolean(parts) && theme.accentOf === parts.base && typeof theme.label === 'string' && colors &&
    ['background', 'foreground', 'primary'].every(key => typeof colors[key] === 'string')
}

function sanitizeRecolours(map) {
  const out = {}
  for (const [name, theme] of Object.entries(map)) if (isRecolour(theme) && theme.name === name) out[name] = theme
  return out
}

export function rememberRecolour(theme) {
  if (!isRecolour(theme)) return false
  const next = { ...$recolours.get(), [theme.name]: theme }
  $recolours.set(next)
  if (storage) storage.set(RECOLOURS_KEY, next)
  return true
}

export function forgetRecolour(name) {
  const next = { ...$recolours.get() }
  if (!next[name]) return
  delete next[name]
  $recolours.set(next)
  if (storage) storage.set(RECOLOURS_KEY, next)
}

function isRecord(r) {
  return r && typeof r === 'object' && typeof r.slug === 'string' && r.slug.startsWith('aether-') &&
    r.theme && r.theme.colors && r.scene && typeof r.scene.engine === 'string'
}

function sanitizeSaved(saved) {
  const out = {}
  for (const [slug, r] of Object.entries(saved)) if (isRecord(r) && !presetMap[slug]) out[slug] = r
  return out
}

export function updateSettings(patch) {
  const next = { ...$settings.get(), ...patch }
  $settings.set(next)
  if (storage) storage.set(SETTINGS_KEY, next)
}

export function rememberRecords(records) {
  const next = { ...$saved.get() }
  let changed = false
  for (const r of records || []) {
    if (!isRecord(r) || presetMap[r.slug]) continue
    const prev = next[r.slug]
    if (!prev || prev.updated_at !== r.updated_at) {
      next[r.slug] = r
      changed = true
    }
  }
  if (changed) {
    $saved.set(next)
    if (storage) storage.set(SAVED_KEY, next)
  }
  return changed
}

export function forgetRecord(slug) {
  const next = { ...$saved.get() }
  if (!next[slug]) return
  delete next[slug]
  $saved.set(next)
  if (storage) storage.set(SAVED_KEY, next)
}

export function isAetherName(name) {
  return typeof name === 'string' && Boolean($catalog.get()[name])
}

export function previousTheme() {
  return (storage && storage.get(PREVIOUS_KEY, '')) || ''
}

export function setPreviousTheme(name) {
  if (storage && name && !isAetherName(name)) storage.set(PREVIOUS_KEY, name)
}

/** Remember the theme an Aether theme replaced, so every Undo returns to exactly that one. */
export function rememberReplaced(slug, replaced) {
  if (!storage || !slug || !replaced || replaced === slug) return
  const map = storage.get(UNDO_KEY, {})
  const next = { ...(map && typeof map === 'object' ? map : {}), [slug]: replaced }
  const keys = Object.keys(next)
  for (const key of keys.slice(0, Math.max(0, keys.length - 60))) delete next[key]
  storage.set(UNDO_KEY, next)
}

/** Where Undo goes for a theme: what it replaced, else the last non-Aether theme, else Nous. */
export function undoTarget(slug) {
  const map = (storage && storage.get(UNDO_KEY, {})) || {}
  const target = map[slug]
  return (target && target !== slug && target) || previousTheme() || 'nous'
}

export function seenPending(id) {
  const seen = (storage && storage.get(SEEN_PENDING_KEY, [])) || []
  return Array.isArray(seen) && seen.includes(id)
}

export function markPendingSeen(id) {
  if (!storage) return
  const seen = storage.get(SEEN_PENDING_KEY, [])
  const next = [...(Array.isArray(seen) ? seen : []), id].slice(-20)
  storage.set(SEEN_PENDING_KEY, next)
}

export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** The motion actually used: the user's choice, overridden to still by the OS setting when followed. */
export function effectiveMotion(settings) {
  if (settings.followReducedMotion && reducedMotion()) return 'still'
  return settings.motion
}

export const QUALITY = {
  battery: { fps: 12, scale: 0.35 },
  balanced: { fps: 24, scale: 0.5 },
  high: { fps: 30, scale: 0.75 }
}
