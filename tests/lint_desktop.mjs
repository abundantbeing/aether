// House rules for the shipped desktop/plugin.js, on top of Hermes's own `desktop surface` admission
// check (tests/test_plugin_e2e.py runs that one). Run: node tests/lint_desktop.mjs
//
// One documented exception: the backdrop (desktop-src/backdrop.js) adds exactly one <style> to
// <head> and one layer to <body>, removed with the theme or the plugin. Nothing else touches them.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(root, 'desktop/plugin.js'), 'utf8')
const lines = src.split('\n')
const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
const findings = []
const BANNED = [
  [/\bimport\s*\(/, 'dynamic import()'],
  [/(?<![\w$.])eval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bdocument\.(querySelector|querySelectorAll|getElementById|getElementsBy\w+)\b/, 'document query (app markup is off limits)'],
  [/\bhermesDesktop\b/, 'raw window.hermesDesktop bridge'],
  [/\bMutationObserver\b/, 'MutationObserver'],
  [/\.prototype\.\w+\s*=|Object\.defineProperty\s*\(|Object\.setPrototypeOf\b|__proto__/, 'prototype patching'],
  [/createElement\(\s*['"](script|link|iframe|webview)['"]/, 'script/link/frame element'],
  [/data-(slot|tour|sidebar|testid)\b/, 'app markup selector'],
  [/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/, 'raw HTML injection'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'raw browser storage (use ctx.storage)'],
  [/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket\s*\(/, 'network call'],
  [/(?<![\w.])setInterval\s*\(|\bwindow\.(addEventListener|setInterval|setTimeout)\b/, 'untracked timer or window listener'],
  [/!\x60[^\x60\s][^\x60\n]*\x60/, 'bang + backtick snippet (the install scanner reads it as inline shell)'],
  [/\u2014/, 'em dash'],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'emoji'],
  [/Co-Authored-By|Generated with|Session: https/i, 'attribution trailer text']
]
lines.forEach((raw, i) => {
  const imp = /^import\s[^'"]*from\s+['"]([^'"]+)['"]/.exec(raw.trim())
  if (imp && !ALLOWED.has(imp[1])) findings.push(`${i + 1}: import of "${imp[1]}"`)
  for (const [re, label] of BANNED) if (re.test(raw)) findings.push(`${i + 1}: ${label}`)
})
const count = re => (src.match(re) || []).length
if (count(/document\.head\.appendChild\(/g) !== 1) findings.push('expected exactly one <head> injection (the backdrop style)')
if (count(/document\.body\.prepend\(/g) !== 1) findings.push('expected exactly one <body> injection (the backdrop layer)')
if (count(/document\.body\.(append|appendChild|insertBefore)\(/g)) findings.push('unexpected <body> injection')
if (count(/^export\s/gm) !== 1 || !/^export\s*\{\s*\w+ as default\s*\};?$|^export default\b/m.test(src)) findings.push('exactly one export, the default plugin object')
if (findings.length) {
  console.error(`lint_desktop: ${findings.length} finding(s)`)
  for (const f of findings) console.error(`  desktop/plugin.js:${f}`)
  process.exit(1)
}
console.log(`lint_desktop: ok (${lines.length} lines; imports limited to ${[...ALLOWED].join(', ')})`)
