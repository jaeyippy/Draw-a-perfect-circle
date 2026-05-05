# Mobile Responsiveness — Design

## Goal

The guide circle and percent text scale down on smaller viewports so the game is usable on phones. The desktop layout is preserved exactly as it is today; scaling only kicks in when the viewport would otherwise force the circle past a 24px margin on any side.

## Sizing model

A single derived value drives the entire layout:

```
radius = min(220, (vw - 48) / 2, (vh - 48) / 2)
scale  = radius / 220
```

- `220` is the existing `GUIDE_RADIUS` constant — the desktop cap.
- `(vw - 48) / 2` enforces a 24px margin on the left and right.
- `(vh - 48) / 2` enforces a 24px margin on the top and bottom.

Everything visual that was tied to the circle scales by `scale`:

- Guide circle SVG: `r={radius}`.
- Percent text: `font-size: 58 * scale` px. Letter-spacing changes from a fixed `-2.32px` to `-0.04em` so it tracks font-size automatically.
- `START_TOLERANCE` (hit-test radius for starting a stroke): `60 * scale`. Keeps the start hitbox proportional to the circle.
- `buildShortcutCircle` wobble amplitudes: scaled by `scale` so the auto-draw still produces a target band on small viewports.

`STROKE_WIDTH` (8) stays fixed. The user's stroke should feel consistent regardless of viewport.

## Layout

```
<div class="stage">                ← block flow, position: relative
  <div class="viewport-frame">     ← height: 100dvh, position: relative
    [burst canvas]
    [SVG: guide + drawn path]
    [particles canvas]
    [percent text]                 ← centered (50%, 50%) in frame
  </div>
  <div class="reload-wrap">        ← position: absolute within stage
    [reload button + hint]
  </div>
</div>
```

- `.stage` is no longer `position: fixed; inset: 0`. It becomes a normal block with `position: relative` and a `min-height` that grows tall enough to contain the reload button.
- `.viewport-frame` height is `100dvh` with a `100vh` fallback for browsers without dvh:
  ```css
  .viewport-frame { height: 100vh; height: 100dvh; }
  ```
  All canvases are sized to `vw × vh` and positioned within this frame.
- `.reload-wrap` is `position: absolute` within `.stage` at `top: vh/2 + radius + 48px`. It tracks the bottom edge of the circle.
- `.stage` `min-height` grows when needed via an inline style supplied by JS:
  `min-height: max(100dvh, ${reloadButtonBottom + 24}px)`. When the reload button would otherwise sit below the visible viewport, the document grows naturally and a vertical scroll appears. (`reloadButtonBottom` = `vh/2 + radius + 48 + buttonHeight + hintHeight`; constants come from existing CSS — `120` is a safe approximation.)

## Scroll behavior

`document.body.style.overflow` is toggled in a `useEffect` driven by `drawing` and `reloadState`:

| Phase | Condition | `body` overflow |
|---|---|---|
| Initial (nothing drawn yet) | `reloadState === 'hidden'` | `hidden` |
| Mid-drag | `drawing === true` | `hidden` |
| After a stroke (finished or paused, reload visible) | else | `auto` |

`touch-action: none` on `.stage` already prevents single-finger drag-scrolling during a stroke. The body lock catches multi-touch and wheel-scroll cases.

## State & wiring

### New hook

```js
function useResponsiveRadius(drawing) {
  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)
  useEffect(() => {
    const onResize = () => {
      if (drawing) return                  // freeze geometry mid-stroke
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [drawing])
  const radius = Math.min(220, (vw - 48) / 2, (vh - 48) / 2)
  return { radius, scale: radius / 220, vw, vh }
}
```

### Changes in `App.jsx`

- Replace the existing `useEffect` that read `containerRef.clientWidth/Height` with `useResponsiveRadius(drawing)`. `size` becomes `{ w: vw, h: vh }`.
- `cx, cy` derivation unchanged (`vw/2, vh/2`).
- `<circle r={GUIDE_RADIUS}>` → `<circle r={radius}>`.
- `onPointerDown`: `START_TOLERANCE` → `60 * scale`.
- `buildShortcutCircle`: replace `GUIDE_RADIUS` with `radius` and multiply both wobble amplitudes by `scale`.
- Percent text inline style: `fontSize: 58 * scale + 'px'`.
- Reload-wrap inline style: `top: vh/2 + radius + 48 + 'px'` (replaces the fixed `bottom: 48px`).
- New `useEffect` toggling `document.body.style.overflow`. Cleanup restores it on unmount.

### Changes in `App.css`

- `.stage`: drop `position: fixed; inset: 0; width: 100%; height: 100%`. Add `position: relative; min-height: 100dvh`.
- New `.viewport-frame { position: relative; width: 100%; height: 100dvh; }`. Canvas and percent positioning becomes relative to this frame.
- `.percent`: drop fixed `font-size`. Set `letter-spacing: -0.04em`.
- `.reload-wrap`: drop `bottom: 48px`. Keep `left: 50%` and `transform: translateX(-50%)`. The `top` value is supplied as an inline style from JS.
- `keyframes percentLift` (`scale(1.2)`) is unaffected — it's a transform layered on top of the inline `font-size`.

## Edge cases

1. **Resize during drawing.** Stored points are pinned to the viewport pixel space at draw start. `useResponsiveRadius` short-circuits resize events while `drawing === true`, so the geometry is frozen until the stroke ends.
2. **iOS dynamic viewport units.** `100vh` includes the URL bar on iOS Safari, causing layout jumps. `.viewport-frame` uses `100dvh`. The hook reads `window.innerHeight`, which already reflects the visible area. CSS falls back to `100vh` on browsers without `dvh`.
3. **Burst ripple max radius.** Still `Math.hypot(vw, vh) / 2 + 80`. Works unchanged.
4. **Particle canvas / DPR.** Keyed off `size.w, size.h`, which now comes from `vw, vh`. No change.
5. **Reset animation.** Particles use stored points + existing `cx, cy`. Because resize is locked during drawing, reset always animates from the same coordinate space the stroke was drawn in.
6. **Pinch-zoom.** `index.html` already has `user-scalable=no`. No change.
7. **Keyboard Tab reset.** Unaffected by body scroll lock.

## Out of scope

- Achievements branch reconciliation (separate worktree).
- Visual tweaks to button, hint, or percent text styling beyond size scaling.
- Touch-specific UX changes (e.g. larger tap targets) beyond what the proportional `START_TOLERANCE` already provides.
