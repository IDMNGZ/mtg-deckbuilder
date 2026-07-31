# Local-First Sync Architecture — Handoff Notes

Distilled from building and debugging MTG Deck Builder (static site, localStorage +
optional Dropbox sync, no backend). Nothing here is MTG-specific — it's the general
shape of "local-first app, one user's own cloud storage as the sync transport," plus
every bug that shape produced and how it got fixed. Most of this is worth adopting
on day one rather than rediscovering it the hard way.

## 1. The architecture, in one paragraph

Everything lives in `localStorage`, namespaced per logical "profile" (so one browser
can hold more than one person's/context's data cleanly). One optional cloud connection
(Dropbox via OAuth 2.0 PKCE — no backend, no client secret, fits a zero-server static
site) backs up every local profile together in a single JSON file. Sync is pull-then-
push, always merges instead of overwriting, and never trusts a single "is this newer"
signal in isolation — every one of those choices exists because the naive version of
it broke in a specific, confirmed way (see part 3).

## 2. Data model patterns

- **Namespace everything**: `appname:v1:profile:<id>:<key>`. Bump the `v1` prefix (or a
  narrower per-subsystem version, see the cache lesson below) when the *shape* of a
  key's data changes incompatibly, not just its content.
- **Store denormalized snapshots, not references.** An "owned card" is stored as the
  full card object, not just an ID pointing into a cache. The cache is disposable and
  can be cleared/expired at any time; the user's actual data must never depend on it
  still being present. This one decision is why a corrupted/cleared cache is a
  non-event instead of a data-loss event.
- **One shared connection, many local profiles.** The cloud auth token is *not*
  per-profile — it's a single device-level connection that every local profile syncs
  through. Modeling it per-profile was tried and reverted; it just meant reconnecting
  N times for N profiles sharing one device, for zero benefit.
- **A profile's identity is a random ID, never a hardcoded string.** A hardcoded
  "default" profile id, minted independently by each device's own first-run migration,
  is a silent collision waiting to happen the moment two devices ever share a sync
  account — the merge logic can't tell "these are the same profile" from "these
  coincidentally got the same id," and blends two unrelated collections together.

## 3. Sync bugs we actually hit, and the fix for each

These aren't hypothetical — every one of these was reported by a real user, reproduced
in a test harness, and confirmed fixed the same way. If you're building sync from
scratch, budget for all five of these existing in your first draft too.

### 3a. Comparing timestamps across two devices' clocks
**Symptom:** device B pushes real data; device A's pull skips it entirely, looks
"nothing new."
**Cause:** gating the whole merge on `remote.syncedAt > lastKnownSyncedAt` compares a
timestamp written by device A's clock against one written by device B's clock. Any
clock skew (a phone a few minutes off, no NTP, a timezone bug) makes a genuinely newer
save look older by string comparison.
**Fix:** stop gating on it. If your merge is already non-destructive (see 3c), there's
no downside to just always merging — it's a cheap no-op when nothing's actually new.
Only use a timestamp as a *display* value ("last synced at..."), never as a decision
gate for whether to trust incoming data.

### 3b. Two devices syncing at close to the same time
**Symptom:** device A pushes; moments later device B (which had started its own sync
slightly earlier) finishes uploading and silently overwrites A's change.
**Cause:** "pull, merge, then upload" is still two separate network round trips. A's
upload can land on the server in the gap between B's download and B's own upload —
B's local merge was correct, but its upload has no idea a newer version now exists on
the server; it just replaces the file.
**Fix:** conditional writes. Dropbox (and most cloud storage APIs — S3 has ETags, etc.)
support "only write if the remote hasn't changed since revision X." Upload with that
condition; on a conflict response, re-pull (picking up whatever landed) and retry.
Never do a blind unconditional overwrite once more than one writer is possible.

