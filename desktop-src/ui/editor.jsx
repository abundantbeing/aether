// The editor: change the colours and the finish of any preset or saved theme. The scene preview follows
// every change at once; the agent half normalizes the result as you go (derived palette, readability
// floor, the glass measured again for the finish) and says in words what it had to move.
// Saving a preset makes "<Preset> (custom)", or "<Preset>, <finish>" when only the finish changed;
// saving a theme of your own updates it under its own name. Without the agent half nothing can be
// saved, so the editor says so and stays read-only.

import { sdk } from '../sdk.js'
import { useEffect, useMemo, useRef, useState } from 'react'

import { FINISHES } from '../presets.generated.js'
import { $agentHalf, $catalog, $editing, closeEditor } from '../state.js'
import { later, previewColours, saveColours } from '../sync.js'
import { ScenePreview } from './preview.jsx'
import { Styles } from './styles.js'

const HEX = /^#[0-9a-f]{6}$/
const MAX_STOPS = 5
const MIN_STOPS = 2
const FINISH_NAMES = {
  none: 'Smooth', dither: 'Dither', halftone: 'Halftone', ascii: 'ASCII', braille: 'Braille',
  grain: 'Grain', scanlines: 'Scanlines', crt: 'CRT', glitch: 'Glitch', pixel: 'Pixel'
}
const PICKER_ORDER = ['none', 'dither', 'halftone', 'ascii', 'braille', 'pixel', 'crt', 'scanlines', 'glitch', 'grain']
const SIZED = new Set(['dither', 'pixel', 'halftone', 'ascii', 'braille', 'scanlines', 'crt'])
const PATTERNS = [['bayer2', 'Bayer 2'], ['bayer4', 'Bayer 4'], ['bayer8', 'Bayer 8'], ['noise', 'Blue noise']]
const FINISH_BY_STYLE = Object.fromEntries(FINISHES.map(f => [f.style, f]))

function startingColours(record) {
  const c = record.theme.colors
  return { background: c.background, accent: c.primary, foreground: c.foreground, stops: [...record.scene.colors] }
}

function startingFinish(record) {
  const f = record.scene.finish || {}
  return { style: f.style || 'none', pixel: f.pixel || 2, pattern: f.pattern || 'bayer4' }
}

const sameFinish = (a, b) => a.style === b.style && a.pixel === b.pixel && a.pattern === b.pattern

function finishWord(style) {
  const name = FINISH_NAMES[style] || style
  return name === name.toUpperCase() ? name : name.toLowerCase()
}

function autoLabel(record, coloursChanged, finishChanged, style) {
  if (record.source !== 'preset') return record.label
  if (finishChanged && !coloursChanged) return `${record.label}, ${finishWord(style)}`
  return `${record.label} (custom)`
}

const sentence = text => text.charAt(0).toUpperCase() + text.slice(1) + '.'

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

