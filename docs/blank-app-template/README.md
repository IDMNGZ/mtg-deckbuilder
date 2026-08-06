# Blank App Template

A stripped-down, placeholder-filled copy of MTG Deck Builder's page shell and About tab -
every layout, sizing, typography, spacing, background, and image-placement decision from
that app carried over exactly, with all real content emptied out. Use this as the literal
starting point for a new static HTML/CSS/JS app when you want visual continuity with MTG
Deck Builder (and, transitively, with any other app also started from this same template).

**Not destructive to anything** - this is a standalone copy living in its own folder. It
doesn't read from, write to, or depend on the real MTG Deck Builder app in any way.

## What's here

```
index.html          landing page (blank title/subtitle/footer)
app.html             app shell: header, nav, status bar, 5 placeholder tabs, full About tab
css/styles.css        the real app.html stylesheet, copied verbatim
css/landing.css       the real index.html stylesheet, copied verbatim
js/app.js              minimal tab-routing + header-height-sync bootstrap (not MTG's real one)
js/version.js           APP_VERSION starting at v0.0.1
js/share.js              generic share-sheet/clipboard-fallback wiring, copied verbatim
js/landing-fit.js         generic title/subtitle auto-fit-to-width script, copied verbatim
js/app-backgrounds.js      empty image pool for the in-app background
js/landing-backgrounds.js  empty image pool for the landing page background
js/other-apps.js           empty "My Other Apps" list
js/ui-other-apps.js        renders js/other-apps.js into the About tab, copied verbatim
js/qr-code.js               QR generation + share-as-image wrapper, copied verbatim
js/vendor/qrcode-generator.js  vendored library (MIT, kazuhikoarase), copied verbatim
app-bg/, landing-bg/, images/other-apps/   empty folders - drop your own images in
```

## The one deliberate change from "100% verbatim"

MTG Deck Builder's page title (`.app-header h1`, `.landing-title`) uses a Magic: The
Gathering branded display font (`@font-face "MTGTitle"`, a licensed asset specific to that
app). That font-face and every reference to it were removed here - both title styles fall
back to plain Georgia/serif instead. Everything else in the CSS is byte-for-byte the real
stylesheet; **this is the only intentional deviation**. If you want your own display font,
add your own `@font-face` block the same way (there's a comment marking exactly where) and
point the two `font-family` rules at it.

Two smaller, harmless side effects of copying the CSS verbatim:
- Five color variables (`--white`, `--blue`, `--black`, `--red`, `--green`, `--gold` in
  `:root`) are actually MTG mana-symbol colors, not generic theme colors. Unused unless you
  reference them; rename or repurpose them freely.
- A handful of selectors for MTG-specific things (card grids, deck-builder panels, mana
  curve charts, etc.) exist in the stylesheet but are never referenced by this blank
  template's HTML - inert, not a problem, just extra rules sitting unused until/unless you
  build something that needs them.

## What to fill in

Everything in `app.html`'s About tab and `index.html` reads as an obvious placeholder
("Your Name", "Your App Name", empty `href="#"` links, an empty `src=""` on the bio photo).
Replace those directly. The five placeholder tabs (`Tab One`, `Tab Two`, `Reference`,
`How To Use`, `System`) are empty shells demonstrating the tab-group visual-weight pattern
(primary/secondary/info) - rename, remove, or build them out; just keep each tab link's
`data-tab` value matching its `<section id="tab-...">` and update the `TABS` array at the
top of `js/app.js` to match.

For sizing/layout of things not covered here (buttons, responsive image grids, the mobile
viewport-lock checklist, breakpoints), see
[`../LAYOUT-SIZING-REFERENCE.md`](../LAYOUT-SIZING-REFERENCE.md) in this same repo - this
template's job is the page shell and About tab specifically; that doc covers the rest of
the generic UI vocabulary.

## Running it

Same as MTG Deck Builder: classic `<script>` tags, no build step. Open `index.html`
directly, or serve the folder with any static file server.
