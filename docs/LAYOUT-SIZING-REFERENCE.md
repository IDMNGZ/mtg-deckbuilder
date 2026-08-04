# Layout & Sizing Reference

Exact numbers pulled directly from MTG Deck Builder's `css/styles.css` and `js/app.js`,
for reuse in a differently-themed app. This is deliberately **sizing/layout only** — no
colors, fonts, or MTG-specific content — so it drops into a project with a totally
different look without dragging any of this app's branding along.

## 1. Overall page container ("tab content width")

```css
#app {
  padding: 16px 20px 40px;
  max-width: 1400px;
  margin: 0 auto;
}
```

Everything (header aside) lives inside `#app`, centered, capped at 1400px. On anything
wider than that, the extra space is just background — the content itself never stretches
edge-to-edge on a wide monitor. This is the answer to "tab content is too wide/narrow": one
`max-width` in one place, not per-tab.

## 2. Header ("the dashboard")

**Desktop / default:**
```css
.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.app-header h1 { font-size: 22px; margin: 0; text-align: center; }
```

**Mobile portrait** (`max-width: 600px and orientation: portrait`):
```css
.app-header { padding: 8px 10px; gap: 6px; }
.app-header h1 { font-size: 15px; }
```
Nav collapses into a horizontally-scrollable single row below the title (see §5) instead
of wrapping to multiple rows — keeps the header from eating a big chunk of a short phone
screen.

**Mobile landscape, short viewport** (`orientation: landscape and max-height: 500px`) —
the header becomes a **fixed left sidebar** instead of a top bar, since landscape phones
have almost no vertical room:
```css
.app-header {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 130px;
  flex-direction: column;
  align-items: stretch;
  padding: 10px 8px;
  overflow-y: auto;
  z-index: 20;
}
.app-header h1 { font-size: 13px; }
/* main content shifts right to make room */
#app { margin: 0 0 0 130px; max-width: none; padding: 12px 14px 30px; }
```

**The header's real height is measured by JS, not assumed.** Anything that needs to sit
"just below the header" (a sticky sub-header, in this app's case) reads a CSS custom
property kept in sync automatically:
```js
function syncHeaderHeight() {
  var header = document.querySelector(".app-header");
  document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
}
// call once on load, plus on window resize, plus via ResizeObserver on the header itself
```
```css
:root { --header-h: 60px; } /* fallback before JS runs */
.sticky-controls { position: sticky; top: var(--header-h); }
```
This is the fix for "my sticky sub-header either overlaps the main header or leaves a gap"
— hardcoding a pixel value breaks the moment the header's own height changes (responsive
font size, wrapping, etc.); measuring it live doesn't.

## 3. Secondary status/info bar (profile · sync · view controls row)

```css
.data-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  border-radius: 8px;
  padding: 6px 14px;
}
.data-status-label { font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
.data-status-value { font-size: 12px; font-weight: 600; }
```
Compact by design (6px vertical padding) — this row is meant to be glanced at, not read
carefully, so it stays visually small compared to the header above it.

## 4. Buttons

```css
.btn {
  border: 1px solid var(--border);
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
```
Every button in the app uses this base, then a modifier class only changes color/weight
(`.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-accent`) — never a separate padding or
font-size per button. That's the fix for "buttons are inconsistent sizes across the app":
one shared size rule, color-only variants.

