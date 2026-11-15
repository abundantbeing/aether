// `::aether-theme{name="aether-..."}` in an assistant reply renders this card: a live preview of the
// theme with Keep / Undo, so the conversation that made a theme also holds the way back from it.
// Attributes are untrusted model output: an unknown name renders nothing.

import { sdk } from '../sdk.js'

import { $catalog, $themeName } from '../state.js'
import { applyRecord, undo } from '../sync.js'
import { ScenePreview } from './preview.jsx'
import { Styles } from './styles.js'

export function ThemeCardDirective({ attrs }) {
  const catalog = sdk.useValue($catalog)
  const current = sdk.useValue($themeName)
  const slug = attrs && typeof attrs.name === 'string' ? attrs.name.trim() : ''
  const record = slug ? catalog[slug] : null
  if (!record) return null
  const on = current === record.slug
  return (
    <div className="ae-inline">
      <Styles />
      <ScenePreview animate={on} record={record} />
      <div className="ae-inline-row">
        <strong style={{ fontSize: '0.875rem' }}>{record.label}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--ui-text-tertiary)' }}>{record.description}</span>
      </div>
      <div className="ae-inline-row">
        {on ? (
          <sdk.Button onClick={() => undo(record.slug)} size="sm" variant="secondary">
            Undo
          </sdk.Button>
        ) : (
          <sdk.Button onClick={() => applyRecord(record, { origin: 'user' })} size="sm">
            Apply
          </sdk.Button>
        )}
        <sdk.Button onClick={() => sdk.host.navigate('/aether')} size="sm" variant="ghost">
          Gallery
        </sdk.Button>
        {on ? <span style={{ fontSize: '0.75rem', color: 'var(--ui-text-tertiary)' }}>On now</span> : null}
      </div>
    </div>
  )
}
