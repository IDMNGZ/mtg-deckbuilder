Drop app-wide background images here (jpg/png/webp all work) - these are the
background behind the actual app (Browse/Collection/Deck Builder/etc.), separate
from landing-bg/ which is only used on the landing page.

After adding a file, it also needs to be listed in js/app-backgrounds.js for it
to actually be used - just add "app-bg/your-file.jpg" to the APP_BACKGROUNDS
array. Easiest path: hand the image file to Claude and say what it is - it'll
add the entry and push for you.

One background from the list is picked at random every time the app loads. Keep
these compressed (JPEG @ ~85% quality is what the landing page images use) -
large PNGs are too heavy to serve as a background and too heavy to keep
committing to the repo.

Since every panel in the app (card tiles, section boxes, the header) already
sits on its own solid dark background, this only shows through in the gaps
around them - a busy or very bright image will look fine, but darker/moodier
art works especially well since there's also a dark tint applied on top of it
for text readability in the un-boxed areas (status bar area, filter rows, etc).