### 3c. "Never delete" merge undoing real deletions
**Symptom:** uncheck/delete something locally; the next sync silently brings it back.
**Cause:** a merge that's deliberately additive-only (union everything, never let a
sync destroy data) has no way to distinguish "this id hasn't synced yet" from "this id
was deliberately removed." Every id present in a remote snapshot just gets re-added,
including the one you removed ten seconds ago — and since push always pulls first,
*trying* to sync a deletion is what guarantees the stale remote copy gets re-absorbed
before your deletion ever reaches the server.
**Fix:** tombstones. Record *when* something was removed (a small `{id: removedAt}`
map, synced alongside the real data). On merge, an incoming id only gets re-added if
it's not covered by a tombstone newer than it. A genuinely newer re-add (recorded on
another device *after* your removal) still correctly wins and clears the tombstone.
Prune tombstones after a generous age (we used 180 days) so the map doesn't grow
forever — err toward "too long" over "too short," since pruning too early just
reintroduces this exact bug for anyone who hasn't synced in a while.

### 3d. Auto-sync losing a race with the browser backgrounding
**Symptom:** make a change, background the tab/app within a few seconds, and the
change never makes it to the cloud — no error, it just silently doesn't happen.
**Cause:** a debounced "wait a few seconds after the last edit, then push" pattern
assumes the JS keeps running during that wait. Mobile browsers throttle or fully
suspend timers in a backgrounded tab.
**Fix:** flush any pending debounced push immediately on `visibilitychange` ->
`hidden` (and `pagehide` as a backstop), instead of only relying on the timer. The
debounce is fine for the common case; the flush is the safety net for the case where
the user closes the lid mid-debounce.

