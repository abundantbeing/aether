// Scoped styles for Aether's own UI. Disk plugins cannot rely on Tailwind classes the app never
// compiled, so layout lives here under an `ae-` prefix and every colour is a theme variable: the
// gallery reskins itself with each theme, Aether's or not.

export const CSS = `
.ae-page { height: 100%; overflow: auto; color: var(--ui-text-primary); }
.ae-wrap { max-width: 1120px; margin: 0 auto; padding: 28px 28px 48px; display: flex; flex-direction: column; gap: 28px; }
.ae-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ae-title { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
.ae-sub { margin: 6px 0 0; color: var(--ui-text-secondary); font-size: 0.875rem; max-width: 60ch; line-height: 1.5; }
.ae-head-side { display: flex; align-items: center; gap: 12px; }
.ae-note { margin: -4px 0 0; font-size: 0.8125rem; line-height: 1.5; color: var(--ui-text-secondary); max-width: 72ch; }
.ae-shot { position: relative; display: block; width: 100%; aspect-ratio: 1.6; overflow: hidden; background: var(--ui-bg-quaternary); }
.ae-shot > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ae-shot-mark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 2.25rem; font-weight: 600; color: var(--ui-text-quaternary); }
.ae-shot-accent { position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 4px;
  border-radius: 99px; font-size: 0.6875rem; font-weight: 600; color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-bg-chrome) 86%, transparent); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-shot-dot { width: 14px; height: 14px; border-radius: 99px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.35); }
.ae-card-by { font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-pop-settings { align-self: flex-start; }
.ae-rc-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ae-rc-exp { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1;
  padding: 4px 8px; border-radius: 99px; color: var(--ui-text-secondary); background: var(--ui-bg-quaternary);
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-rc { display: flex; flex-direction: column; gap: 16px; width: min(440px, 84vw); text-align: left; }
.ae-rc-swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.ae-rc-sw { width: 32px; height: 32px; border-radius: 99px; border: 0; cursor: pointer; padding: 0;
  box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.45); transition: transform 120ms ease; }
.ae-rc-sw:hover { transform: scale(1.08); }
.ae-rc-sw[data-on] { box-shadow: 0 0 0 2px var(--ui-bg-elevated), 0 0 0 4px var(--ui-text-primary); }
.ae-rc-sw:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.ae-rc-custom { display: flex; flex-direction: column; gap: 6px; }
.ae-rc-sample { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px;
  background: var(--ui-bg-quaternary); font-size: 0.8125rem; }
.ae-rc-btn { padding: 5px 12px; border-radius: 8px; font-weight: 600; background: var(--ui-accent); color: var(--dt-midground-foreground, #fff); }
.ae-rc-link { color: var(--ui-accent); text-decoration: underline; text-underline-offset: 3px; }
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
.ae-cardwrap { position: relative; display: flex; flex-direction: column; }
.ae-cardwrap > .ae-card { flex: 1; }
.ae-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity 120ms ease; }
.ae-cardwrap:hover .ae-card-actions, .ae-cardwrap:focus-within .ae-card-actions { opacity: 1; }
.ae-act { width: 26px; height: 26px; border-radius: 8px; border: 0; cursor: pointer; display: inline-flex; align-items: center;
  justify-content: center; background: color-mix(in srgb, var(--ui-bg-chrome) 82%, transparent); color: var(--ui-text-secondary);
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-act:hover { color: var(--ui-text-primary); }
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
.ae-ed { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; width: min(680px, 84vw); text-align: left; }
.ae-ed-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ae-ed-side canvas { border-radius: 10px; box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-ed-notes { display: flex; flex-direction: column; gap: 6px; min-height: 2.5em; }
.ae-ed-note { font-size: 0.75rem; line-height: 1.45; color: var(--ui-text-secondary); padding: 6px 9px; border-radius: 8px;
  background: var(--ui-bg-quaternary); }
.ae-ed-note[data-tone="ok"], .ae-ed-note[data-tone="quiet"] { background: transparent; padding: 0; color: var(--ui-text-tertiary); }
.ae-ed-note[data-tone="error"] { color: var(--ui-text-primary); box-shadow: inset 2px 0 0 var(--destructive, #cf222e); }
.ae-ed-fields { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ae-ed-name { display: flex; flex-direction: column; gap: 6px; }
.ae-ed-group { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; }
.ae-ed-group > button { align-self: flex-start; }
.ae-ed-legend { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ui-text-tertiary); padding: 0; margin-bottom: 2px; }
.ae-sw { display: grid; grid-template-columns: 28px minmax(0, 1fr) 84px 22px; align-items: center; gap: 8px; }
.ae-sw-pick { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; cursor: pointer; background: transparent;
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-sw-pick::-webkit-color-swatch-wrapper { padding: 2px; }
.ae-sw-pick::-webkit-color-swatch { border: 0; border-radius: 6px; }
.ae-sw-pick:focus-visible, .ae-sw-x:focus-visible, .ae-act:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-sw-label { font-size: 0.8125rem; color: var(--ui-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ae-sw-hex { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem; }
.ae-sw-x { grid-column: 4; width: 22px; height: 22px; border: 0; border-radius: 6px; cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; background: transparent; color: var(--ui-text-tertiary); }
.ae-sw-x:hover { color: var(--ui-text-primary); background: var(--ui-bg-quaternary); }
.ae-ed-roll { align-self: flex-start; }
.ae-fin { display: flex; flex-wrap: wrap; gap: 4px; }
.ae-fin-opt { font: inherit; font-size: 0.75rem; line-height: 1; padding: 6px 9px; border-radius: 999px; cursor: pointer;
  color: var(--ui-text-secondary); background: transparent; border: 1px solid var(--ui-stroke-secondary); }
.ae-fin-opt:hover:not(:disabled) { color: var(--ui-text-primary); background: var(--ui-bg-quaternary); }
.ae-fin-opt[aria-pressed="true"] { color: var(--ui-text-primary); border-color: var(--ui-accent);
  background: color-mix(in srgb, var(--ui-accent) 20%, transparent); }
.ae-fin-opt:disabled { cursor: default; opacity: 0.6; }
.ae-fin-opt:focus-visible, .ae-fin-range:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-fin-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.ae-fin-range { width: 100%; accent-color: var(--ui-accent); }
.ae-select { font: inherit; font-size: 0.8125rem; padding: 6px 10px; border-radius: 8px; cursor: pointer; min-width: 9.5rem;
  color: var(--ui-text-primary); background: var(--ui-bg-secondary, transparent); border: 1px solid var(--ui-stroke-secondary); }
.ae-select:hover { background: var(--ui-bg-quaternary); }
.ae-select:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-fin-val { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem; color: var(--ui-text-tertiary); min-width: 3.2em; text-align: right; }
@media (max-width: 720px) { .ae-ed { grid-template-columns: minmax(0, 1fr); } }
@keyframes ae-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.ae-chip .ae-dot[data-on] { animation: ae-breathe 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .ae-card, .ae-card-actions, .ae-rc-sw { transition: none; } .ae-chip .ae-dot[data-on] { animation: none; } }
`

export function Styles() {
  return <style>{CSS}</style>
}
