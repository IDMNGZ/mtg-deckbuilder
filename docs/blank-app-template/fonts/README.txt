Drop your app's own branded display font here (e.g. a .ttf/.woff2 for the h1
title), then add an @font-face block in css/styles.css and css/landing.css the
same way MTG Deck Builder's own font-face was set up before it was stripped
from this template - see the comment left in place of it in both files.

Nothing else in this app needs a custom font - body text, buttons, and every
other label use the plain system-font stack already set on <body>, which is
deliberately generic and doesn't belong in this folder.