function FinishPicker({ disabled, finish, onChange, start }) {
  const pick = style => {
    if (style === finish.style) return
    // Back to the theme's own finish keeps its own size and pattern; a new one starts from its defaults.
    if (style === start.style) onChange(start)
    else onChange({ style, pixel: (FINISH_BY_STYLE[style] || {}).pixel || 2, pattern: 'bayer4' })
  }
  return (
    <fieldset className="ae-ed-group" disabled={disabled}>
      <legend className="ae-ed-legend">Finish</legend>
      <div aria-label="Finish" className="ae-fin" role="group">
        {PICKER_ORDER.filter(style => FINISH_BY_STYLE[style]).map(style => (
          <button
            aria-pressed={finish.style === style}
            className="ae-fin-opt"
            disabled={disabled}
            key={style}
            onClick={() => pick(style)}
            title={sentence(FINISH_BY_STYLE[style].description)}
            type="button"
          >
            {FINISH_NAMES[style] || style}
          </button>
        ))}
      </div>
      {SIZED.has(finish.style) ? (
        <label className="ae-fin-row">
          <span className="ae-sw-label">Size</span>
          <input
            aria-label="Finish size"
            className="ae-fin-range"
            disabled={disabled}
            max={24}
            min={1}
            onChange={event => onChange({ ...finish, pixel: Number(event.target.value) })}
            step={1}
            type="range"
            value={finish.pixel}
          />
          <span className="ae-fin-val">{finish.pixel}px</span>
        </label>
      ) : null}
      {finish.style === 'dither' ? (
        <div className="ae-fin-row">
          <span className="ae-sw-label">Pattern</span>
          <div aria-label="Dither pattern" className="ae-fin" role="group">
            {PATTERNS.map(([id, name]) => (
              <button
                aria-pressed={finish.pattern === id}
                className="ae-fin-opt"
                disabled={disabled}
                key={id}
                onClick={() => onChange({ ...finish, pattern: id })}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}

function Editor({ base }) {
  const agent = sdk.useValue($agentHalf)
  const start = useMemo(() => startingColours(base), [base])
  const startFinish = useMemo(() => startingFinish(base), [base])
  const [colours, setColours] = useState(start)
  const [finish, setFinish] = useState(startFinish)
  const [textChosen, setTextChosen] = useState(false)
  const [label, setLabel] = useState(null) // null: named automatically from what changed
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('checking') // checking | ready | saving | unavailable | error
  const [error, setError] = useState('')
  const ticket = useRef(0)

  const coloursChanged = textChosen || JSON.stringify(colours) !== JSON.stringify(start)
  const finishChanged = !sameFinish(finish, startFinish)
  const name = label ?? autoLabel(base, coloursChanged, finishChanged, finish.style)

  const params = useMemo(() => {
    const out = { base: base.slug, background: colours.background, accent: colours.accent, scene_colors: colours.stops }
    if (name.trim()) out.label = name.trim()
    if (textChosen) out.foreground = colours.foreground
    if (finishChanged) out.finish = { ...finish }
    return out
  }, [base, colours, name, textChosen, finish, finishChanged])
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
    const levels = finish.style === startFinish.style ? (base.scene.finish || {}).levels || 0 : 0
    const sceneFinish = finishChanged ? { ...(base.scene.finish || {}), ...finish, levels } : base.scene.finish
    return {
      ...base,
      theme: { ...base.theme, colors },
      scene: { ...base.scene, glass: known.scene.glass, colors: colours.stops, finish: sceneFinish }
    }
  }, [fresh, result, base, colours, textChosen, finish, finishChanged, startFinish])

  const set = patch => {
    setColours(current => ({ ...current, ...patch }))
  }
  const setStop = (index, hex) => set({ stops: colours.stops.map((stop, i) => (i === index ? hex : stop)) })
  const removeStop = index => set({ stops: colours.stops.filter((_, i) => i !== index) })
  const addStop = () => set({ stops: [...colours.stops, colours.stops[colours.stops.length - 1]] })
  const reset = () => {
    setColours(start)
    setFinish(startFinish)
    setTextChosen(false)
    setLabel(null)
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
  const changed = coloursChanged || finishChanged || label !== null
  const updating = Boolean(fresh && result.replaces)
  const banner = readOnly
    ? 'Saving needs the Agent half of Aether on this profile (Capabilities, Plugins, Aether). Turn it on to edit and save.'
    : null

  return (
    <sdk.DialogContent banner={banner} bannerTone="warn" fitContent>
      <Styles />
      <sdk.DialogHeader>
        <sdk.DialogTitle>Customise: {base.label}</sdk.DialogTitle>
        <sdk.DialogDescription>
          Change any colour or the finish. Aether keeps text readable over the moving scene and tells you what it had to move.
        </sdk.DialogDescription>
      </sdk.DialogHeader>
      <div className="ae-ed">
        <div className="ae-ed-side">
          <ScenePreview animate={!readOnly} record={draft} />
          <FinishPicker disabled={readOnly} finish={finish} onChange={setFinish} start={startFinish} />
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
            <sdk.Input disabled={readOnly} maxLength={40} onChange={event => setLabel(event.target.value)} value={name} />
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
