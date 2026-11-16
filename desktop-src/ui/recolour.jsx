// Recolour another creator's theme, the way Hermes recolours any theme: only the accent family moves
// (buttons, links, focus rings, highlights), re-derived by Hermes's own retint. The creator's surfaces,
// scene and styles stay theirs. While the dialog is open the whole window previews the accent live
// through the SDK's accent override; saving keeps the result as `<theme>-accent-<hex>` on this computer.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { sdk } from '../sdk.js'

import { closeRecolour, saveRecolour } from '../community.js'
import { $recolouring, $themeList } from '../state.js'
import { request } from '../sync.js'
import { Styles } from './styles.js'

// Hermes's own accent swatches, with the names its accent picker uses.
const SWATCHES = [
  { name: 'Mono', light: '#000000', dark: '#ffffff' },
  { name: 'GitHub green', light: '#2ea043', dark: '#2ea043' },
  { name: 'Cyber cyan', light: '#00d5ff', dark: '#00d5ff' },
  { name: 'Nous blue', light: '#0053fd', dark: '#0053fd' },
  { name: 'Ultraviolet', light: '#8a2be2', dark: '#8a2be2' },
  { name: 'Barbie pink', light: '#e0218a', dark: '#e0218a' },
  { name: 'Electric red', light: '#ff073a', dark: '#ff073a' },
  { name: 'Safety orange', light: '#ff6a00', dark: '#ff6a00' }
]

const normalize = value => {
  if (sdk.normalizeHex) return sdk.normalizeHex(value) || null
  const hex = String(value || '').trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null
}

const modeOf = theme => (String((theme && theme.name) || '').endsWith('-light') ? 'light' : 'dark')
const baseOf = name => String(name || '').replace(/-(light|dark)$/, '')

function swatchName(hex) {
  const found = SWATCHES.find(s => s.light === hex || s.dark === hex)
  return found ? found.name : hex
}

