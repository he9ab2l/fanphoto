---
name: no-gl-grid
description: An infinite, domed, draggable image grid with zero WebGL and zero dependencies — plain DOM/JS/CSS, framework-agnostic (vanilla, Vue, React, Svelte — anything that renders elements). One matrix3d per card, modulo wrap, pincushion warp via rect→quad homography, cursor bulge, mask-image flashlight, and a FLIP-style card zoom. Use when building an infinite grid / infinite canvas without libraries, or when asked for "the no-GL grid".
---

# The no-GL infinite grid

Everything is DOM. The grid holds just enough cards to tile the viewport
once, and every visual — the dome, the cursor bulge, the card flip — is a
single `matrix3d` written per card, per frame, only while something moves.
Steady 120fps with images, captions and a flashlight overlay.

**Zero dependencies, framework-agnostic.** The whole system is plain
JS + CSS on ordinary elements: no WebGL, no animation library, no smooth-
scroll library, no framework requirement. The reference build happens to be
Vue + Tailwind, but nothing below relies on either — render the cards with
anything (or `innerHTML`), keep the per-frame writes in vanilla JS exactly
as shown, and express the static styles however the host project does.

## The pipeline

For every visible card, every animated frame:

1. **Wrap** its position around the grid's period (modulo — infinite pan).
2. **Warp** its period-box corners (pincushion + bulge — plain math on 4 points).
3. **Inset** the warped quad by half the gap (constant gutters at any warp).
4. **Solve** the rect→quad homography and write it as one `matrix3d`.

New effects are new terms in step 2. Nothing downstream ever changes.

## Layout

- Container: `fixed inset-0 overflow-hidden touch-none select-none`.
- Grid: CSS grid, `w-max`, gap from one CSS var; column width `--card` set
  from JS: `card = viewportWidth / visibleColumns − gap`.
- Tile `visibleColumns + 2` columns and `ceil(vh / period) + 2` rows. The
  `+2` is load-bearing: a wrapping cell lingers a full cell past one edge
  before its window flips it across, so the slack per axis must hold at
  least one whole cell — with `+1`, the far side runs dry for half of all
  scroll phases and rim cards visibly pop.
- Measure every card once per resize (`getBoundingClientRect` at reset
  transform); cache `el`, the `img`, rect edges and centre.
- Rebuild from the live viewport on resize and visual-viewport changes. Compute
  columns from both width and a short-side height target, guard the rebuild with
  a generation counter, and expose an in-canvas zoom control if browser zoom is
  not enough. Never rely on `user-scalable=no` to make gestures simpler.

## Wrap — infinite in both axes

```js
const wrap = (min, max, v) => {
	const r = max - min
	return min + (((v - min) % r + r) % r)
}

// per cell: max = grid box + one trailing gap  (= cols × (card + gap))
// margin  = (max − viewport) / 2  → spare coverage split evenly
const tx = wrap(cell.right + margin.x - max.x, cell.right + margin.x, x.current)
```

Only cards in view get written. Off-screen cards receive one parking write,
then are skipped until they wrap back in. Pad the visibility test by one
period: at drag speed a card crosses the rim between two frames, and with
no slack its first write lands already inside the viewport — a pop instead
of a slide.

## The warp — dome + bulge on four points

```js
const warp = (px, py) => {
	const nx = px / halfW, ny = py / halfH
	const f = 1 + BOW * (nx * nx + ny * ny)      // pincushion: rim spreads

	let wx = px * f, wy = py * f

	const dx = wx - cursor.x, dy = wy - cursor.y  // gaussian shove away
	const push = BULGE * bulgeWeight * Math.exp(-(dx * dx + dy * dy) / reach2)

	return { x: wx + dx * push, y: wy + dy * push }
}
```

Warp the four corners of the card's PERIOD box (card + half gap all round).
Neighbouring cards share those lattice points exactly, so the bow is
seamless. Then inset each corner by `gap / 2` along its own two edges —
both neighbours inset from the same shared line, so the gap stays exactly
constant at any warp strength.

## Rect → quad: the matrix3d

A homography maps a rectangle onto ANY straight-edged quad — keystone, skew
and scale all fall out of one solve. Unit-square solution, pre-scaled by the
card size, translation carried in the matrix (transform-origin: top left):

```js
const matrix = (w, q0, q1, q2, q3) => {   // tl, tr, bl, br in local px
	const dx1 = q1.x - q3.x, dy1 = q1.y - q3.y
	const dx2 = q2.x - q3.x, dy2 = q2.y - q3.y
	const sx = q0.x - q1.x - q2.x + q3.x
	const sy = q0.y - q1.y - q2.y + q3.y
	const den = dx1 * dy2 - dx2 * dy1
	const g = den ? (sx * dy2 - dx2 * sy) / den : 0
	const h = den ? (dx1 * sy - sx * dy1) / den : 0
	const a = q1.x - q0.x + g * q1.x, b = q2.x - q0.x + h * q2.x
	const d = q1.y - q0.y + g * q1.y, e = q2.y - q0.y + h * q2.y

	return `matrix3d(${a / w}, ${d / w}, 0, ${g / w}, ${b / w}, ${e / w}, 0, ${h / w}, 0, 0, 1, 0, ${q0.x}, ${q0.y}, 0, 1)`
}
```

