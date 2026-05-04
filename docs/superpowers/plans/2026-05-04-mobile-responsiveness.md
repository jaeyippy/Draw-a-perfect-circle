# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guide circle and percent text scale down on viewports smaller than the desktop layout, with 24px margins on all sides, and let the reload button overflow into a scrollable region when the circle dominates a short viewport.

**Architecture:** A single `radius` value derived from `min(220, (vw-48)/2, (vh-48)/2)` drives the SVG circle, percent font-size, hit-test tolerance, and shortcut wobble. The stage becomes a normal block with `min-height: 100dvh` (no longer `position: fixed`); a new `.viewport-frame` wrapper holds the drawing surface at exactly the visible viewport height. The reload button is positioned below the circle and may push the document past one viewport, enabling scroll. Body scroll is locked during the initial state and during drags.

**Tech Stack:** React 18 + Vite. No test framework — verification is manual in a browser. Worktree: `.claude/worktrees/Responsiveness` on branch `worktree-Responsiveness`.

**Reference spec:** `docs/superpowers/specs/2026-05-04-mobile-responsiveness-design.md`

---

## File Structure

| File | Change |
|---|---|
| `src/App.jsx` | Add `useResponsiveRadius` hook; replace `size` state and `GUIDE_RADIUS` usages; restructure JSX with `.viewport-frame`; add scroll-lock effect; compute reload-wrap `top` and stage `min-height` inline |
| `src/App.css` | Drop `position: fixed` from `.stage`; add `.viewport-frame`; remove fixed `font-size`/`letter-spacing` from `.percent`; remove `bottom: 48px` from `.reload-wrap` |
| `index.html` | No change — `user-scalable=no` already present |

---

## Setup: Start dev server

- [ ] **Step 1: Start the Vite dev server** (run once; leave running for the whole plan)

```bash
cd "/Users/jiale/Documents/work/claude-experiments/draw a perfect circle/.claude/worktrees/Responsiveness"
npm install
npm run dev
```

Open http://localhost:5173 in a browser. Use Chrome/Firefox DevTools' device-toolbar to test multiple widths (e.g. 1440 desktop, 768 tablet, 375 phone, 320 narrow phone).

---

### Task 1: Replace size state with useResponsiveRadius hook

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the hook above the `App` component**

Insert immediately before `export default function App()` (around line 205):

```jsx
function useResponsiveRadius() {
  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const radius = Math.min(220, (vw - 48) / 2, (vh - 48) / 2)
  return { radius, scale: radius / 220, vw, vh }
}
```

- [ ] **Step 2: Replace the existing size state and resize effect**

In `App`, remove these lines:

```jsx
const [size, setSize] = useState({ w: 0, h: 0 })
```

```jsx
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
```

Replace with (place this **immediately after** the line `const [drawing, setDrawing] = useState(false)` so a later task can pass `drawing` into the hook without moving it):

```jsx
const { radius, scale, vw, vh } = useResponsiveRadius()
const size = { w: vw, h: vh }
```

(`size` is kept as a local alias so the rest of the component — canvas sizing, burst math — needs no further edits in this task.)

- [ ] **Step 3: Verify in browser**

Reload http://localhost:5173. The app should look identical to before on desktop. Open DevTools console — no errors. Drawing should still work.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Add useResponsiveRadius hook"
```

---

### Task 2: Apply radius to guide circle, hit detection, and shortcut

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update the guide SVG circle**

Find:

```jsx
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
```

Change `r={GUIDE_RADIUS}` to `r={radius}`.

- [ ] **Step 2: Update hit-test tolerance in onPointerDown**

Find in `onPointerDown`:

```jsx
const dist = Math.hypot(p.x - cx, p.y - cy)
if (Math.abs(dist - GUIDE_RADIUS) > START_TOLERANCE) return
```

Change to:

```jsx
const dist = Math.hypot(p.x - cx, p.y - cy)
if (Math.abs(dist - radius) > START_TOLERANCE * scale) return
```

- [ ] **Step 3: Update buildShortcutCircle to use the live radius and scale wobble**

Find:

```jsx
for (let i = 0; i <= SHORTCUT_STEPS; i++) {
  const f = i / SHORTCUT_STEPS
  const theta = -Math.PI / 2 + f * Math.PI * 2
  const r = GUIDE_RADIUS + wobbleFn(theta)
  pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) })
}
```

Change to:

```jsx
for (let i = 0; i <= SHORTCUT_STEPS; i++) {
  const f = i / SHORTCUT_STEPS
  const theta = -Math.PI / 2 + f * Math.PI * 2
  const r = radius + wobbleFn(theta) * scale
  pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) })
}
```

Update the `useCallback` dependency array for `buildShortcutCircle` from `[cx, cy]` to `[cx, cy, radius, scale]`.

- [ ] **Step 4: Verify in browser**

- At desktop width (≥ 488px wide AND ≥ 488px tall): circle is the same size as before (220 radius).
- Resize the window to ~360px wide: circle visibly shrinks. Drawing on the dashed circle still starts a stroke.
- Resize to ~320px wide: circle is even smaller, drawing still works, the dashed circle has 24px clearance from window edges left and right.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Scale guide circle, hit detection, and shortcut wobble with viewport"
```

