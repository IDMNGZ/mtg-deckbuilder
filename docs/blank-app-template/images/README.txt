All app images live under this one folder, organized by what they're for - same
convention as MTG Deck Builder's own images/ (see that app's images/README.txt).

about/       Bio photo shown on the About tab. One-off, not part of a random pool.
app-bg/      Rotating background images behind the app itself. Listed in
             js/app-backgrounds.js (APP_BACKGROUNDS array).
landing-bg/  Rotating background images for the landing page only. Listed in
             js/landing-backgrounds.js (LANDING_BACKGROUNDS array). If your source
             images are large raw exports (e.g. straight out of Midjourney/an AI
             tool) with a separate compressed copy that actually ships, gitignore
             the raw originals the same way MTG Deck Builder's .gitignore does
             (images/landing-bg/*.png, images/app-bg/*.png) - watch the pattern's
             depth: a bare "landing-bg/*.png" only matches a TOP-LEVEL landing-bg/
             folder, not this nested images/landing-bg/*.png path.
other/       Landing-screen thumbnails for the About tab's "My Other Apps" cards.
             Referenced from js/other-apps.js (the `thumbnail` field per entry).
QR/          Optional: a static QR code image for this app's own URL, if you want
             one. Not generated live in the browser - see js/qr-code.js if you want
             to generate one (it's still vendored here even though nothing calls it
             by default - see that file's own comment).

Dropping a new file into app-bg/ or landing-bg/ doesn't make it show up automatically -
it also needs to be added to the matching array in the js/ file above. Everything else
(about/, other/, QR/) is referenced directly by filename wherever it's used, so just
update that one reference when you swap an image.
