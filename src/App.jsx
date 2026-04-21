import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const GUIDE_RADIUS = 220
const START_TOLERANCE = 60
const STROKE_WIDTH = 8
const MIN_POINT_DISTANCE = 2

const COLOR_STOPS = [
  { p: 0, rgb: [178, 44, 34] },
  { p: 40, rgb: [196, 64, 46] },
  { p: 75, rgb: [173, 99, 10] },
  { p: 100, rgb: [45, 157, 95] },
]

const lerp = (a, b, t) => a + (b - a) * t

function colorForPercent(pct) {
  const p = Math.max(0, Math.min(100, pct))
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i]
    const b = COLOR_STOPS[i + 1]
    if (p >= a.p && p <= b.p) {
      const t = (p - a.p) / (b.p - a.p)
      const r = Math.round(lerp(a.rgb[0], b.rgb[0], t))
      const g = Math.round(lerp(a.rgb[1], b.rgb[1], t))
      const bl = Math.round(lerp(a.rgb[2], b.rgb[2], t))
      return `rgb(${r}, ${g}, ${bl})`
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1].rgb
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}

// Algebraic (Kåsa) circle fit — works even for a few points on a short arc.
function fitCircle(points) {
  const n = points.length
  if (n < 3) return null
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0
  for (const p of points) {
    const x = p.x, y = p.y
    const z = x * x + y * y
    Sx += x; Sy += y
    Sxx += x * x; Syy += y * y; Sxy += x * y
    Sxz += x * z; Syz += y * z; Sz += z
  }
  const m = [
    [Sxx, Sxy, Sx, -Sxz],
    [Sxy, Syy, Sy, -Syz],
    [Sx,  Sy,  n,  -Sz ],
  ]
  for (let i = 0; i < 3; i++) {
    let maxRow = i
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(m[k][i]) > Math.abs(m[maxRow][i])) maxRow = k
    }
    ;[m[i], m[maxRow]] = [m[maxRow], m[i]]
    if (Math.abs(m[i][i]) < 1e-10) return null
    for (let k = i + 1; k < 3; k++) {
      const f = m[k][i] / m[i][i]
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]
    }
  }
  const sol = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let s = m[i][3]
    for (let j = i + 1; j < 3; j++) s -= m[i][j] * sol[j]
    sol[i] = s / m[i][i]
  }
  const [a, b, c] = sol
  const cx = -a / 2
  const cy = -b / 2
  const rsq = a * a / 4 + b * b / 4 - c
  if (rsq <= 0) return null
  return { cx, cy, r: Math.sqrt(rsq) }
}

function scoreCircle(points) {
  if (points.length < 3) return 0
  const fit = fitCircle(points)
  if (!fit) return 0
  const { cx, cy, r } = fit
  if (r < 10 || r > 4000) return 0

  // Normalized RMS radial error — 0 = perfect circle.
  let sum = 0
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy) - r
    sum += d * d
  }
  const rmse = Math.sqrt(sum / points.length)
  const normErr = rmse / r

  // Roundness in [0,1]. Decay constant tuned so a near-perfect circle sits ~1
  // and a visibly wobbly one still scores in the middle.
  const roundness = Math.exp(-normErr / 0.11)

  // Angular coverage — how much of 2π was swept.
  const bins = new Array(36).fill(false)
  for (const p of points) {
    const a = Math.atan2(p.y - cy, p.x - cx)
    bins[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 36) % 36] = true
  }
  const coverage = bins.filter(Boolean).length / 36

  // Closure only matters once they've nearly completed the loop.
  let closure = 1
  if (coverage > 0.85) {
    const first = points[0]
    const last = points[points.length - 1]
    closure = Math.max(0, 1 - Math.hypot(first.x - last.x, first.y - last.y) / r)
  }

  // Blend coverage generously: even a small arc immediately shows progress.
  const coverageFactor = 0.4 + 0.6 * coverage
  const raw = roundness * coverageFactor * (0.9 + 0.1 * closure)

  // Piecewise display curve: generous 0 → 85, strict 85 → 100.
  // raw ≤ 0.72 maps linearly to display 0 → 85.
  // raw > 0.72 maps to display 85 → 100, requiring big raw gains for small display gains.
  let display
  if (raw <= 0.72) {
    display = (raw / 0.72) * 85
  } else {
    // Power curve on the top segment — 100 demands a near-perfect circle.
    const t = (raw - 0.72) / 0.28
    display = 85 + Math.pow(t, 1.6) * 15
  }

  return Math.round(Math.max(0, Math.min(100, display)))
}

function pointsToPath(points) {
  if (points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
  }
  return d
}

