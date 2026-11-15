import { sdk } from '../sdk.js'
import { useMemo, useState } from 'react'

import { PRESETS } from '../presets.generated.js'
import { $agentHalf, $paintedName, $saved, $themeName, openEditor } from '../state.js'
import { applyRecord, deleteSaved, later, turnOff } from '../sync.js'
import { ScenePreview } from './preview.jsx'
import { Styles } from './styles.js'

const IDEAS = [
  'a slow dithered sunset over the sea',
  'my terminal, but amber and raining',
  'deep space, quiet stars, cyanotype blue',
  'gold leaf on black marble',
  'rainy Tokyo at night, neon reflections',
  'a calm forest at dawn, soft halftone'
]

export function askHermes(text) {
  const want = String(text || '').trim()
  if (!want) return false
  const prompt = `Make me an Aether theme for Hermes Desktop: ${want}`
  // A chat already visible beside the gallery takes it directly.
  if (sdk.host.composer.submit(null, prompt)) return true
  // Otherwise open a fresh chat and hand it the request once its composer is mounted.
  sdk.host.newChat()
  let tries = 0
  const attempt = () => {
    if (sdk.host.composer.submit(null, prompt)) return
    if (++tries < 16) {
      later(attempt, 150)
      return
    }
    if (sdk.host.composer.setDraft) sdk.host.composer.setDraft(null, prompt)
    sdk.host.notify({ kind: 'info', title: 'Aether', message: 'Your request is in the composer: press Enter to send it to Hermes.' })
  }
  later(attempt, 150)
  return true
}

function ThemeCard({ record, active, onDelete }) {
  const [hover, setHover] = useState(false)
  const scene = record.scene
  return (
    <div
      className="ae-cardwrap"
      onBlur={() => setHover(false)}
      onFocus={() => setHover(true)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        aria-pressed={active}
        className="ae-card"
        data-active={active ? '' : undefined}
        onClick={() => applyRecord(record, { origin: 'user' })}
        title={`Apply ${record.label}`}
        type="button"
      >
        <ScenePreview animate={hover || active} record={record} />
        <div className="ae-card-body">
          <div className="ae-card-title">
            {sdk.DecodeText ? <sdk.DecodeText active={hover} key={hover ? 'on' : 'off'} text={record.label} /> : <span>{record.label}</span>}
            {active ? <span className="ae-on">On</span> : null}
          </div>
          <div className="ae-card-desc">{record.description}</div>
          <div className="ae-tags">
            <span className="ae-tag">{scene.engine}</span>
            {scene.finish.style !== 'none' ? <span className="ae-tag">{scene.finish.style}</span> : null}
            <span className="ae-tag">{record.appearance}</span>
          </div>
        </div>
      </button>
      <div className="ae-card-actions">
        <button aria-label={`Change the colours of ${record.label}`} className="ae-act" onClick={() => openEditor(record.slug)} title="Colours" type="button">
          <sdk.Codicon name="symbol-color" />
        </button>
        {onDelete ? (
          <button aria-label={`Delete ${record.label}`} className="ae-act" onClick={() => onDelete(record)} title="Delete" type="button">
            <sdk.Codicon name="close" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Ask() {
  const [text, setText] = useState('')
  const agent = sdk.useValue($agentHalf)
  const submit = value => {
    if (askHermes(value)) setText('')
  }
  return (
    <div className="ae-ask">
      <div className="ae-ask-row">
        <sdk.Textarea
          aria-label="Describe a theme"
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit(text)
            }
          }}
          placeholder="Describe a theme and Hermes will paint it. A mood, a place, a palette, a texture..."
          rows={1}
          value={text}
        />
        <sdk.Button disabled={!text.trim()} onClick={() => submit(text)}>
          Make it
        </sdk.Button>
      </div>
      <div className="ae-ideas">
        {IDEAS.map(idea => (
          <button className="ae-idea" key={idea} onClick={() => submit(idea)} type="button">
            {idea}
          </button>
        ))}
      </div>
      {agent === false ? (
        <div className="ae-empty">
          The agent half is not enabled for this profile, so Hermes cannot paint new themes yet. Presets work either way.
        </div>
      ) : null}
    </div>
  )
}

export function Gallery() {
  const saved = sdk.useValue($saved)
  const committed = sdk.useValue($themeName)
  const painted = sdk.useValue($paintedName)
  const agent = sdk.useValue($agentHalf)
  const active = painted || committed
  const mine = useMemo(() => Object.values(saved).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)), [saved])
  const onDelete = record => deleteSaved(record.slug)

  return (
    <div className="ae-page">
      <Styles />
      <div className="ae-wrap">
        <div className="ae-head">
          <div>
            <h1 className="ae-title">Aether</h1>
            <p className="ae-sub">
              Living themes for Hermes. Pick one, or describe the look you want and Hermes paints a palette and a moving scene behind your chats.
            </p>
          </div>
          <span className="ae-status">
            <span className="ae-dot" data-on={agent ? '' : undefined} />
            {agent ? 'Hermes can paint themes' : agent === false ? 'Presets only on this profile' : 'Connecting'}
          </span>
        </div>
        <Ask />
        <section className="ae-section">
          <div className="ae-section-head">
            <h2 className="ae-h2">Your themes</h2>
          </div>
          {mine.length ? (
            <div className="ae-grid">
              {mine.map(record => (
                <ThemeCard active={active === record.slug} key={record.slug} onDelete={onDelete} record={record} />
              ))}
            </div>
          ) : (
            <div className="ae-empty">
              Nothing yet. Describe a theme above, tell Hermes what you want in any chat, or change a preset's colours.
            </div>
          )}
        </section>
        <section className="ae-section">
          <div className="ae-section-head">
            <h2 className="ae-h2">Presets</h2>
          </div>
          <div className="ae-grid">
            {PRESETS.map(record => (
              <ThemeCard active={active === record.slug} key={record.slug} record={record} />
            ))}
          </div>
        </section>
        <div className="ae-foot">
          <sdk.Button onClick={() => turnOff()} size="sm" variant="secondary">
            Turn the backdrop off
          </sdk.Button>
          <sdk.Button
            onClick={() => sdk.host.navigate(sdk.pluginSettingsHref ? sdk.pluginSettingsHref('aether') : '/settings')}
            size="sm"
            variant="ghost"
          >
            Motion settings
          </sdk.Button>
          <span>Motion pauses while Hermes is hidden and follows your system's reduced-motion setting.</span>
        </div>
      </div>
    </div>
  )
}
