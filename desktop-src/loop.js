// One animation loop shape for the backdrop and the previews: the SDK's createBudgetedLoop (fps
// budget, parks while the window is hidden or minimised), with a minimal stand-in on older builds.

import { sdk } from './sdk.js'

export function makeLoop(paint, fps, pauseWhenUnfocused) {
  if (typeof sdk.createBudgetedLoop === 'function') {
    return sdk.createBudgetedLoop(paint, { fps, pauseWhenUnfocused })
  }
  // Older Desktop without the SDK loop: a minimal equivalent that still sleeps while hidden.
  let raf = 0
  let last = 0
  let dead = false
  const tick = now => {
    if (dead) return
    raf = requestAnimationFrame(tick)
    if (document.hidden || now - last < 1000 / fps) return
    last = now
    paint(now)
  }
  raf = requestAnimationFrame(tick)
  return { dispose: () => { dead = true; cancelAnimationFrame(raf) }, isDormant: () => false, wake: () => {} }
}
