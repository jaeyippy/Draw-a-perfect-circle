# Draw a Perfect Circle

A tiny browser game: click anywhere on the dashed guide and drag your way around. The closer your stroke is to a true circle, the higher your score.

## Scoring

Your stroke is fit to a best-fit circle (Kåsa method) and judged on:
- **Roundness** — RMS radial error normalized by radius.
- **Coverage** — how much of the full 2π arc you swept.
- **Closure** — only counted once you've nearly completed the loop.

The display curve is generous from 0–85% and strict from 85–100%, so cracking the top band actually means something.

## Celebrations

- **85–94%** — the percent text scales up with a diagonal silver shimmer.
- **≥95%** — the same shimmer (double sweep) plays alongside a pixelated radial ripple.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 and start drawing. Press **Tab** (or click the reload button) to start over.

## Stack

React 18 + Vite. No backend, no build pipeline beyond `vite build`.