No `perspective` on any container, no `transform-style` — the matrix
carries its own projection and cards stay flat in z.

## Motion

One self-owned rAF. Frame-rate-independent damping, dt clamped for the
tab-switch frame; a still-check skips all writes when nothing moves:

```js
const damp = (from, to, rate, dt) =>
	from + (to - from) * (1 - Math.pow(1 - rate, dt * 60))

x.current = damp(x.current, x.target, 0.1, dt)
```

Inputs: `wheel` (+= deltas), pointer drag (target = origin − travel × speed),
keyboard (arrows nudge one cell = card + gap, space pans ~80% of a viewport,
shift+space back, Escape closes the flip), cursor damped separately for the
bulge. Suppress the bulge by velocity — `calm = 1 / (1 + |lag| / 40)` — so
the lens fades while the grid travels.

Do not trust `click` after `stage.setPointerCapture()`: the event target can be
redirected to the stage and card handlers never see it. Record `event.target` on
`pointerdown`, then open a card from `pointerup` only when travel is below the
drag threshold. Use the same press record to distinguish two-finger pinch.

Lock the document so mobile browser chrome never reacts: `overflow: hidden`
and `overscroll-behavior: none` on html and body, `position: fixed; inset: 0`
on body (old iOS ignores overflow on body for touch), `touch-action: none`
on the stage.

## The flip (card zoom)

Not a separate animation system: flip progress (damped 0→1) lerps the
clicked card's quad corners from their live grid positions toward a centred
square, through the same inset + homography. The in-betweens un-keystone
naturally; the return leg lands on the moving grid slot for free. Side
panel and caption fades are remaps of the same progress value.

Layout details that matter:

- The white side panel is a CHILD of every card, parked exactly under the
  image, slid out by a `--slide` var the flip writes (one cell, one var —
  cheap). As card DOM it inherits the matrix, so it warps and travels along.
- The image↔panel gap is NEGATIVE by twice the border radius, in CARD-LOCAL
  units (the matrix scales the radius up with the card), so the panel's own
  rounded corners hide behind the image and its edge reads straight.
- Portrait (`wh > ww`): pair vertically instead — the panel slides out
  underneath and the image takes most of the width. The unwarped text box
  over the panel gets an absolute top inset equal to the overlap, so
  scrolled text clips at the image edge instead of riding under it.
- While the card sits above the dim overlay (z lift), give it a per-card
  dim stand-in computed from the same falloff at its position — set BEFORE
  the z lift — so both hand-offs are invisible.
- Hold a full-viewport cover (plain div, class-driven opacity fade) until
  every image has settled, with a timeout cap so a slow network can't hang
  the reveal.

## The flashlight

A solid dim layer with the hole punched by `mask-image`, positioned by two
CSS vars written per frame (whole pixels, change-gated). Sample the stops
from a smoothstep — a two-stop gradient ramps alpha linearly and the equal
8-bit steps read as rings:

```js
const smooth = t => t * t * (3 - 2 * t)
// 12 stops: rgba(0,0,0,smooth(i/12)) at hole + (i/12) * (edge − hole)
```

Emit the stop positions in rem (value ÷ root font size) so they follow a
fluid type scale between resizes. On touch there is no cursor to chase, so
rest the hole at the centre and double its radius — it reads as a soft
vignette. Keep the same `smooth()` feeding any per-card dim math so
hand-offs match the overlay exactly.

The mask should be fully transparent at the centre and fully opaque at the
edge; do not cap the mask alpha. Clamp the hole to remain partly visible at
screen borders, put the active card above the overlay, and fade the torch
out while the flip is open.

## Performance rules

- Write `element.style.transform` directly. NEVER per-frame CSS variables
  on cells: a custom property invalidates style for the whole subtree each
  frame — across a grid of cards it shows as visible image flicker.
- Only in-view cards get writes; parked cards cost nothing.
- Per-card image parallax = direct transform on the `<img>` with a scale
  bleed (`scale(1.1)`, bleed ≥ max drift).
- Opacity and transform only — nothing that lays out or paints per frame.
- Safari: a 3D-transformed `<img>` can be sorted above later absolutely
  positioned siblings and swallow captions — give the overlays an explicit
  `z-index` and their own `translateZ(0)` layer.
- Guard `resize()` with a generation counter: rotates fire several resizes
  that interleave at the re-measure await, and a stale run finishing last
  overwrites fresh geometry.

## Tunables

| knob | feel |
| --- | --- |
| `BOW 0.15` | pincushion strength (rim spreads 1 + BOW) |
| `BULGE 0.25 / REACH 1.5` | lens strength / radius in periods |
| `FLIP 0.7` | flipped card, fraction of viewport short side |
| damp rates `0.1–0.14` | scroll glide / flip speed |
| `SHADE 0.55 / hole 0.30 × short side` | dim strength / punched-hole radius |
