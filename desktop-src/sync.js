// Theme registration, apply/undo, and the link to the agent half.
//
// Inbound: `plugin.aether.theme` session events (the agent or /aether applied something in a chat
// this window is viewing). Sync: `plugin.aether.state` over the gateway JSON-RPC on connect, profile
// switch and after one of our tools completes, which also picks up a theme made while no window was
// watching (the pending slot) exactly once.

import { sdk } from './sdk.js'

import {
  $catalog,
  $agentHalf,
  $settings,
  $themeName,
  forgetRecord,
  isAetherName,
  markPendingSeen,
  previousTheme,
  rememberRecords,
  rememberReplaced,
  seenPending,
  setPreviousTheme,
  undoTarget
} from './state.js'

const PLUGIN_ID = 'aether'
const registered = new Map() // slug -> { updated_at, dispose }
let ctxRef = null

export function bindSync(ctx) {
  ctxRef = ctx
}

/** A timer the plugin host retires on unload. */
export function later(fn, ms) {
  return ctxRef ? ctxRef.setTimeout(fn, ms) : () => {}
}

/** Register every catalog theme with THEMES_AREA so it shows in Appearance, the theme picker and /skin. */
export function registerThemes(catalog) {
  if (!ctxRef) return
  for (const [slug, record] of Object.entries(catalog)) {
    const seen = registered.get(slug)
    if (seen && seen.updated_at === record.updated_at) continue
    if (seen) seen.dispose()
    const dispose = ctxRef.register({ id: `theme-${slug}`, area: sdk.THEMES_AREA, data: record.theme })
    registered.set(slug, { updated_at: record.updated_at, dispose })
  }
  for (const [slug, entry] of registered) {
    if (!catalog[slug]) {
      entry.dispose()
      registered.delete(slug)
    }
  }
}

export function request(name, theme, attempt = 0) {
  if (sdk.requestTheme(name)) return true
  // The registration lands on the next registry tick; a fresh theme can need one more frame.
  if (attempt < 8 && ctxRef) ctxRef.setTimeout(() => request(name, theme, attempt + 1), 40)
  return false
}

export function applyRecord(record, { origin = 'user', toast = true } = {}) {
  if (!record || !record.slug) return
  const current = $themeName.get()
  if (current && !isAetherName(current)) setPreviousTheme(current)
  if (current && current !== record.slug) rememberReplaced(record.slug, current)
  rememberRecords([record])
  registerThemes($catalog.get())
  request(record.slug)
  if (toast && $settings.get().toast && origin !== 'user') {
    const back = undoTarget(record.slug)
    sdk.host.notify({
      kind: 'info',
      icon: 'sparkle',
      title: 'Aether',
      message: `${record.label} is on`,
      meta: record.description,
      durationMs: 7000,
      action: { label: 'Undo', onClick: () => request(back) },
      secondaryAction: { label: 'Gallery', onClick: () => sdk.host.navigate('/aether') }
    })
  }
}

/** Undo one theme: back to the theme it replaced. */
export function undo(slug) {
  request(undoTarget(slug))
}

export function turnOff() {
  const back = previousTheme() || 'nous'
  if (isAetherName($themeName.get())) request(back)
}

export async function deleteSaved(slug) {
  if (!slug || !$catalog.get()[slug] || $catalog.get()[slug].source === 'preset') return
  if ($themeName.get() === slug) turnOff()
  forgetRecord(slug)
  registerThemes($catalog.get())
  try {
    await sdk.host.request(`plugin.${PLUGIN_ID}.delete`, { slug })
  } catch {
    // The agent half is off or on another profile: the local copy is gone, which is what was asked.
  }
}

/** The colour editor's choices, normalized by the agent half exactly as a save would be. Writes nothing. */
export function previewColours(params) {
  return sdk.host.request(`plugin.${PLUGIN_ID}.preview`, params)
}

/** Save the colour editor's theme for this profile, then apply it with the usual notice and Undo. */
export async function saveColours(params) {
  const out = await sdk.host.request(`plugin.${PLUGIN_ID}.save`, params)
  if (out && out.ok && out.record) applyRecord(out.record, { origin: 'editor' })
  return out
}

function handleEvent(event) {
  const payload = (event && event.payload) || {}
  if (payload.action === 'apply' && payload.record) applyRecord(payload.record, { origin: payload.origin || 'agent' })
  else if (payload.action === 'off') turnOff()
}

let syncing = null
// A plugin RPC can fail for a moment right after the window reloads or reconnects. Retry a few times, further
// apart each time, before treating the agent half as missing (the editor is read-only without it).
let retryCtx = null
let retries = 0
const MAX_RETRIES = 6

export function sync() {
  if (syncing) return syncing
  syncing = (async () => {
    try {
      const state = await sdk.host.request(`plugin.${PLUGIN_ID}.state`, {})
      $agentHalf.set(true)
      retries = 0
      if (state && Array.isArray(state.themes)) {
        rememberRecords(state.themes)
        registerThemes($catalog.get())
      }
      const pending = state && state.pending
      if (pending && pending.id && !seenPending(pending.id)) {
        markPendingSeen(pending.id)
        if (pending.action === 'off') turnOff()
        else if (pending.slug && $catalog.get()[pending.slug]) applyRecord($catalog.get()[pending.slug], { origin: 'pending' })
        sdk.host.request(`plugin.${PLUGIN_ID}.ack`, { id: pending.id }).catch(() => {})
      }
    } catch {
      // Method not found: the agent half is not enabled for this profile. Presets still work.
      $agentHalf.set(false)
      if (retryCtx && retries < MAX_RETRIES) {
        retries += 1
        retryCtx.setTimeout(() => sync(), 700 * retries)
      }
    } finally {
      syncing = null
    }
  })()
  return syncing
}

export function wireSync(ctx) {
  retryCtx = ctx
  retries = 0
  ctx.onEvent(`plugin.${PLUGIN_ID}.theme`, handleEvent)
  ctx.onEvent('tool.complete', event => {
    const p = (event && event.payload) || {}
    const name = p.name || p.tool_name || p.tool || ''
    if (typeof name === 'string' && name.startsWith('aether_')) ctx.setTimeout(() => sync(), 150)
  })
  let lastGateway = ''
  let lastProfile = ''
  const unGateway = sdk.host.state.gateway.subscribe(state => {
    if (state === 'open' && lastGateway !== 'open') sync()
    lastGateway = state
  })
  const unProfile = sdk.host.state.profile.subscribe(profile => {
    if (lastProfile && profile !== lastProfile) sync()
    lastProfile = profile
  })
  ctx.onDispose(unGateway)
  ctx.onDispose(unProfile)
  ctx.onDispose(() => {
    retryCtx = null
    for (const entry of registered.values()) entry.dispose()
    registered.clear()
  })
}

/** Straight to Aether's own page in Settings > Plugins, from anywhere in the app. */
export function openSettings() {
  sdk.host.navigate(sdk.pluginSettingsHref ? sdk.pluginSettingsHref(PLUGIN_ID) : '/settings')
}