function Recolour({ name, start }) {
  const { theme, themeName, previewTheme, clearThemePreview } = sdk.useTheme()
  const list = sdk.useValue($themeList)
  const base = list.find(t => t.name === name) || { name, label: name, description: '' }
  const [hex, setHex] = useState(start)
  const [text, setText] = useState(start || '')
  const [own, setOwn] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | capture | done
  const previous = useRef(themeName)
  const previewed = useRef(false)
  const saved = useRef(false)
  const mode = modeOf(theme)
  const painted = baseOf(theme && theme.name)
  const onBase = themeName === name

  // The whole window previews the theme being recoloured; closing without saving puts back what was on.
  useEffect(() => {
    if (themeName !== name) request(name)
    return () => {
      if (sdk.setAccentOverride) sdk.setAccentOverride(null)
      if (!saved.current && previous.current && previous.current !== name) request(previous.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The theme's own accent, read from it as its creator painted it.
  useEffect(() => {
    if (!own && theme && !theme.accentOf && painted === name) setOwn(normalize(theme.colors.primary))
  }, [own, theme, painted, name])

  useEffect(() => {
    if (!sdk.setAccentOverride || !onBase || phase !== 'idle') return
    sdk.setAccentOverride(hex && hex !== own ? hex : null)
  }, [hex, own, onBase, phase])

  // Saving needs the recoloured palette for both appearances. Painted light, the theme carries both; painted
  // dark, it is previewed light for the one render it takes to read it, inside a layout effect, before paint.
  useLayoutEffect(() => {
    if (phase !== 'capture' || !theme || modeOf(theme) !== 'light' || !theme.accentOf) return
    const light = theme
    if (previewed.current && clearThemePreview) clearThemePreview()
    setPhase('done')
    const { name: paintedName, label: _label, description: _description, colors, darkColors, ...rest } = light
    const recolour = {
      ...rest,
      name: baseOf(paintedName),
      label: `${base.label} · ${swatchName(hex)}`,
      description: base.description || '',
      accentOf: name,
      colors,
      darkColors: darkColors || colors
    }
    if (sdk.setAccentOverride) sdk.setAccentOverride(null)
    saved.current = saveRecolour(recolour)
    closeRecolour()
  }, [phase, theme, hex, name, base.label, base.description, clearThemePreview])

  const save = () => {
    if (!hex || hex === own || !onBase) return
    previewed.current = mode !== 'light'
    setPhase('capture')
    if (previewed.current && previewTheme) previewTheme(name, 'light')
  }

  const cancel = () => closeRecolour()

  const pick = value => {
    const next = normalize(value)
    if (!next) return
    setHex(next)
    setText(next)
  }

  const dark = mode === 'dark'
  const ready = Boolean(hex) && hex !== own && onBase && phase === 'idle'

  return (
    <sdk.DialogContent
      fitContent
      onOpenAutoFocus={event => {
        // No focus on the first swatch when it opens: a focus ring there reads as a second selection.
        event.preventDefault()
      }}
    >
      <Styles />
      <sdk.DialogHeader>
        <sdk.DialogTitle>Recolour: {base.label}</sdk.DialogTitle>
        <sdk.DialogDescription>
          Pick a new accent for buttons, links and highlights. Everything else stays as its creator made it, and the
          recolour is saved only on this computer.
        </sdk.DialogDescription>
      </sdk.DialogHeader>
      <div className="ae-rc">
        <div aria-label="Accent colours" className="ae-rc-swatches" role="radiogroup">
          {SWATCHES.map(s => {
            const value = dark ? s.dark : s.light
            const on = hex === value
            return (
              <button
                aria-checked={on}
                aria-label={s.name}
                className="ae-rc-sw"
                data-on={on ? '' : undefined}
                key={s.name}
                onClick={() => pick(value)}
                role="radio"
                style={{ background: value }}
                title={s.name}
                type="button"
              />
            )
          })}
        </div>
        <div className="ae-rc-custom">
          <span className="ae-ed-legend">Any colour</span>
          <div className="ae-sw" style={{ gridTemplateColumns: '28px 96px' }}>
            <input
              aria-label="Choose any accent colour"
              className="ae-sw-pick"
              onChange={event => pick(event.target.value)}
              type="color"
              value={hex || own || '#ffffff'}
            />
            <sdk.Input
              aria-label="Accent hex value"
              className="ae-sw-hex"
              maxLength={7}
              onBlur={() => pick(text)}
              onChange={event => {
                setText(event.target.value)
                if (normalize(event.target.value)) pick(event.target.value)
              }}
              placeholder={own || '#rrggbb'}
              value={text}
            />
          </div>
        </div>
        <div className="ae-rc-sample" aria-hidden>
          <span className="ae-rc-btn">Button</span>
          <span className="ae-rc-link">A highlighted link</span>
          <span className="ae-on">On</span>
        </div>
        <div className="ae-ed-note" data-tone="quiet">
          {hex && hex === own
            ? `That is ${base.label}'s own accent.`
            : hex
              ? `The window behind shows ${base.label} with ${swatchName(hex)} as its accent.`
              : `Pick a colour to see ${base.label} with it.`}
        </div>
      </div>
      <sdk.DialogFooter>
        <sdk.Button onClick={cancel} variant="secondary">
          Cancel
        </sdk.Button>
        <sdk.Button disabled={!ready} onClick={save}>
          Save and switch
        </sdk.Button>
      </sdk.DialogFooter>
    </sdk.DialogContent>
  )
}

/** Mounted once beside the colour editor, in the permanent title-bar slot. */
export function RecolourHost() {
  const target = sdk.useValue($recolouring)
  if (!sdk.Dialog || !sdk.DialogContent || !sdk.setAccentOverride) return null
  return (
    <sdk.Dialog onOpenChange={open => (open ? null : closeRecolour())} open={Boolean(target)}>
      {target ? <Recolour key={`${target.name}:${target.hex || ''}`} name={target.name} start={target.hex} /> : null}
    </sdk.Dialog>
  )
}
