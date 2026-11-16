import { sdk } from '../sdk.js'

import { POINTER_CHOICES, POINTER_MODES, pointerChoice } from '../pointer.js'
import { $settings, reducedMotion, updateSettings } from '../state.js'
import { Styles } from './styles.js'

const MOTION = [
  { id: 'full', label: 'Full' },
  { id: 'calm', label: 'Calm' },
  { id: 'still', label: 'Still' }
]

const STRENGTH = [
  { id: 'calm', label: 'Calm' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'vivid', label: 'Vivid' }
]

const QUALITY = [
  { id: 'battery', label: 'Battery' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'high', label: 'High' }
]

export function MotionControl({ compact = false }) {
  const settings = sdk.useValue($settings)
  return (
    <sdk.SegmentedControl
      onChange={motion => updateSettings({ motion })}
      options={MOTION}
      sizing={compact ? 'equal' : 'content'}
      value={settings.motion}
    />
  )
}

export function StrengthControl() {
  const settings = sdk.useValue($settings)
  return (
    <sdk.SegmentedControl
      onChange={strength => updateSettings({ strength })}
      options={STRENGTH}
      sizing="equal"
      value={settings.strength || 'balanced'}
    />
  )
}

function PointerSelect() {
  const settings = sdk.useValue($settings)
  const choice = pointerChoice(settings)
  return (
    <select
      aria-label="Pointer reaction"
      className="ae-select"
      onChange={event => {
        const id = event.target.value
        updateSettings({ pointer: id !== 'off', pointerMode: id === 'off' ? settings.pointerMode || 'auto' : id })
      }}
      value={choice}
    >
      {POINTER_CHOICES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  )
}

export function SettingsPage() {
  const settings = sdk.useValue($settings)
  const osReduced = reducedMotion()
  return (
    <div className="ae-settings">
      <Styles />
      <sdk.ListRow
        action={<MotionControl />}
        description="Full animates at the quality below. Calm is slower and lighter. Still paints one frame and stops."
        title="Motion"
      />
      <sdk.ListRow
        action={
          <sdk.SegmentedControl
            onChange={strength => updateSettings({ strength })}
            options={STRENGTH}
            sizing="content"
            value={settings.strength || 'balanced'}
          />
        }
        description="Balanced keeps every theme's text contrast guarantee. Vivid lets more of the scene through, so text over the brightest spots (a moon, a sun) can be harder to read. Calm suits long reading."
        title="Scene strength"
      />
      <sdk.ToggleRow
        checked={settings.followReducedMotion}
        description={osReduced
          ? 'Your system asks for reduced motion, so scenes are held still.'
          : 'Hold scenes still whenever your system asks for reduced motion.'}
        label="Follow the system's reduced motion"
        onChange={value => updateSettings({ followReducedMotion: value })}
      />
      <sdk.ToggleRow
        checked={settings.pauseUnfocused}
        description="Scenes always sleep while Hermes is hidden or minimised. This also pauses them while another app has focus."
        label="Pause when Hermes is in the background"
        onChange={value => updateSettings({ pauseUnfocused: value })}
      />
      <sdk.ListRow
        action={<PointerSelect />}
        description={'How the scene reacts while your pointer moves, then settles when you stop to read. Auto picks one for each scene: ' +
          POINTER_MODES.map(m => `${m.label.toLowerCase()} (${m.note})`).join(', ') + '. Off keeps the scene still.'}
        title="Pointer reaction"
      />
      <sdk.ListRow
        action={
          <sdk.SegmentedControl
            onChange={quality => updateSettings({ quality })}
            options={QUALITY}
            sizing="content"
            value={settings.quality}
          />
        }
        description="Frame rate and render resolution for smooth scenes. Dithered and pixel scenes are crisp at every level."
        title="Quality"
      />
      <sdk.ToggleRow
        checked={settings.toast}
        description="A short notice with Undo when Hermes or /aether changes your theme."
        label="Announce theme changes"
        onChange={value => updateSettings({ toast: value })}
      />
      <sdk.ListRow
        action={
          <sdk.Button onClick={() => sdk.host.navigate('/aether')} size="sm" variant="secondary">
            Open gallery
          </sdk.Button>
        }
        description="Presets, themes Hermes made for you, and a box to describe a new one."
        title="Theme gallery"
      />
    </div>
  )
}