### 3e. An unrelated storage-quota bug silently corrupting every future sync
**Symptom:** sync looks like it's running, no errors visible, but changes never
actually stick — and a "clear the cache" button reports "0 entries cleared" despite
obvious bloat.
**Cause:** a disposable response cache (in our case, cached API responses per data-set)
had no eviction policy and grew to fill the entire ~5-10MB localStorage quota over
months of use. Once storage is full, *every* write silently fails — including the
write that's supposed to persist a freshly-merged sync result. The merge computes the
right answer in memory, fails to save it, and the very next step (building the
upload) reads the old unsaved data straight back out of storage and re-uploads *that*.
Made worse: the cache's own key format had been version-bumped once already (to force
a fresh fetch after a data-shape change), and the cleanup code only ever matched the
*current* version's key prefix — leaving hundreds of orphaned entries under the old
prefix, invisible to every cache-management function, consuming most of the quota.
**Fix, two parts:**
  1. Any disposable cache needs a real eviction policy from day one: a fixed byte
     budget, oldest-entries-evicted-first, checked *before* every write (proactive),
     not just reactively "clear everything" after a write already failed.
  2. Cache cleanup logic must match cache keys *generically* (e.g. "starts with
     `cache:`") not by the current exact version string — otherwise every future
     version bump orphans the previous generation forever, silently, with no code
     path that will ever find it again.
  3. As a blast-radius limiter: any write failure from quota exhaustion should THROW,
     not silently log-and-continue, if the caller is about to read the same data back
     out to build an upload. A silently-dropped write there is indistinguishable from
     a successful one until the wrong data ships somewhere durable.

## 4. Testing methodology that actually caught these

None of the five bugs above were found by reading the code carefully — they were found
by *reproducing the exact reported symptom* in a scripted browser session:

- Run the actual app in a real browser (not a headless unit-test mock of the storage
  layer), with `fetch` monkey-patched to return controlled, scripted responses instead
  of hitting the real cloud API. This lets you simulate "device A already pushed
  before this pull runs" or "the server returns a 409 conflict" deterministically,
  without needing two real devices or real cloud credentials.
- Reproduce the *exact* scenario a user reports (same sequence of actions, same
  before/after state) before touching any code. Several of these bugs looked
  superficially like other, already-fixed bugs; only reproducing the specific
  reported sequence revealed they were actually different root causes.
- After any fix, re-run the full previous reproduction *and* a fresh one for the new
  fix, plus a full sweep of every tab/page checking for console errors. Regressions in
  adjacent, unrelated tabs are cheap to catch this way and expensive to catch later.
- When something claims to work "in isolation" but a user still reports it broken,
  don't assume the user is wrong — assume the isolated test is missing a real-world
  factor (their actual cloud state, their actual browser cache, clock skew, multiple
  open tabs). Get direct evidence from their environment (a diagnostic script they
  paste back, or — if you have local filesystem access to a synced folder — read the
  actual synced file directly) before trusting either theory.

## 5. Versioning & deployment gotchas (static hosting specifically)

- A CDN in front of static hosting (Fastly on GitHub Pages, CloudFront, etc.) can have
  **per-file independent cache propagation** — one file updates instantly, another
  lags behind for its own `Cache-Control: max-age` window. If a fix "isn't working,"
  check the *deployed* file content directly (`curl` the live URL) before assuming the
  code is wrong — more than once in this project the code was already fixed and the
  live file just hadn't caught up yet.
- Independently, a user's own browser HTTP cache can keep serving stale JS for the
  full `max-age` window even after a normal reload — a hard reload (cache-bypassing)
  is often required, and a plain refresh is not enough to prove a fix didn't work.
- A simple "new version available" banner (poll a small version file on an interval
  and on tab-focus, compare against the currently-loaded version, offer a refresh
  button) is cheap insurance against both of the above — it catches the case where a
  user's tab has been open across a deploy.
- Keep one single source of truth for the displayed version string (we used a plain
  `var APP_VERSION` in its own file, read by both the landing page and the in-app
  About/System screen) so it can't drift between two hardcoded copies.

## 6. UI patterns worth carrying over

- **One always-visible status bar**, not a settings page you have to navigate into,
  for anything the user needs to check or act on constantly (sync state, active
  profile, a manual "sync now" action). Burying frequently-used controls in a
  dedicated tab adds friction disproportionate to how often they're touched.
- Conversely, controls that are genuinely "set once, rarely revisited" (connecting a
  cloud account, export/import, resetting local data) *do* belong in a dedicated
  settings-style page — the distinction is usage frequency, not importance.
- Live-preview controls (anything with an immediate visual effect, like a size/zoom
  slider) belong wherever the user can see the effect, not tucked into settings where
  there's nothing to preview against.
- A numeric range control (a slider) tied to a raw pixel/absolute value doesn't
  translate across very different viewport sizes — the same range that gives desktop
  a dozen meaningfully different states can collapse to two states on a phone. If a
  control needs to work well on both, give it device/breakpoint-aware bounds rather
  than one global range.
- Manual actions that mutate shared state (a hard reset, a destructive delete) should
  always confirm and always explain in that confirmation exactly what will and won't
  be affected — "this clears local data / your cloud account is untouched and will
  restore it" reads very differently from a bare "Reset?" and prevents a lot of panic.

## 7. Starting checklist for a new project

If starting fresh with this same shape (local storage + optional single-cloud-account
sync), do these from day one rather than retrofitting them after a bug report:

- [ ] Random profile IDs, never hardcoded, from the very first migration/first-run path.
- [ ] Denormalized snapshots for anything the UI displays — never a bare ID into a
      cache that might not still have it.
- [ ] Merge is additive/union by default; deletions are tombstones, not silent removal.
- [ ] Sync gating never compares two different devices' clock-derived timestamps
      against each other for a go/no-go decision.
- [ ] Uploads to the shared file are conditional (revision-checked), never a blind
      overwrite, the moment more than one writer is possible.
- [ ] Any disposable cache has a byte/count budget and evicts proactively, checked
      generically (not by exact current-version key) during cleanup.
- [ ] A failed write to anything that gets read back out for an upload throws loudly
      instead of logging and continuing.
- [ ] Pending debounced work flushes on `visibilitychange`/`pagehide`, not just on its
      own timer.
- [ ] A version-check banner exists before the first deploy, not after the first
      "why isn't my fix showing up" support conversation.
