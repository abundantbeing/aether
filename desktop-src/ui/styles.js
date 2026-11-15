// Scoped styles for Aether's own UI. Disk plugins cannot rely on Tailwind classes the app never
// compiled, so layout lives here under an `ae-` prefix and every colour is a theme variable: the
// gallery reskins itself with each theme, Aether's or not.

export const CSS = `
.ae-page { height: 100%; overflow: auto; color: var(--ui-text-primary); }
.ae-wrap { max-width: 1120px; margin: 0 auto; padding: 28px 28px 48px; display: flex; flex-direction: column; gap: 28px; }
.ae-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ae-title { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
.ae-sub { margin: 6px 0 0; color: var(--ui-text-secondary); font-size: 0.875rem; max-width: 60ch; line-height: 1.5; }
.ae-status { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--ui-text-quaternary); }
.ae-dot[data-on] { background: var(--ui-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 22%, transparent); }
.ae-ask { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 14px;
  background: var(--ui-bg-elevated); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-ask-row { display: flex; gap: 10px; align-items: stretch; }
.ae-ask-row > textarea { flex: 1; min-height: 44px; resize: none; }
.ae-ideas { display: flex; flex-wrap: wrap; gap: 6px; }
.ae-idea { font-size: 0.75rem; padding: 4px 10px; border-radius: 99px; cursor: pointer; border: 0;
  background: var(--ui-bg-quaternary); color: var(--ui-text-secondary); }
.ae-idea:hover { color: var(--ui-text-primary); }
.ae-section { display: flex; flex-direction: column; gap: 12px; }
.ae-section-head { display: flex; align-items: baseline; justify-content: space-between; }
.ae-h2 { margin: 0; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ui-text-tertiary); }
.ae-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.ae-card { position: relative; display: flex; flex-direction: column; text-align: left; padding: 0; cursor: pointer;
  border: 0; border-radius: 14px; overflow: hidden; background: var(--ui-bg-elevated); color: inherit;
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); transition: transform 160ms ease, box-shadow 160ms ease; }
.ae-card:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary), 0 10px 28px -14px rgb(0 0 0 / 0.5); }
.ae-card:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-card[data-active] { box-shadow: inset 0 0 0 2px var(--ui-accent); }
.ae-card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
.ae-card-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 0.875rem; }
.ae-card-desc { font-size: 0.75rem; line-height: 1.4; color: var(--ui-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ae-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.ae-tag { font-size: 0.6875rem; padding: 1px 7px; border-radius: 99px; background: var(--ui-bg-quaternary); color: var(--ui-text-tertiary); }
.ae-on { font-size: 0.6875rem; font-weight: 600; padding: 1px 8px; border-radius: 99px; background: var(--ui-accent); color: var(--dt-midground-foreground, #fff); }
.ae-x { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 8px; border: 0; cursor: pointer;
  display: none; align-items: center; justify-content: center; background: color-mix(in srgb, var(--ui-bg-chrome) 80%, transparent); color: var(--ui-text-secondary); }
.ae-card:hover .ae-x { display: inline-flex; }
.ae-empty { font-size: 0.8125rem; color: var(--ui-text-tertiary); padding: 6px 0; }
.ae-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-settings { display: flex; flex-direction: column; gap: 4px; }
.ae-inline { display: flex; flex-direction: column; gap: 10px; max-width: 560px; margin: 6px 0; padding: 12px; border-radius: 14px;
  background: var(--ui-widget-surface-background, var(--ui-bg-elevated)); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-inline-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ae-inline canvas { border-radius: 10px; }
.ae-chip { display: inline-flex; align-items: center; gap: 6px; height: 100%; padding: 0 6px; border: 0; background: transparent;
  color: var(--ui-text-tertiary); font-size: 0.6875rem; cursor: pointer; }
.ae-chip:hover { color: var(--ui-text-primary); }
.ae-pop { display: flex; flex-direction: column; gap: 10px; width: 260px; padding: 4px; }
.ae-pop-title { font-weight: 600; font-size: 0.8125rem; }
@keyframes ae-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.ae-chip .ae-dot[data-on] { animation: ae-breathe 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .ae-card { transition: none; } .ae-chip .ae-dot[data-on] { animation: none; } }
`

export function Styles() {
  return <style>{CSS}</style>
}
