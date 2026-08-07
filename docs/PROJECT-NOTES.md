# MTG Deck Builder — Project Notes

**This is a living document.** Read it at the start of any new session working on this
app, and update it whenever a notable feature, convention, or decision changes — this
file is what lets a fresh session (or a fresh person) pick up where the last one left
off without re-deriving context from scratch. It's development-facing; `README.md` is
the user/friend-facing setup doc and doesn't need to change as often.

Repo: `github.com/IDMNGZ/mtg-deckbuilder` · Live: `idmngz.github.io/mtg-deckbuilder/` ·
Local: `X:\APP_projects\mtg-deckbuilder`

For the general local-first sync architecture (data model, the five sync bugs and their
fixes, testing methodology) see [`SYNC-ARCHITECTURE-HANDOFF.md`](SYNC-ARCHITECTURE-HANDOFF.md)
in this same folder — that doc was written to be portable to *other* apps too, so it
covers the "why" behind the sync design in more depth than repeated here.

For UI/UX design patterns worth reusing and notes on how this user likes to collaborate,
see [`UI-DESIGN-AND-COLLABORATION-HANDOFF.md`](UI-DESIGN-AND-COLLABORATION-HANDOFF.md) —
also written to travel to other projects, not specific to this app.

For exact copy-pasteable CSS numbers (container width, header/status-bar sizing, button
dimensions, responsive image-grid formula, breakpoint list), see
[`LAYOUT-SIZING-REFERENCE.md`](LAYOUT-SIZING-REFERENCE.md) — sizing/layout only, no colors
or fonts, so it drops into a differently-themed app cleanly.

For a literal starting point (not just documentation) — a working, placeholder-filled copy
of this app's page shell, About tab, and full persistence/Dropbox-sync/System-tab backend
(profiles, sync, backup, reset — not a stub, it runs out of the box) — see
[`blank-app-template/`](blank-app-template/README.md). Unlike the sizing reference above,
this one carries full visual continuity (fonts, exact CSS) and working code, not just
numbers and prose.

**Starting an actual new app from any of this?** Read
[`NEW-APP-HANDOFF.md`](NEW-APP-HANDOFF.md) first — it's the single entry point that ties
all four docs above together into one checklist, instead of reading them in whatever order
seems reasonable.

## Current shape of the app

Static HTML/CSS/JS, no build step, no backend. Tabs: Browse, Collection, Buy, Deck
Builder, My Decks, MTG Rules, Links, How To Use, System, About. Status bar (below the
profile header) holds always-visible controls: Sync, Share, Merge Dupes toggle, card-size
slider.

