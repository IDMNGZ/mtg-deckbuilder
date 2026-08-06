All app images live under this one folder, organized by what they're for:

about/       Bio photo shown on the About tab. One-off, not part of a random pool.
app-bg/      Rotating background images behind the app itself (Browse/Collection/Deck
             Builder/etc). Listed in js/app-backgrounds.js (APP_BACKGROUNDS array).
landing-bg/  Rotating background images for the landing page only. Listed in
             js/landing-backgrounds.js (LANDING_BACKGROUNDS array). Keep these as
             compressed JPEGs (~85% quality) - the raw Midjourney PNG exports are
             gitignored on purpose (see .gitignore), too heavy to commit.
other/       Landing-screen thumbnails for the About tab's "My Other Apps" cards.
             Referenced from js/other-apps.js (the `thumbnail` field per entry).
QR/          Static QR code image(s) for this app's own URL - not generated live in
             the browser, just a plain image asset.

Dropping a new file into app-bg/ or landing-bg/ doesn't make it show up automatically -
it also needs to be added to the matching array in the js/ file above. Everything else
(about/, other/, QR/) is referenced directly by filename wherever it's used, so just
update that one reference when you swap an image.
