// Optional Dropbox sync: OAuth 2.0 Authorization Code flow with PKCE, which Dropbox
// supports for browser-only apps (no client secret, no backend needed - fits this app's
// zero-server architecture). Each user connects their OWN Dropbox account; the app only
// ever requests "App folder" access, a sandboxed folder Dropbox creates just for this app
// that's invisible to the rest of that user's Dropbox and to any other user. See README.md
// ("Syncing across devices") for the one-time setup needed to get a DROPBOX_APP_KEY
// (js/sync-config.js) before this does anything.
var DropboxSync = (function () {
  "use strict";

  var AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
  var TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
  var API_ROOT = "https://api.dropboxapi.com/2";
  var CONTENT_ROOT = "https://content.dropboxapi.com/2";
  var SAVE_PATH = "/mtg-deckbuilder-save.json";
  var TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
  var AUTO_PUSH_DEBOUNCE_MS = 3000;
  var PKCE_VERIFIER_KEY = "mtg-deckbuilder:dropbox:pkce-verifier";
  var PKCE_STATE_KEY = "mtg-deckbuilder:dropbox:pkce-state";
  var PKCE_REDIRECT_KEY = "mtg-deckbuilder:dropbox:pkce-redirect";

  var state = { connected: false, accountEmail: null, lastSyncedAt: null, syncing: false, lastError: null };
  var autoPushTimer = null;

  function isConfigured() {
    return !!(typeof SYNC_CONFIG !== "undefined" && SYNC_CONFIG.DROPBOX_APP_KEY);
  }

  function getStatus() {
    return {
      configured: isConfigured(),
      connected: state.connected,
      accountEmail: state.accountEmail,
      lastSyncedAt: state.lastSyncedAt,
      syncing: state.syncing,
      lastError: state.lastError,
    };
  }

  function updateState(patch) {
    for (var key in patch) { if (patch.hasOwnProperty(key)) state[key] = patch[key]; }
    document.dispatchEvent(new CustomEvent("mtg:sync-status-changed"));
  }

  function currentRedirectUri() {
    return location.origin + location.pathname;
  }

  // ---- PKCE helpers (Web Crypto API - available in all modern browsers, incl. iOS Safari) ----

  function base64UrlEncode(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomString(byteLength) {
    var bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  function sha256Base64Url(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (hashBuffer) {
      return base64UrlEncode(new Uint8Array(hashBuffer));
    });
  }

  // ---- OAuth flow ----

  function connect() {
    if (!isConfigured()) {
      window.alert("Dropbox sync isn't set up for this deployment yet (no App Key configured). See README.md.");
      return;
    }
    var verifier = randomString(64);
    var oauthState = randomString(16);
    var redirectUri = currentRedirectUri();
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_KEY, oauthState);
    sessionStorage.setItem(PKCE_REDIRECT_KEY, redirectUri);

    sha256Base64Url(verifier).then(function (challenge) {
      var params = new URLSearchParams({
        client_id: SYNC_CONFIG.DROPBOX_APP_KEY,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        redirect_uri: redirectUri,
        token_access_type: "offline",
        state: oauthState,
      });
      location.href = AUTH_URL + "?" + params.toString();
    });
  }

  // Call once on every page load - no-ops unless the URL has an OAuth redirect in it.
  // Resolves true if a redirect was handled (whether it succeeded or failed).
  function handleRedirectIfPresent() {
    var params = new URLSearchParams(location.search);
    var code = params.get("code");
    var returnedState = params.get("state");
    var error = params.get("error");
    if (!code && !error) return Promise.resolve(false);

    // Strip the code/state from the URL immediately so refreshing doesn't replay a spent code.
    history.replaceState(null, "", location.pathname + location.hash);

    if (error) {
      updateState({ lastError: "Dropbox authorization was cancelled or failed." });
      return Promise.resolve(true);
    }

    var expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
    var verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    var redirectUri = sessionStorage.getItem(PKCE_REDIRECT_KEY);
    sessionStorage.removeItem(PKCE_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_REDIRECT_KEY);

    if (!verifier || returnedState !== expectedState) {
      updateState({ lastError: "Dropbox sign-in failed a security check - please try connecting again." });
      return Promise.resolve(true);
    }

    var body = new URLSearchParams({
      code: code,
      grant_type: "authorization_code",
      client_id: SYNC_CONFIG.DROPBOX_APP_KEY,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    return fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }).then(function (res) { return res.json(); }).then(function (tokenRes) {
      if (tokenRes.error) throw new Error(tokenRes.error_description || tokenRes.error);
      Storage.setDropboxAuth({
        accessToken: tokenRes.access_token,
        refreshToken: tokenRes.refresh_token,
        expiresAt: Date.now() + (tokenRes.expires_in * 1000),
        accountEmail: null,
      });
      updateState({ connected: true, lastError: null });
      return refreshAccountEmail().then(pull);
    }).catch(function (err) {
      updateState({ lastError: "Couldn't finish connecting to Dropbox: " + err.message });
    }).then(function () { return true; });
  }

  function disconnect() {
    Storage.clearDropboxAuth();
    Storage.setLastSyncedAt(null);
    updateState({ connected: false, accountEmail: null, lastSyncedAt: null, lastError: null });
  }

  function ensureFreshToken() {
    var auth = Storage.getDropboxAuth();
    if (!auth) return Promise.reject(new Error("Not connected to Dropbox."));
    if (Date.now() < auth.expiresAt - TOKEN_REFRESH_SKEW_MS) return Promise.resolve(auth.accessToken);

    var body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
      client_id: SYNC_CONFIG.DROPBOX_APP_KEY,
    });
    return fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }).then(function (res) { return res.json(); }).then(function (tokenRes) {
      if (tokenRes.error) throw new Error(tokenRes.error_description || tokenRes.error);
      auth.accessToken = tokenRes.access_token;
      auth.expiresAt = Date.now() + (tokenRes.expires_in * 1000);
      Storage.setDropboxAuth(auth);
      return auth.accessToken;
    });
  }

  function refreshAccountEmail() {
    return ensureFreshToken().then(function (token) {
      return fetch(API_ROOT + "/users/get_current_account", {
        method: "POST",
        // Every Dropbox API call needs a body, even parameterless ones like this ("null" is
        // the documented convention) - omitting it entirely gets rejected as a bad request.
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: "null",
      });
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
      return res.json();
    }).then(function (info) {
      var auth = Storage.getDropboxAuth();
      if (auth) { auth.accountEmail = info.email; Storage.setDropboxAuth(auth); }
      updateState({ accountEmail: info.email });
    }).catch(function (err) {
      // Cosmetic only (doesn't affect actual syncing) - log it so it's diagnosable, but
      // don't surface it as a user-facing sync error.
      console.error("Dropbox: couldn't fetch account email:", err);
    });
  }

  // ---- Push / Pull ----

  function buildPayload() {
    return {
      version: 1,
      syncedAt: new Date().toISOString(),
      ownedCards: Storage.getOwnedMap(),
      decks: Storage.getDecks(),
    };
  }

  // Uploads whatever's local right now, unconditionally - the raw building block. Callers
  // almost always want push() below instead, which merges in the remote first; this is only
  // safe to call directly once that merge has already happened (or there's nothing to
  // merge, e.g. no remote file exists yet).
  function uploadSnapshot() {
    if (!Storage.getDropboxAuth()) return Promise.resolve();
    updateState({ syncing: true });
    var payload = buildPayload();
    return ensureFreshToken().then(function (token) {
      return fetch(CONTENT_ROOT + "/files/upload", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({ path: SAVE_PATH, mode: "overwrite", mute: true }),
        },
        body: JSON.stringify(payload),
      });
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
      Storage.setLastSyncedAt(payload.syncedAt);
      updateState({ syncing: false, lastSyncedAt: payload.syncedAt, lastError: null });
    }).catch(function (err) {
      updateState({ syncing: false, lastError: "Sync to Dropbox failed: " + err.message });
    });
  }

  // Pulls the remote file and merges it in (Storage.importData's "merge" mode: matched by
  // deck id, newer updatedAt wins, nothing ever silently dropped). Deliberately NOT
  // "replace" - this used to be a last-write-wins full overwrite gated on "remote is newer
  // than the last sync we know about," but that gate has a sharp edge: the very first pull
  // after a (re)connect has no "last known sync" to compare against, so it fell through to
  // an UNCONDITIONAL overwrite - any local-only change made since the previous device's
  // last push (e.g. a deck saved locally right before a refresh beat the 3s auto-push to
  // Dropbox) would be silently destroyed by an older remote snapshot. Merging instead means
  // even that unconditional case can only add/update from the remote, never delete
  // something newer that's only local so far. If no remote file exists yet, seeds it with
  // whatever's local.
  function pull() {
    if (!Storage.getDropboxAuth()) return Promise.resolve();
    updateState({ syncing: true });
    return ensureFreshToken().then(function (token) {
      return fetch(CONTENT_ROOT + "/files/download", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Dropbox-API-Arg": JSON.stringify({ path: SAVE_PATH }) },
      });
    }).then(function (res) {
      if (res.status === 409) return null; // path/not_found - no remote save yet
      if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
      return res.text();
    }).then(function (text) {
      if (text === null) {
        updateState({ syncing: false });
        return uploadSnapshot();
      }
      var remote = JSON.parse(text);
      var lastKnown = Storage.getLastSyncedAt();
      if (!lastKnown || remote.syncedAt > lastKnown) {
        Storage.importData(text, "merge");
        Storage.setLastSyncedAt(remote.syncedAt);
        document.dispatchEvent(new CustomEvent("mtg:remote-sync-applied"));
      }
      updateState({ syncing: false, lastSyncedAt: Storage.getLastSyncedAt(), lastError: null });
    }).catch(function (err) {
      updateState({ syncing: false, lastError: "Sync from Dropbox failed: " + err.message });
    });
  }

  // The "push" every caller actually wants: pull-and-merge the remote in first, THEN
  // upload. With two devices in play, a device that's fallen behind would otherwise upload
  // its own (comparatively stale) local view with mode:"overwrite" and blow away whatever
  // the OTHER device had already synced to Dropbox in the meantime, even though pull()
  // itself now merges safely once data is back on this device - that protection only
  // covers the local side, not the shared file. Pulling first means whatever gets
  // uploaded already reflects both devices' known changes.
  function push() {
    return pull().then(uploadSnapshot);
  }

  // ---- Wiring: auto-push on local changes, auto-pull when the tab regains focus ----

  function scheduleAutoPush() {
    if (!Storage.getDropboxAuth()) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(push, AUTO_PUSH_DEBOUNCE_MS);
  }

  function init() {
    var auth = Storage.getDropboxAuth();
    if (auth) updateState({ connected: true, accountEmail: auth.accountEmail, lastSyncedAt: Storage.getLastSyncedAt() });

    document.addEventListener("mtg:data-changed", scheduleAutoPush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && Storage.getDropboxAuth()) pull();
    });

    if (auth) pull();
  }

  return {
    isConfigured: isConfigured,
    getStatus: getStatus,
    connect: connect,
    disconnect: disconnect,
    handleRedirectIfPresent: handleRedirectIfPresent,
    push: push,
    pull: pull,
    init: init,
  };
})();