---

### Task 3: Scale the percent text

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add inline font-size to the percent div**

Find:

```jsx
<div
  key={shimmerKey}
  className={`percent${
    isShimmering
      ? ` is-shimmering${shimmerMode === 'double' ? ' is-shimmering-double' : ''}`
      : ''
  }`}
  data-text={`${percent}%`}
  style={{ color, transition: 'color 120ms linear' }}
>
  {percent}%
</div>
```

Change the `style` prop to:

```jsx
style={{ color, fontSize: `${58 * scale}px`, transition: 'color 120ms linear' }}
```

- [ ] **Step 2: Update `.percent` CSS to use em-based letter-spacing**

In `src/App.css`, find:

```css
.percent {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 600;
  font-size: 58px;
  letter-spacing: -2.32px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
```

Change to:

```css
.percent {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
```

(Removed: `font-size: 58px` and `letter-spacing: -2.32px` — letter-spacing is now `-0.04em` which equals `-2.32px` at 58px.)

- [ ] **Step 3: Verify in browser**

- Desktop: text reads "0%" at 58px, identical to before.
- Resize window narrow: text shrinks proportionally with the circle.
- Draw a circle on a narrow viewport, watch the percent number — it remains centered and the shimmer animation still plays cleanly at smaller sizes (try the 95+ shortcut path mentally — i.e. draw a near-perfect circle).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "Scale percent text font-size with circle"
```

---

### Task 4: Restructure layout — add viewport-frame, drop fixed positioning

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Wrap canvases + SVG + percent in `.viewport-frame`**

In `src/App.jsx`, in the returned JSX, the current structure is:

```jsx
<div ref={containerRef} className="stage" ...>
  <canvas ref={burstCanvasRef} className="burst-canvas" />
  {size.w > 0 && (<svg className="canvas" ...> ... </svg>)}
  <canvas ref={canvasRef} className="particles-canvas" />
  <div className={`percent...`} ...>...</div>
  {reloadState !== 'hidden' && (<div className="reload-wrap">...</div>)}
  {simCursor && (<div className="sim-cursor">...</div>)}
</div>
```

Change to (wrap the burst canvas, SVG, particles canvas, percent, and sim-cursor — but **not** reload-wrap — in a `.viewport-frame`):

```jsx
<div ref={containerRef} className="stage" ...>
  <div className="viewport-frame">
    <canvas ref={burstCanvasRef} className="burst-canvas" />
    {size.w > 0 && (<svg className="canvas" ...> ... </svg>)}
    <canvas ref={canvasRef} className="particles-canvas" />
    <div className={`percent...`} ...>...</div>
    {simCursor && (<div className="sim-cursor">...</div>)}
  </div>
  {reloadState !== 'hidden' && (<div className="reload-wrap">...</div>)}
