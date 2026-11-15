// A live preview of a theme: its scene, the glass veil, and a small mock of the app (sidebar rows,
// a user bubble, an answer, the composer) painted in the theme's own colours. Every preview draws
// through ONE shared offscreen renderer and copies the frame into its own 2D canvas.

import { useEffect, useRef, useState } from 'react'

import { makeLoop } from '../loop.js'
import { SceneRenderer, svgDataUrl, svgLooksSafe } from '../renderer.js'

const STILL_TIME = 23.7
let shared = null

function sharedRenderer() {
  if (shared && shared.ok) return shared
  shared = new SceneRenderer(document.createElement('canvas'))
  return shared
}

// Previews are a fifth of the window, so a finish's cell is scaled down to stay legible as a finish.
function previewScene(scene) {
  const finish = { ...(scene.finish || {}) }
  const px = finish.pixel || 1
  if (finish.style === 'dither' || finish.style === 'pixel') finish.pixel = Math.max(1, Math.round(px * 0.67))
  if (finish.style === 'halftone') finish.pixel = Math.max(4, Math.round(px * 0.7))
  if (finish.style === 'ascii') finish.pixel = Math.max(7, Math.round(px * 0.62))
  if (finish.style === 'scanlines') finish.pixel = Math.max(2, Math.round(px * 0.7))
  return { ...scene, finish }
}

const svgImages = new Map()

function svgImage(svg, onReady) {
  if (!svgLooksSafe(svg)) return null
  let img = svgImages.get(svg)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = svgDataUrl(svg)
    svgImages.set(svg, img)
  }
  if (!img.complete) img.addEventListener('load', onReady, { once: true })
  return img
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function paintMock(g, w, h, record) {
  const c = record.theme.colors
  const glass = record.scene.glass || {}
  const tint = glass.tint ?? 0.6
  g.globalAlpha = tint
  g.fillStyle = c.background
  g.fillRect(0, 0, w, h)
  const focus = glass.focus ?? 0.3
  const grad = g.createRadialGradient(w * 0.56, h * 0.54, 0, w * 0.56, h * 0.54, Math.max(w, h) * 0.5)
  grad.addColorStop(0, c.background)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalAlpha = focus
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.globalAlpha = 1

  const u = h / 100
  const side = w * 0.22
  g.fillStyle = c.border
  g.fillRect(side, 0, Math.max(1, u * 0.25), h)
  g.fillStyle = c.mutedForeground
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = i === 1 ? 1 : 0.7
    roundRect(g, side * 0.14, u * (14 + i * 9), side * (0.5 + ((i * 37) % 30) / 100), u * 2.6, u * 1.2)
    g.fill()
  }
  g.globalAlpha = 1
  g.fillStyle = c.primary
  roundRect(g, side * 0.08, u * 21.5, u * 1.1, u * 5.6, u * 0.5)
  g.fill()

  const col = side + (w - side) * 0.12
  const colW = (w - side) * 0.76
  g.fillStyle = c.userBubble
  roundRect(g, col + colW * 0.45, u * 12, colW * 0.55, u * 11, u * 3)
  g.fill()
  g.strokeStyle = c.userBubbleBorder
  g.lineWidth = Math.max(1, u * 0.25)
  g.stroke()
  g.fillStyle = c.foreground
  roundRect(g, col + colW * 0.5, u * 16.2, colW * 0.4, u * 2.6, u * 1.2)
  g.fill()
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = 0.92
    roundRect(g, col, u * (32 + i * 7.5), colW * [0.92, 0.84, 0.95, 0.55][i], u * 2.8, u * 1.3)
    g.fill()
  }
  g.globalAlpha = 1
  g.fillStyle = c.primary
  roundRect(g, col, u * 63, colW * 0.18, u * 2.8, u * 1.3)
  g.fill()

  g.fillStyle = c.card
  roundRect(g, col, h - u * 20, colW, u * 13, u * 3.5)
  g.fill()
  g.strokeStyle = c.border
  g.stroke()
  g.fillStyle = c.mutedForeground
  roundRect(g, col + u * 3, h - u * 15.5, colW * 0.35, u * 2.6, u * 1.2)
  g.fill()
  g.fillStyle = c.primary
  g.beginPath()
  g.arc(col + colW - u * 6, h - u * 13.5, u * 3, 0, Math.PI * 2)
  g.fill()
}

function draw(canvas, record, time, mock, onSvgReady) {
  const g = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const scene = previewScene(record.scene)
  g.imageSmoothingEnabled = !['dither', 'pixel', 'halftone', 'ascii'].includes(scene.finish.style)
  g.fillStyle = record.theme.colors.background
  g.fillRect(0, 0, w, h)
  if (scene.engine === 'svg' && scene.finish.style === 'none') {
    const img = svgImage(scene.svg, onSvgReady)
    if (img && img.complete && img.naturalWidth) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      g.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s)
    }
  } else {
    const r = sharedRenderer()
    if (r.ok) {
      try {
        r.setScene(scene)
        // Previews keep the window's proportions: the field is laid out against height.
        r.resize(w, h, 0.75)
        if (r.draw(time)) g.drawImage(r.canvas, 0, 0, w, h)
      } catch (error) {
        console.warn('[aether] preview failed', error)
      }
    }
  }
  if (mock) paintMock(g, w, h, record)
}

export function ScenePreview({ record, animate = false, mock = true, ratio = 0.625, className, style }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !width || !record) return undefined
    canvas.width = width
    canvas.height = Math.round(width * ratio)
    let time = STILL_TIME
    const repaint = () => draw(canvas, record, time, mock, repaint)
    repaint()
    if (!animate || !record.scene.speed) return undefined
    let last = 0
    const loop = makeLoop(now => {
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0
      last = now
      time += dt * record.scene.speed
      repaint()
    }, 24, false)
    return () => loop.dispose()
  }, [record, animate, mock, width, ratio])

  return <canvas aria-hidden className={className} ref={ref} style={{ display: 'block', width: '100%', aspectRatio: `${1 / ratio}`, ...style }} />
}
