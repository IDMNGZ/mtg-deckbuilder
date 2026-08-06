// Fill in DROPBOX_APP_KEY after registering a free app at
// https://www.dropbox.com/developers/apps - see README.md ("Syncing across devices") for
// the full setup steps (permission type, scopes, redirect URI). Leaving this blank just
// means the Dropbox sync option won't be offered; the app still works fully local.
//
// Each new app needs its OWN Dropbox app registration - this key is NOT reusable across
// projects, even other apps built from this same template.
//
// This value is a public OAuth client id, not a secret - Dropbox's PKCE flow (see
// dropbox-sync.js) needs no client secret at all, so it's fine to commit this file
// directly once you fill it in, the same way MTG Deck Builder's real repo does. Do NOT
// treat this the way you'd treat an API secret key - it isn't one.
var SYNC_CONFIG = {
  DROPBOX_APP_KEY: "",
};
