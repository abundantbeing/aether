// The colour editor: change the colours of any preset or saved theme. The scene preview follows every
// change at once; the agent half normalizes the result as you go (derived palette, readability floor)
// and says in words what it had to move. Saving a preset makes "<Preset> (custom)"; saving a theme of
// your own updates it under its own name. Without the agent half nothing can be saved, so the editor
// says so and stays read-only.

import { sdk } from '../sdk.js'
import { useEffect, useMemo, useRef, useState } from 'react'

import { $agentHalf, $catalog, $editing, closeEditor } from '../state.js'
import { later, previewColours, saveColours } from '../sync.js'
import { ScenePreview } from './preview.jsx'
import { Styles } from './styles.js'

const HEX = /^#[0-9a-f]{6}$/
const MAX_STOPS = 5
const MIN_STOPS = 2

function startingColours(record) {
  const c = record.theme.colors
  return { background: c.background, accent: c.primary, foreground: c.foreground, stops: [...record.scene.colors] }
}

function defaultLabel(record) {
  return record.source === 'preset' ? `${record.label} (custom)` : record.label
}

function asHex(text) {
  const raw = String(text || '').trim().toLowerCase()
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  return HEX.test(hex) ? hex : null
}

function Swatch({ disabled, label, onChange, onRemove, value }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="ae-sw">
      <input
        aria-label={`${label}: pick a colour`}
        className="ae-sw-pick"
        disabled={disabled}
        onChange={event => onChange(event.target.value.toLowerCase())}
        type="color"
        value={value}
      />
      <span className="ae-sw-label">{label}</span>
      <sdk.Input
        aria-label={`${label}: hex value`}
        className="ae-sw-hex"
        disabled={disabled}
        onBlur={() => setText(value)}
        onChange={event => {
          setText(event.target.value)
          const hex = asHex(event.target.value)
          if (hex) onChange(hex)
        }}
        spellCheck={false}
        value={text}
      />
      {onRemove ? (
        <button aria-label={`Remove ${label.toLowerCase()}`} className="ae-sw-x" disabled={disabled} onClick={onRemove} type="button">
          <sdk.Codicon name="close" />
        </button>
      ) : null}
    </div>
  )
}

