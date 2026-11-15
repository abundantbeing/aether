// Aether: living themes for Hermes Desktop.
//
// What this registers, all through the plugin SDK:
// - every preset and saved theme in THEMES_AREA (Settings > Appearance, the theme picker, /skin);
// - a backdrop host in the titleBar.center slot, the SDK's permanent mount point, which follows the
//   painted theme: an Aether theme paints its scene behind the window, any other theme removes it;
// - the /aether gallery page, a Settings > Plugins page, palette commands, an Appearance card,
//   a status-bar chip while a scene is on, the ::aether-theme transcript card and a colour editor;
// - the link to the agent half: plugin.aether.* RPC and the plugin.aether.theme session event.

import { sdk } from './sdk.js'
import { useEffect } from 'react'

import { backdrop } from './backdrop.js'
import { PRESETS } from './presets.generated.js'
import {
  $active,
  $catalog,
  $paintedName,
  $settings,
  $themeName,
  bindStorage,
  updateSettings
} from './state.js'
import { applyRecord, bindSync, registerThemes, sync, turnOff, wireSync } from './sync.js'
import { ThemeCardDirective } from './ui/card.jsx'
import { StatusChip } from './ui/chip.jsx'
import { EditorHost } from './ui/editor.jsx'
import { Gallery } from './ui/gallery.jsx'
import { ScenePreview } from './ui/preview.jsx'
import { MotionControl, SettingsPage } from './ui/settings.jsx'
import { Styles } from './ui/styles.js'

const ROUTE = '/aether'

// The painted theme's name carries the mode (`<name>-dark`); Aether names never end in a mode word.
const baseName = name => String(name || '').replace(/-(light|dark)$/, '')

function BackdropHost() {
  const { theme, themeName } = sdk.useTheme()
  const active = sdk.useValue($active)
  const settings = sdk.useValue($settings)
  const painted = baseName(theme && theme.name)

  useEffect(() => {
    $themeName.set(themeName)
  }, [themeName])

  useEffect(() => {
    $paintedName.set(painted)
  }, [painted])

  useEffect(() => {
    if (active) backdrop.show(active, settings)
    else backdrop.hide()
  }, [active, settings])

  // The colour editor lives here too: this slot is always mounted, and the dialog portals out of it.
  return <EditorHost />
}

function AppearanceCard() {
  const active = sdk.useValue($active)
  const picks = PRESETS.slice(0, 4)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
      <Styles />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Living themes</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ui-text-secondary)' }}>
            {active ? `${active.label} is on. ` : ''}Animated scenes from Aether, or ask Hermes to paint your own.
          </div>
        </div>
        <sdk.Button onClick={() => sdk.host.navigate(ROUTE)} size="sm" variant="secondary">
          Open gallery
        </sdk.Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {picks.map(record => (
          <button
            className="ae-card"
            data-active={active && active.slug === record.slug ? '' : undefined}
            key={record.slug}
            onClick={() => applyRecord(record, { origin: 'user' })}
            title={record.label}
            type="button"
          >
            <ScenePreview mock={false} record={record} />
            <div className="ae-card-body">
              <div className="ae-card-title">{record.label}</div>
            </div>
          </button>
        ))}
      </div>
      {active ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--ui-text-tertiary)' }}>Motion</span>
          <MotionControl compact />
        </div>
      ) : null}
    </div>
  )
}

function paletteCommands() {
  const commands = [
    { id: 'aether.gallery', label: 'Aether: Open theme gallery', keywords: ['theme', 'background', 'wallpaper', 'backdrop'], run: () => sdk.host.navigate(ROUTE) },
    { id: 'aether.off', label: 'Aether: Turn the backdrop off', keywords: ['theme', 'background'], run: () => turnOff() },
    {
      id: 'aether.motion',
      label: 'Aether: Cycle motion (full, calm, still)',
      keywords: ['animation', 'pause', 'reduce'],
      run: () => {
        const order = ['full', 'calm', 'still']
        const next = order[(order.indexOf($settings.get().motion) + 1) % order.length]
        updateSettings({ motion: next })
        sdk.host.notify({ kind: 'info', title: 'Aether', message: `Motion: ${next}`, durationMs: 2500 })
      }
    },
    {
      id: 'aether.describe',
      label: 'Aether: Describe a new theme...',
      keywords: ['make', 'create', 'theme', 'ask'],
      run: () => sdk.host.composer.setDraft && sdk.host.composer.setDraft(null, 'Make me an Aether theme for Hermes Desktop: ')
    }
  ]
  return commands.map(data => ({ id: data.id, area: sdk.PALETTE_AREA, data }))
}

export default {
  id: 'aether',
  name: 'Aether',
  register(ctx) {
    bindStorage(ctx.storage)
    bindSync(ctx)
    backdrop.attach(ctx)
    ctx.onDispose(() => backdrop.hide())

    registerThemes($catalog.get())
    const unCatalog = $catalog.subscribe(catalog => registerThemes(catalog))
    ctx.onDispose(unCatalog)

    ctx.register({ id: 'backdrop-host', area: sdk.TITLEBAR_AREAS.center, render: () => <BackdropHost /> })
    ctx.register({ id: 'page', area: sdk.ROUTES_AREA, data: { path: ROUTE }, render: () => <Gallery /> })
    ctx.registerMany(paletteCommands())
    ctx.register({ id: 'chip', area: sdk.STATUSBAR_AREAS.right, order: 140, render: () => <StatusChip /> })

    if (sdk.APPEARANCE_AREAS && sdk.APPEARANCE_AREAS.extra) {
      ctx.register({ id: 'appearance', area: sdk.APPEARANCE_AREAS.extra, render: () => <AppearanceCard /> })
    }
    if (typeof sdk.TRANSCRIPT_DIRECTIVE_AREA === 'string') {
      ctx.register({
        id: 'theme-card',
        area: sdk.TRANSCRIPT_DIRECTIVE_AREA,
        data: { name: 'aether-theme', render: props => <ThemeCardDirective {...props} /> }
      })
    }
    if (ctx.registerSettingsPage) {
      ctx.registerSettingsPage({ id: 'settings', title: 'Aether', icon: 'sparkle', render: () => <SettingsPage /> })
    }

    wireSync(ctx)
    sync()
  }
}

