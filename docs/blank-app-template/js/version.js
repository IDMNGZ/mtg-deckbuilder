// Single source of truth for the displayed app version - the landing page footer and the
// About tab both read this instead of hard-coding their own copy, so they can't drift out
// of sync with each other. Bump this by hand on every push (tied to git push count, e.g.
// push #12 -> v0.0.12), same convention MTG Deck Builder used.
var APP_VERSION = "v0.0.1";