function buildParticles(points) {
  if (points.length < 2) return []
  // Centroid for outward direction.
  let cx = 0, cy = 0
  for (const p of points) { cx += p.x; cy += p.y }
  cx /= points.length
  cy /= points.length

  // Densely sample the polyline — ~1.6px spacing.
  const dense = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.round(segLen / 3.5))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  dense.push(points[points.length - 1])

  return dense.map((p, i) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    // Slight angular jitter around the radial direction.
    const jitter = (Math.random() - 0.5) * 0.5
    const cos = Math.cos(jitter), sin = Math.sin(jitter)
    const nx = (dx / len) * cos - (dy / len) * sin
    const ny = (dx / len) * sin + (dy / len) * cos
    const dist = 26 + Math.random() * 40
    return {
      id: i,
      x: p.x,
      y: p.y,
      tx: nx * dist,
      ty: ny * dist,
      size: 0.5 + Math.random() * 1.3, // radius 0.5–1.8 → diameter 1–3.6
      delay: Math.random() * 90,
    }
  })
}

export default function App() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [points, setPoints] = useState([])
  const [drawing, setDrawing] = useState(false)
  const [finished, setFinished] = useState(false)
  const [percent, setPercent] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const [reloadState, setReloadState] = useState('hidden')

  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      setSize({ w: el.clientWidth, h: el.clientHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Size the particle canvas to match the stage (with DPR for crispness).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [size.w, size.h])

  const cx = size.w / 2
  const cy = size.h / 2

  const reset = useCallback(() => {
    if (reloadState === 'fading') return
    const RESET_DURATION = 500

    // Snapshot particles + stroke color BEFORE we clear state.
    const particles = buildParticles(points)
    const strokeColor = colorForPercent(percent)
    const startPct = percent

    setPoints([])
    setReloadState('fading')

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const t0 = performance.now()
    cancelAnimationFrame(rafRef.current)

    const animate = (now) => {
      const t = Math.min(1, (now - t0) / RESET_DURATION)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic — matches CSS

      // Counter tween.
      setPercent(Math.round(startPct * (1 - eased)))

      // Particle paint — single DOM node, one paint per frame.
      if (ctx && canvas) {
        ctx.clearRect(0, 0, size.w, size.h)
        ctx.fillStyle = strokeColor
        ctx.globalAlpha = 1 - eased
        for (const p of particles) {
          ctx.beginPath()
          ctx.arc(p.x + p.tx * eased, p.y + p.ty * eased, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        if (ctx) ctx.clearRect(0, 0, size.w, size.h)
        setDrawing(false)
        setFinished(false)
        setPercent(0)
        setReloadState('hidden')
        setResetKey((k) => k + 1)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [points, percent, reloadState, size.w, size.h])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      if (reloadState === 'hidden') return
      e.preventDefault()
      reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reloadState, reset])

  const getPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e) => {
    if (finished || drawing) return
    const p = getPos(e)
    const dist = Math.hypot(p.x - cx, p.y - cy)
    if (Math.abs(dist - GUIDE_RADIUS) > START_TOLERANCE) return
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {}
    setDrawing(true)
    setPoints([p])
    if (reloadState === 'hidden') setReloadState('visible')
  }

  const onPointerMove = (e) => {
    if (!drawing) return
    const p = getPos(e)
    setPoints((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_DISTANCE) {
        return prev
      }
      const next = [...prev, p]
      setPercent(scoreCircle(next))
      return next
    })
  }

  const endStroke = () => {
    if (!drawing) return
    setDrawing(false)
    setFinished(true)
    setPercent(scoreCircle(points))
  }

  const started = drawing || finished
  const color = useMemo(
    () => (started ? colorForPercent(percent) : 'rgb(180, 180, 180)'),
    [percent, started],
  )

  const pathD = useMemo(() => pointsToPath(points), [points])
  const cursorStyle = finished ? 'default' : 'var(--pencil-cursor)'

  return (
    <div
      ref={containerRef}
      className="stage"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
    >
      {size.w > 0 && (
        <svg className="canvas" width={size.w} height={size.h}>
          <circle
            cx={cx}
            cy={cy}
            r={GUIDE_RADIUS}
            fill="none"
            stroke="#d9d9d9"
            strokeWidth={2}
            strokeDasharray="6 10"
            strokeLinecap="round"
          />
          {pathD && (
            <path
              key={resetKey}
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'stroke 120ms linear' }}
            />
          )}
        </svg>
      )}
      <canvas ref={canvasRef} className="particles-canvas" />


      <div
        className="percent"
        style={{ color, transition: 'color 120ms linear' }}
      >
        {percent}%
      </div>

      {reloadState !== 'hidden' && (
        <div
          className={`reload-wrap ${reloadState === 'fading' ? 'is-fading' : ''}`}
        >
          <button
            type="button"
            className="reload-btn"
            onClick={reset}
            aria-label="Reload"
          >
            <ReloadIcon />
          </button>
          <div className="hint">
            <span className="hint-or">or</span>
            <span className="hint-key">tab</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ReloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v4h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
