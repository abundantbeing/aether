// A status-bar chip that exists only while an Aether theme is on: the theme's name with a slow
// breathing dot; click for motion controls, the colour editor, the gallery and off.

import { useState } from 'react'

import { sdk } from '../sdk.js'

import { $active, openEditor } from '../state.js'
import { turnOff } from '../sync.js'
import { MotionControl, StrengthControl } from './settings.jsx'
import { Styles } from './styles.js'

export function StatusChip() {
  const active = sdk.useValue($active)
  // controlled, so choosing an action closes the menu instead of leaving it over the gallery or the editor
  const [open, setOpen] = useState(false)
  if (!active) return null
  const run = fn => () => {
    setOpen(false)
    fn()
  }
  return (
    <sdk.Popover onOpenChange={setOpen} open={open}>
      <sdk.PopoverTrigger asChild>
        <button aria-label={`Aether theme: ${active.label}`} className="ae-chip" type="button">
          <Styles />
          <span className="ae-dot" data-on="" />
          {active.label}
        </button>
      </sdk.PopoverTrigger>
      <sdk.PopoverContent align="end" side="top">
        <div className="ae-pop">
          <div className="ae-pop-title">{active.label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ui-text-secondary)' }}>{active.description}</div>
          <MotionControl compact />
          <StrengthControl />
          <div style={{ display: 'flex', gap: 6 }}>
            <sdk.Button onClick={run(() => openEditor(active.slug))} size="sm" variant="secondary">
              Customise
            </sdk.Button>
            <sdk.Button onClick={run(() => sdk.host.navigate('/aether'))} size="sm" variant="secondary">
              Gallery
            </sdk.Button>
            <sdk.Button onClick={run(() => turnOff())} size="sm" variant="ghost">
              Off
            </sdk.Button>
          </div>
        </div>
      </sdk.PopoverContent>
    </sdk.Popover>
  )
}