`js/` file map:
- `storage.js` — localStorage persistence, profile management, tombstoned deletions, export/import
- `dropbox-sync.js` — OAuth PKCE + conditional-write push/pull
- `sync-config.js` — Dropbox app key; committed directly (not gitignored) since it's a public OAuth client id, not a secret — see README
- `ui-buy.js` — "Buy" tab: cards tagged from Browse via `Storage.setWishlisted()` (its own tombstoned map, see storage.js), each tile linking out to Scryfall's `purchase_uris` (TCGplayer/Cardmarket/etc, convenience links only — no affiliate ID configured)
- `scryfall.js` — API wrapper + card normalization (handles single-faced vs. `card_faces` cards)
- `card-view.js` / `card-filters.js` — shared card rendering + filter UI
- `qr-code.js` — thin wrapper around `vendor/qrcode-generator.js` (vendored locally, MIT, kazuhikoarase); used to generate the static `images/QR/mtg-deckbuilder-qr.png` asset, not called live in the running app
- `other-apps.js` / `ui-other-apps.js` — hand-edited "My Other Apps" list + its About-tab renderer (optional thumbnail, Visit link, plain-link Share button per entry via `ShareApp.wire()`'s per-call `{url, title, text}` override)
- `deck-view.js` — modal showing a whole deck as a grouped visual card grid (used by both My Decks and Deck Builder's "View" buttons)
- `ui-browse.js`, `ui-collection.js`, `ui-deckbuilder.js`, `ui-decks.js`, `ui-rules.js`, `ui-data.js` — per-tab UI logic
- `formats.js` — deck format definitions (Commander, Standard, etc.)
- `app.js` — bootstrap, tab routing, card-size slider wiring
- `app-backgrounds.js` / `landing-backgrounds.js` / `landing-fit.js` — rotating background image systems (app-wide and landing-page, separate pools)
- `share.js` — single shared "Share this app" implementation (OS share sheet, clipboard fallback)
- `version.js` — single source of truth for `APP_VERSION`

## Conventions established this project (worth keeping consistent)

- **Version bump every push.** `js/version.js`'s `APP_VERSION`, tied loosely to push
  count (push #94 → `v0.1.94`). Landing page and About tab both read this one constant.
- **Commit messages explain *why*, not just *what*** — the root cause of a bug, or the
  reasoning behind a UI change, not a restated diff. `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>` on every commit.
- **Testing = reproduce in a real browser, not just read the code.** Use the
  `mtg-deckbuilder-static` preview server (port 8090, config in `.claude/launch.json`),
  monkey-patch `fetch`/`navigator.share`/`navigator.clipboard` via `javascript_exec` to
  simulate exact scenarios, and run a full sweep of every tab checking for console
  errors before shipping any change. Screenshot tooling has been unreliable in this
  environment — computed-style/DOM assertions are the fallback.
- **Denormalized data, tombstoned deletions, conditional writes** — see the handoff doc.
  Any new synced field needs to follow the same pattern (add to `PROFILE_DATA_KEYS`,
  consider whether it needs its own tombstone map if it's deletable).
- **Breakpoint-aware controls over one global range** — the card-size slider's min/max
  changes by viewport (`cardSizeRangeForViewport()` in `app.js`) rather than one range
  that collapses to 1-2 useful values on mobile. Reuse this pattern for any future
  slider/control that behaves differently across device sizes.
- **One status bar for frequent actions, dedicated tabs for rare ones** — Sync/Share/
  view-controls live in the always-visible status bar; account-setup/export-import-type
  actions live in the System tab. Keep new frequent-use controls in the status bar
  rather than burying them in a tab.
- **New situational features expand in place, not a new tab or a merged tab.** The
  visual deck view (`deck-view.js`) was deliberately built as a "View" button that opens
  a modal from within My Decks/Deck Builder, not a 10th nav tab or a merge of the two
  existing ones — nav real estate is scarce and a merge risks two working modules for a
  purely additive feature. Default to this shape for anything similar.

## Known gotchas specific to this local setup

- **The `mtg-deckbuilder-static` preview server caches its resolved project path at
  startup**, not per-request. If the project folder is ever moved/renamed again while a
  server from a previous session is still running, new requests for files that were
  never fetched before (browser has no cached copy) will silently 404 even though the
  page appears to load fine (already-cached scripts still serve from the browser's own
  HTTP cache). Fix: stop the stale server (`preview_stop`) and start a fresh one - don't
  assume "the page loaded" means the server's path resolution is actually still correct.
- **Renaming a shared lookup function (e.g. `findEntry` → `findEntryByName`) needs a
  grep for every call site, not just the ones touched by whatever feature prompted the
  rename.** `removeOne()` kept calling the old `findEntry` name after it was renamed
  during the Commander singleton-rule fix, silently breaking the deck list's remove
  button for a full session before it was caught by user report. Always `grep` the old
  name across the whole file (not just the function you're editing) after any rename.
- **Nested `flex: 1` chains only distribute space evenly if every level's automatic
  min-height cooperates.** Two flex-grow siblings with different natural content sizes
  (e.g. one with a caption+legend, one with just a short list) will NOT split extra
  space 50/50 - the one with more inherent content claims more of it first, which is
  correct/expected, not a bug. Adding `min-height: 0` to "fix" that unevenness removes
  the safety net entirely and can make a section's content overflow past its own border
  instead. Don't reach for `min-height: 0` unless you've confirmed nothing overflows.

## Feature ideas discussed but not built

Parked, not rejected — revisit if priorities change:

| Idea | Shape | Notes |
|---|---|---|
| Deck share link | Encode a deck (name/format/cards) into a URL hash, decode + preview-import on load | Feasible — decks already store full card snapshots. Needs a decision on how an imported deck interacts with the "only owned cards" builder rule (leaning: imported cards display fine as-is, owned-only rule only applies when adding *more* cards afterward). |
| Deck import/export as text | Standard `qty name` list format compatible with Moxfield/Archidekt/MTGO | Export is trivial; import needs name-matching against owned cards plus a "not found" summary UI. |
| Collection value estimate | Capture `prices.usd` at normalize time, sum owned cards on System tab | Prices are a cache-time snapshot, not live — label accordingly. |
| Own TCGplayer/etc. affiliate links | Swap the Buy tab's plain `purchase_uris` links for ones carrying your own affiliate ID | Needs registering with each vendor's affiliate program first (user explicitly opted for convenience-only links for now, no affiliate status) — see `ui-buy.js` and `card-view.js`'s buy-actions block. |
| Deck notes field | Free-text `deck.notes`, textarea in Deck Builder | Cheapest of all of these — one field, one textarea. |
| Offline support (service worker) | Cache app shell + viewed Scryfall data | Higher risk — needs its own cache-versioning scheme independent of `APP_VERSION`, and can fight the existing "new version available" banner if not taught `skipWaiting()`/`clients.claim()`. Test deliberately, don't fold in casually. |
| One-tap "Add to Home Screen" | Web app manifest + `beforeinstallprompt` | True one-tap only works on Android/Chrome. iOS Safari has no API for this at all — best case there is a guided on-screen instruction, not automation. Worth a manifest regardless (cleaner icon/splash on both platforms). |

## Open items from the last session

- None blocking — most recently (`v0.1.115`) added a **Buy tab**: cards get tagged from
  Browse (bookmark icon on a per-printing tile, unmerged view only) via a new
  `Storage.setWishlisted()`/`isWishlisted()` pair backed by its own tombstoned `wishlist`
  map (mirrors `owned`/`ownedRemoved` - full denormalized snapshots, safe to merge
  "remote wins," since nothing mutates a wishlist entry in place the way Favorites'
  bug 3f did). Each Buy tab tile links out to whichever vendors Scryfall's
  `purchase_uris` has for that printing (now captured in `scryfall.js`'s
  `normalizeCard()`, previously discarded) - convenience links only, no affiliate ID
  configured, per explicit user choice. Owning a wishlisted card auto-clears its
  wishlist entry. Also added the Favorites fix (bug 3f, see
  `SYNC-ARCHITECTURE-HANDOFF.md`) in the prior round, and this Buy feature deliberately
  followed that same tombstoned-map pattern from the start rather than repeating the
  mistake.
- Before that, `docs/blank-app-template/` was refreshed to match the
  current app (folder names, Other-Apps card grid) and extended with a full working
  persistence/Dropbox-sync/System-tab backend (`storage.js`, `dropbox-sync.js`,
  `system-tab.js` — genericized versions of this app's own real files, verified running
  end-to-end with zero console errors, not just described in prose), plus a new
  [`NEW-APP-HANDOFF.md`](NEW-APP-HANDOFF.md) tying it and the three existing companion
  docs together into one starting checklist for bootstrapping a new app project. Nothing
  in the live MTG Deck Builder app itself changed as part of this — docs/template only.
- Before that, last shipped change (`v0.1.110`) consolidated all app images under
  one `images/` folder (`images/about/`, `images/app-bg/`, `images/landing-bg/`,
  `images/other/`, `images/QR/` — see `images/README.txt`), pointed every JS/HTML
  reference at the new paths, and updated `.gitignore`'s raw-PNG-exclusion patterns to
  match the new nesting (a pattern with a mid-string slash is anchored to the
  `.gitignore` file's own directory, so `landing-bg/*.png` does NOT match the new
  `images/landing-bg/*.png` — the prefix has to be spelled out). Also reverted the Other
  Apps cards' Share button back to plain link sharing (dropped the file-attachment
  `getFiles` option and the per-card live QR render) and deleted the unused
  `card-back-bg.svg` / `favicon.svg`. `.claude/launch.json`'s `mtg-deckbuilder-static`
  entry was also fixed — it still pointed at the project's old `X:\Projects\...` path
  from before an earlier move to `X:\APP_projects\...`, which was silently 404-ing any
  file that wasn't already browser-cached (see the stale-path gotcha above).