function Editor({ base }) {
  const agent = sdk.useValue($agentHalf)
  const start = useMemo(() => startingColours(base), [base])
  const [colours, setColours] = useState(start)
  const [textChosen, setTextChosen] = useState(false)
  const [label, setLabel] = useState(() => defaultLabel(base))
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('checking') // checking | ready | saving | unavailable | error
  const [error, setError] = useState('')
  const ticket = useRef(0)

  const params = useMemo(() => {
    const out = { base: base.slug, background: colours.background, accent: colours.accent, scene_colors: colours.stops }
    if (label.trim()) out.label = label.trim()
    if (textChosen) out.foreground = colours.foreground
    return out
  }, [base, colours, label, textChosen])
  const key = JSON.stringify(params)
  const readOnly = status === 'unavailable' || agent === false

  useEffect(() => {
    if (agent === false) {
      setStatus('unavailable')
      return undefined
    }
    const mine = ++ticket.current
    setStatus(current => (current === 'unavailable' ? current : 'checking'))
    return later(async () => {
      try {
        const out = await previewColours(params)
        if (mine !== ticket.current) return
        if (out && out.ok) {
          setResult({ key, ...out })
          setError('')
          setStatus('ready')
        } else {
          setError((out && out.error) || 'These colours could not be checked.')
          setStatus('error')
        }
      } catch {
        if (mine === ticket.current) setStatus('unavailable')
      }
    }, 220)
  }, [agent, key]) // keyed on the params' content, not the object, so a re-render never re-asks

  // The scene follows the swatches at once; the palette and glass follow the agent half's answer
  // for exactly these colours, and until it lands, the closest approximation.
  const fresh = result && result.key === key ? result.record : null
  const draft = useMemo(() => {
    if (fresh) return fresh
    const known = (result && result.record) || base
    const colors = { ...known.theme.colors, background: colours.background, primary: colours.accent }
    if (textChosen) colors.foreground = colours.foreground
    return { ...base, theme: { ...base.theme, colors }, scene: { ...base.scene, glass: known.scene.glass, colors: colours.stops } }
  }, [fresh, result, base, colours, textChosen])

  const set = patch => setColours(current => ({ ...current, ...patch }))
  const setStop = (index, hex) => set({ stops: colours.stops.map((stop, i) => (i === index ? hex : stop)) })
  const removeStop = index => set({ stops: colours.stops.filter((_, i) => i !== index) })
  const addStop = () => set({ stops: [...colours.stops, colours.stops[colours.stops.length - 1]] })
  const reset = () => {
    setColours(start)
    setTextChosen(false)
    setLabel(defaultLabel(base))
  }
  const save = async () => {
    setStatus('saving')
    try {
      const out = await saveColours(params)
      if (out && out.ok) closeEditor()
      else {
        setError((out && out.error) || 'The theme could not be saved.')
        setStatus('error')
      }
    } catch {
      setStatus('unavailable')
    }
  }

  const notes = (fresh && result.notes) || []
  const changed = key !== JSON.stringify({ base: base.slug, background: start.background, accent: start.accent, scene_colors: start.stops, label: defaultLabel(base) })
  const updating = Boolean(fresh && result.replaces)
  const banner = readOnly
    ? 'Saving colours needs the Agent half of Aether on this profile (Capabilities, Plugins, Aether). Turn it on to edit and save.'
    : null

  return (
    <sdk.DialogContent banner={banner} bannerTone="warn" fitContent>
      <Styles />
      <sdk.DialogHeader>
        <sdk.DialogTitle>Colours: {base.label}</sdk.DialogTitle>
        <sdk.DialogDescription>
          Change any colour. Aether keeps text readable over the moving scene and tells you what it had to move.
        </sdk.DialogDescription>
      </sdk.DialogHeader>
      <div className="ae-ed">
        <div className="ae-ed-side">
          <ScenePreview animate={!readOnly} record={draft} />
          <div aria-live="polite" className="ae-ed-notes">
            {status === 'error' ? (
              <div className="ae-ed-note" data-tone="error" role="alert">
                {error}
              </div>
            ) : notes.length ? (
              notes.map(note => (
                <div className="ae-ed-note" key={note}>
                  {note}
                </div>
              ))
            ) : status === 'ready' ? (
              <div className="ae-ed-note" data-tone="ok">
                Readable as it is: nothing had to move.
              </div>
            ) : status === 'checking' && !readOnly ? (
              <div className="ae-ed-note" data-tone="quiet">
                Checking readability...
              </div>
            ) : null}
          </div>
        </div>
        <div className="ae-ed-fields">
          <label className="ae-ed-name">
            <span className="ae-ed-legend">Name</span>
            <sdk.Input disabled={readOnly} maxLength={40} onChange={event => setLabel(event.target.value)} value={label} />
          </label>
          <fieldset className="ae-ed-group" disabled={readOnly}>
            <legend className="ae-ed-legend">Theme</legend>
            <Swatch disabled={readOnly} label="Background" onChange={hex => set({ background: hex })} value={colours.background} />
            <Swatch disabled={readOnly} label="Accent" onChange={hex => set({ accent: hex })} value={colours.accent} />
            <Swatch
              disabled={readOnly}
              label={textChosen ? 'Text' : 'Text (automatic)'}
              onChange={hex => {
                setTextChosen(true)
                set({ foreground: hex })
              }}
              value={(fresh && fresh.theme.colors.foreground) || colours.foreground}
            />
          </fieldset>
          <fieldset className="ae-ed-group" disabled={readOnly}>
            <legend className="ae-ed-legend">Scene, calm to bright</legend>
            {colours.stops.map((stop, i) => (
              <Swatch
                disabled={readOnly}
                key={i}
                label={`Scene colour ${i + 1}`}
                onChange={hex => setStop(i, hex)}
                onRemove={colours.stops.length > MIN_STOPS ? () => removeStop(i) : null}
                value={stop}
              />
            ))}
            {colours.stops.length < MAX_STOPS ? (
              <sdk.Button disabled={readOnly} onClick={addStop} size="sm" variant="ghost">
                <sdk.Codicon name="add" /> Add a scene colour
              </sdk.Button>
            ) : null}
          </fieldset>
        </div>
      </div>
      <sdk.DialogFooter>
        <sdk.Button disabled={readOnly || !changed} onClick={reset} variant="ghost">
          Reset
        </sdk.Button>
        <sdk.Button onClick={() => closeEditor()} variant="secondary">
          Cancel
        </sdk.Button>
        <sdk.Button disabled={readOnly || status === 'saving' || status === 'error'} onClick={save}>
          {status === 'saving' ? 'Saving...' : updating ? 'Update and apply' : 'Save and apply'}
        </sdk.Button>
      </sdk.DialogFooter>
    </sdk.DialogContent>
  )
}

/** Mounted once, in the permanent title-bar slot, so the editor opens from the gallery or the chip alike. */
export function EditorHost() {
  const slug = sdk.useValue($editing)
  const catalog = sdk.useValue($catalog)
  const base = slug ? catalog[slug] : null
  if (!sdk.Dialog || !sdk.DialogContent) return null
  return (
    <sdk.Dialog onOpenChange={open => (open ? null : closeEditor())} open={Boolean(base)}>
      {base ? <Editor base={base} key={base.slug} /> : null}
    </sdk.Dialog>
  )
}