</div>
```

(Keep all attributes/contents of each child intact — only the wrapper changes.)

- [ ] **Step 2: Update `.stage` CSS — drop fixed positioning**

In `src/App.css`, find:

```css
.stage {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #ffffff;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
```

Change to:

```css
.stage {
  position: relative;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #ffffff;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
```

- [ ] **Step 3: Add `.viewport-frame` CSS**

Add this rule directly after the `.stage` rule:

```css
.viewport-frame {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
}
```

- [ ] **Step 4: Verify in browser**

- Desktop: Layout looks identical. Circle centered, percent centered.
- Narrow viewport: Layout still centered, circle smaller. No visible regressions.
- Open DevTools and confirm `.stage` is `position: relative` and `.viewport-frame` exists at `100dvh`.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "Wrap drawing surface in viewport-frame; switch stage to block flow"
```

---

### Task 5: Reposition reload-wrap to follow the circle

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Compute and apply reload-wrap top inline**

In `src/App.jsx`, find:

```jsx
{reloadState !== 'hidden' && (
  <div
    className={`reload-wrap ${reloadState === 'fading' ? 'is-fading' : ''}`}
  >
    <button ...>...</button>
    <div className="hint">...</div>
  </div>
)}
```

Change the opening `<div>` to:

```jsx
<div
  className={`reload-wrap ${reloadState === 'fading' ? 'is-fading' : ''}`}
  style={{ top: `${vh / 2 + radius + 48}px` }}
>
```

- [ ] **Step 2: Update `.reload-wrap` CSS — drop `bottom: 48px`**

In `src/App.css`, find:

```css
.reload-wrap {
  position: absolute;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeInUp 180ms ease-out;
  transition: opacity 500ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 500ms cubic-bezier(0.22, 0.61, 0.36, 1);
  transform-origin: center;
}
```

Change to (remove `bottom: 48px`):

```css
.reload-wrap {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeInUp 180ms ease-out;
  transition: opacity 500ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 500ms cubic-bezier(0.22, 0.61, 0.36, 1);
  transform-origin: center;
}
```

- [ ] **Step 3: Verify in browser**

- Desktop (tall enough viewport): Draw any stroke. Reload button appears below the circle, with a 48px gap. It is **NOT** at `bottom: 48px` of the viewport anymore — it's pinned to the circle's bottom edge.
- Resize narrower: circle shrinks, reload button moves up with it (still 48px below the circle).
- Resize the window to be very short (e.g. 400×500). Draw a stroke. The reload button should now sit below the visible viewport bottom — currently it will be cut off (we'll fix in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "Pin reload-wrap to bottom edge of circle"
```

---

### Task 6: Stage min-height grows for overflow

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Apply dynamic min-height to the stage**

In `src/App.jsx`, find the stage div opening:

```jsx
<div
  ref={containerRef}
  className="stage"
  style={{ cursor: cursorStyle }}
  onPointerDown={onPointerDown}
  ...
>
```

Change the `style` prop to:

```jsx
style={{
  cursor: cursorStyle,
  minHeight: `max(100dvh, ${vh / 2 + radius + 48 + 120 + 24}px)`,
}}
```

Notes for the engineer: `120` is an approximation for `reload-button height (48px) + gap (14px) + hint height (~32px) + padding`. The trailing `+ 24` keeps a 24px bottom margin in the document. Do not extract these into named constants — they are local to this layout and would only obscure intent.

- [ ] **Step 2: Verify in browser**

- Desktop (tall enough): page does not scroll — `100dvh` wins the `max()`.
- Resize the window to be very short (e.g. 400×500). Draw a stroke (or trust that the reload would render): you should now be able to scroll the page vertically to reveal the reload button. The drawing area remains exactly `100dvh` and centered above.
- Resize even shorter (300px tall): the document grows further; scroll reveals the reload button.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Grow stage min-height so overflowing reload button is reachable"
```

---

### Task 7: Freeze geometry mid-stroke

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add a `drawing` parameter to the hook**

Find the existing hook:

```jsx
function useResponsiveRadius() {
  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const radius = Math.min(220, (vw - 48) / 2, (vh - 48) / 2)
  return { radius, scale: radius / 220, vw, vh }
}
```

Change to:

```jsx
function useResponsiveRadius(drawing) {
  const [vw, setVw] = useState(window.innerWidth)
  const [vh, setVh] = useState(window.innerHeight)
  const drawingRef = useRef(drawing)
  useEffect(() => { drawingRef.current = drawing }, [drawing])
  useEffect(() => {
    const onResize = () => {
      if (drawingRef.current) return
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const radius = Math.min(220, (vw - 48) / 2, (vh - 48) / 2)
  return { radius, scale: radius / 220, vw, vh }
}
```

(Using a ref so the resize listener doesn't need to be torn down and re-bound every time `drawing` flips.)

- [ ] **Step 2: Pass `drawing` to the hook**

In `App`, find:

```jsx
const { radius, scale, vw, vh } = useResponsiveRadius()
```

Change to:

```jsx
const { radius, scale, vw, vh } = useResponsiveRadius(drawing)
```

(The hook call is already placed after `const [drawing, setDrawing] = useState(false)` from Task 1, so `drawing` is in scope.)

- [ ] **Step 3: Verify in browser**

- On a normal viewport, start drawing (press and hold mid-stroke without releasing). Resize the window — the circle stays put, no jump. Release the mouse: window can now resize again normally.
- Repeat at narrow viewport — same behavior.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Freeze radius during active stroke"
```

---

### Task 8: Body scroll lock based on phase

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add a scroll-lock effect**

In `App`, near the other `useEffect` hooks, add:

```jsx
useEffect(() => {
  const lock = drawing || reloadState === 'hidden'
  const prev = document.body.style.overflow
  document.body.style.overflow = lock ? 'hidden' : ''
  return () => { document.body.style.overflow = prev }
}, [drawing, reloadState])
```

- [ ] **Step 2: Verify in browser**

Use a short viewport (e.g. 400×500) so the document is taller than the viewport.

1. **Initial state** (page loaded, nothing drawn): try scrolling — page does not scroll. ✅
2. **After a stroke** (release the mouse): try scrolling — page now scrolls and the reload button is reachable. ✅
3. **Mid-stroke** (press and hold, drag along the circle without releasing): try scrolling with the wheel or a second touch — no scroll. ✅ (touch-action: none already prevents single-touch scroll; this catches wheel/multi-touch.)
4. **After reset** (click reload, wait for fade): scroll lock returns to "hidden" (since `reloadState === 'hidden'` again). ✅

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "Lock body scroll except when a stroke has been drawn"
```

---

### Task 9: Cross-cutting verification pass

**Files:** None (manual verification)

- [ ] **Step 1: Test at multiple viewport sizes**

For each size below, perform the full flow: start drawing on the dashed circle, complete a stroke, observe percent text, click reload, verify reset animation.

Sizes to test:
- 1440 × 900 (desktop)
- 1024 × 768 (tablet landscape)
- 768 × 1024 (tablet portrait)
- 414 × 896 (large phone portrait)
- 375 × 667 (mid phone portrait)
- 320 × 568 (narrow phone portrait)
- 667 × 375 (phone landscape — short viewport)
- 400 × 400 (square, edge case)

For each size, verify:
- Circle has a visible 24px gap from the nearest viewport edge on the constrained axis.
- Percent text scales to match the circle.
- You can start drawing only on/near the dashed line.
- Reload button is visible (or reachable via scroll on short viewports).

- [ ] **Step 2: Test orientation change**

In DevTools device toolbar, switch a phone profile between portrait and landscape mid-session. Verify the layout adapts cleanly (no orphan particles or stuck percent text).

- [ ] **Step 3: Test the shortcut auto-draw paths (if uncommented)**

The SHORTCUT buttons are commented out in the source. To test: temporarily uncomment the `<div className="shortcut-stack">` block in `App.jsx`, restart `npm run dev`, then click `>95%` and `>85%` at multiple viewport sizes. The auto-drawn circle should land in the expected score band at every size. Re-comment when done — do not commit the uncomment.

- [ ] **Step 4: Test mid-stroke resize**

At a tablet width, start a stroke (press and hold), drag part-way around the circle, then resize the window narrower. The circle and stroke must remain on the same coordinate space (no jump). On release, the next resize is honored.

- [ ] **Step 5: Test celebration effects on small viewports**

At 375 × 667, draw a near-perfect circle. The shimmer should sweep across the (smaller) percent text without clipping. The 95+ ripple burst should still fill from center outward.

- [ ] **Step 6: Final commit (only if any leftover whitespace/format adjustments are needed)**

```bash
git status
# If clean, no commit needed.
# If something was tweaked during verification, commit it with a descriptive message.
```

---

## Self-review checklist (already run by author)

- ✅ Spec coverage: every section of the design doc maps to one or more tasks.
- ✅ No placeholders.
- ✅ Type/property consistency: `radius`, `scale`, `vw`, `vh` names are identical across all tasks.
- ✅ The `drawing` ref pattern in Task 7 avoids re-binding the resize listener.
- ✅ Letter-spacing math: 58 × -0.04 = -2.32, matches existing.