Small icon-style buttons (e.g. the deck-list's remove button) are a fixed square instead
of following the text-button padding:
```css
.icon-btn-small {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
}
```

## 5. Images / card grid (the general "responsive image grid" pattern)

```css
:root {
  --card-min-w: 200px;         /* desktop default tile floor */
  --card-min-w-compact: 160px; /* "compact" density variant */
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-min-w), 1fr));
  gap: 14px;
}
.card-tile img { width: 100%; border-radius: 6px; display: block; }
```
`auto-fill` + `minmax(var(--...), 1fr)` is the actual mechanism: the grid fits as many
columns as will comfortably hold at least `--card-min-w` each, then stretches them evenly
to fill remaining width — no JS needed to compute column count, and it reflows correctly
at any viewport width automatically.

**The tile-size floor is breakpoint-aware, not one fixed number**, because a single global
range collapses to 1-2 useful sizes on a phone (a slider that goes 100px→400px looks fine
on desktop but does almost nothing perceptible on a 375px-wide screen). A user-facing zoom
slider's min/max is recalculated per breakpoint:
```js
function cardSizeRangeForViewport() {
  var isPortrait = window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
  var isLandscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
  if (isPortrait) return { min: 110, max: 190 };
  if (isLandscape) return { min: 100, max: 180 };
  return { min: 170, max: 280 };
}
```
On phone portrait: 140px default floor (`:root` override inside that media query). Mobile
grid gap tightens too (`gap: 10px` vs. 14px on desktop) since there's less room to spare.

## 6. Breakpoints used throughout

| Breakpoint | Used for |
|---|---|
| `max-width: 900px` | Two-column layouts stack to one column (e.g. Deck Builder's summary/list panels) |
| `max-width: 600px and orientation: portrait` | Phone portrait: header compacts, nav collapses to a scrollable strip, card grid floor shrinks |
| `orientation: landscape and max-height: 500px` | Phone landscape: header becomes a fixed left sidebar, `#app` margin shifts right to compensate |
| `max-width: 500px` | Smallest fine-tuning (e.g. a form row wrapping to full width) |

Only four breakpoints total, each tied to a real behavioral change (not one per pixel
tweak) — keeps the responsive CSS from sprawling into dozens of near-duplicate rules.

## 7. Background images (landing page vs. in-app background)

These are two separate systems in this app — a full-page background behind the app's own
tabs, and a different one for the marketing/landing page — because they have different
jobs and different source art.

**App-wide background (behind every tab, `app.html`):**
```html
<!-- first child of <body> -->
<div id="app-bg-layer"></div>
```
```css
#app-bg-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  background-image: linear-gradient(rgba(20, 21, 26, 0.8), rgba(20, 21, 26, 0.8)), var(--app-bg, none);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
```
- **`position: fixed` on a real element**, not `background-attachment: fixed` on `body`
  directly — iOS Safari has a long-standing bug where a "fixed" background actually
  scrolls with the page; a genuinely `position: fixed` element doesn't have that problem
  anywhere.
- **`var(--app-bg, none)`** — JS picks a random image from a pool and sets `--app-bg` on
  `:root` before paint; falls back to fully transparent (the page's own solid background
  color shows through) if nothing's been set yet.
- **The dark gradient is layered on top of the image** in the same `background-image`
  stack (first-listed = frontmost), tinting the art so text sitting directly on the page
  background (not inside a bordered panel) stays legible against any image in the pool.

**Landing/marketing page background (`index.html`, separate `css/landing.css`):**
```css
body.landing-page {
  min-height: 100vh;
  background-color: #0a0c14; /* fallback solid color */
  background-image: var(--landing-bg, url('fallback.svg'));
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
@media (min-width: 900px) {
  body.landing-page { background-size: contain; }
}
```
```js
// inline <script> in <head>, runs before body paints - no flash of the fallback image
var choice = LANDING_BACKGROUNDS[Math.floor(Math.random() * LANDING_BACKGROUNDS.length)];
document.documentElement.style.setProperty("--landing-bg", "url('" + new URL(choice, location.href).href + "')");
```
- **Picked and set before first paint** (inline script in `<head>`, not `DOMContentLoaded`)
  specifically to avoid a visible swap from fallback to real image.
- **`cover` vs. `contain` switches at a breakpoint tied to the source art's own aspect
  ratio, not an arbitrary number.** This app's source images are portrait (896×1344); on a
  wide desktop viewport, `cover` would need to scale past native resolution and crop most
  of the image (blurry, over-cropped). `contain` above 900px shows the whole image,
  letterboxed with the solid `background-color`. Below 900px, phone aspect ratios are close
  enough to the art's own ratio that `cover` still looks right without heavy cropping. **Pick
  your own breakpoint/ratio based on Music Theory App's actual source art's aspect ratio** —
  the reusable idea is "switch to `contain` once `cover` would over-crop," not the literal
  900px value.

## 8. Locking the app to the visible viewport on mobile

"The app isn't locked to the screen" on mobile is almost always **horizontal overflow** —
some element is wider than the viewport, so the browser allows panning/zooming past the
edge even with a viewport meta tag in place. Four layers, each catching a different cause
(all four together are what keep this app locked):

1. **Viewport meta tag** — necessary but not sufficient alone:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
   ```
2. **`box-sizing: border-box` globally** — without this, an element's declared width
   doesn't include its own padding/border, so a `width: 100%` element with padding quietly
   ends up wider than its container:
   ```css
   * { box-sizing: border-box; }
   ```
3. **`overflow-x: hidden` as a backstop, not the actual fix** — hides the symptom (no
   horizontal scrollbar/pan) but something underneath is still technically too wide:
   ```css
   html, body { overflow-x: hidden; }
   ```
4. **The real fix: `min-width: 0` on whichever flex/grid child is actually overflowing.**
   Flex and grid items default to an *implicit* minimum width based on their content's
   natural (min-content) size — a nested `auto-fill` grid, a long unbroken string, or a wide
   inline element inside a flex/grid child can silently force that child (and its whole
   row/column) wider than the viewport, even when every explicit `width` in the CSS looks
   correct. Fix is one line on the specific overflowing container:
   ```css
   .some-flex-or-grid-child { min-width: 0; }
   ```
   For a *column* layout that overflows vertically instead, the same idea applies as
   `min-height: 0` — see `PROJECT-NOTES.md` in this repo for a worked example of that
   failure mode (and a caution about when adding `min-height: 0` causes a different problem,
   content overflowing past its own border, so verify nothing clips after adding it).

**How to actually find the culprit:** open the page at a mobile width, then check
`document.documentElement.scrollWidth` vs. `window.innerWidth` in devtools/console — if
`scrollWidth` is bigger, something's overflowing. Add `outline: 1px solid red` to top-level
containers one at a time until the wide one is visually obvious, then add `min-width: 0` to
*that specific element* — not as a blanket rule on everything, since it can change how
other layouts that rely on default min-content sizing behave.

## How to use this in a differently-styled app

Copy the **numbers and mechanisms** (the `#app` max-width, the header-height-via-JS
pattern, the button base-plus-modifier structure, the `auto-fill`/`minmax` grid formula,
the breakpoint list) — not the actual `--bg`/`--accent`/font values, which are this app's
own color theme. The sizing logic is what was fought over and fixed through real bug
reports; the colors are just this app's taste.
