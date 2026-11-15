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

export const DEFAULT_SETTINGS = {
  motion: 'full', // full | calm | still
  followReducedMotion: true,
  pauseUnfocused: false,
  pointer: true, // the scene bends a little around the pointer while it moves
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

export const $catalog = sdk.computed($saved, saved => ({ ...presetMap, ...saved }))
export const $active = sdk.computed([$catalog, $paintedName], (catalog, name) => catalog[name] || null)

let storage = null

export function bindStorage(ctxStorage) {
  storage = ctxStorage
  const settings = storage.get(SETTINGS_KEY, null)
  $settings.set({ ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) })
  const saved = storage.get(SAVED_KEY, {})
  $saved.set(saved && typeof saved === 'object' ? sanitizeSaved(saved) : {})
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
