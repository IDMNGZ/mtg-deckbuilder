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
  // The Dropbox file's revision as of our last successful download/upload - lets uploads
  // be conditional (see uploadSnapshot) instead of blindly overwriting. Not persisted:
  // a fresh pull always re-establishes it, and holding a stale rev across page loads
  // would only cause spurious conflicts.
  var lastKnownRev = null;

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

  // v2: every local profile, not just whichever one happens to be active - one Dropbox
  // connection backs up everyone sharing this device (see the Data tab's "Switch Profiles"),
  // so the file needs to carry all of them for another device connecting the same account
  // to see every profile, not just whichever was active at the moment of the last push.
  function buildPayload() {
    return {
      version: 2,
      syncedAt: new Date().toISOString(),
      profiles: Storage.getAllProfilesData(),
    };
  }

  // Uploads whatever's local right now - the raw building block. Callers almost always want
  // push() below instead, which merges in the remote first; this is only safe to call
  // directly once that merge has already happened (or there's nothing to merge, e.g. no
  // remote file exists yet).
  //
  // Conditional on lastKnownRev instead of a blind mode:"overwrite" - two devices each
  // running pull-then-upload is still two separate network round trips with a window
  // between them, so it's possible for device A's upload to land on Dropbox *between*
  // device B's download and its own upload. A blind overwrite there would silently blow
  // away A's just-written change with B's now-stale view, even though B's own merge logic
  // was correct - the file on Dropbox has no idea a merge happened locally on B, it just
  // gets replaced. Dropbox's conditional write (mode: update + the rev we last saw) turns
  // that into a 409 instead of data loss, so retryUpload can re-pull (picking up A's change
  // as well as B's own) and only then upload the fully-merged result.
  // Temporary verbose logging (see console) - the conflict-retry fix isn't converging two
  // real devices despite passing simulated tests, and profile ids were confirmed identical
  // across them, so the remaining suspects are all inside this actual network round trip.
  // Logging every step turns further debugging into reading output instead of guessing.
  function summarizeProfiles(profiles) {
    return (profiles || []).map(function (p) {
      return p.name + " (" + p.id + "): " + Object.keys(p.ownedCards || {}).length + " owned, " + (p.decks || []).length + " decks";
    });
  }

  function uploadSnapshot(retriesLeft) {
    if (retriesLeft === undefined) retriesLeft = 2;
    if (!Storage.getDropboxAuth()) return Promise.resolve();
    updateState({ syncing: true });
    var payload = buildPayload();
    var mode = lastKnownRev ? { ".tag": "update", update: lastKnownRev } : "add";
    console.log("[sync] uploadSnapshot: mode=", mode, "lastKnownRev=", lastKnownRev, "payload profiles:", summarizeProfiles(payload.profiles));
    return ensureFreshToken().then(function (token) {
      return fetch(CONTENT_ROOT + "/files/upload", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({ path: SAVE_PATH, mode: mode, mute: true }),
        },
        body: JSON.stringify(payload),
      });
    }).then(function (res) {
      console.log("[sync] upload response status:", res.status, res.ok);
      if (res.status === 409 && retriesLeft > 0) {
        console.log("[sync] upload conflict (409) - re-pulling and retrying, retriesLeft after this =", retriesLeft - 1);
        // Someone else wrote to the file since our last pull - re-pull (merging their
        // change plus ours) and try again with the fresh rev that gives us.
        return pull().then(function () { return uploadSnapshot(retriesLeft - 1); });
      }
      if (!res.ok) return res.text().then(function (t) { console.log("[sync] upload FAILED, body:", t); throw new Error(t); });
      return res.json().then(function (meta) {
        console.log("[sync] upload SUCCEEDED, new rev:", meta.rev);
        lastKnownRev = meta.rev || lastKnownRev;
        Storage.setLastSyncedAt(payload.syncedAt);
        updateState({ syncing: false, lastSyncedAt: payload.syncedAt, lastError: null });
      });
    }).catch(function (err) {
      console.log("[sync] uploadSnapshot threw:", err);
      updateState({ syncing: false, lastError: "Sync to Dropbox failed: " + err.message });
    });
  }

  // Pulls the remote file and merges it in (Storage.importData's "merge" mode: matched by
  // deck id, newer updatedAt wins, nothing ever silently dropped). Deliberately NOT
  // "replace" - a full overwrite means one device blows away another's changes on any given
  // sync, so this always merges (additive-only: union owned cards, decks match by id with
  // newer updatedAt winning) rather than replacing anything.
  //
  // ALWAYS merges when a remote file exists - it used to be gated on "remote.syncedAt is
  // newer than the last sync timestamp this device knows about," but that compared
  // timestamps written by two different devices' clocks against each other. Any clock skew
  // between devices (a phone a few minutes off, a timezone quirk, no NTP) makes a genuinely
  // newer remote save look "older" by string comparison, so the merge gets silently skipped
  // and the other device's changes never show up - exactly the "phone synced but web never
  // saw it" bug this was replaced for. Since merging is safe and non-destructive (nothing is
  // ever deleted or overwritten by older data), there's no benefit to gating it at all -
  // merging redundantly when nothing changed is a cheap no-op, so just always do it.
  function pull() {
    if (!Storage.getDropboxAuth()) return Promise.resolve();
    updateState({ syncing: true });
    console.log("[sync] pull: starting download");
    return ensureFreshToken().then(function (token) {
      return fetch(CONTENT_ROOT + "/files/download", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Dropbox-API-Arg": JSON.stringify({ path: SAVE_PATH }) },
      });
    }).then(function (res) {
      console.log("[sync] pull: download response status:", res.status, res.ok);
      if (res.status === 409) { lastKnownRev = null; return null; } // path/not_found - no remote save yet
      if (!res.ok) return res.text().then(function (t) { console.log("[sync] pull: download FAILED, body:", t); throw new Error(t); });
      // Metadata (including the file's current rev, which uploadSnapshot needs for its
      // conditional write) rides along in this header on the download endpoint, not the body.
      var resultHeader = res.headers.get("Dropbox-API-Result");
      console.log("[sync] pull: Dropbox-API-Result header =", resultHeader);
      if (resultHeader) {
        try { lastKnownRev = JSON.parse(resultHeader).rev || lastKnownRev; } catch (e) { /* leave rev as-is */ }
      } else {
        console.warn("[sync] pull: Dropbox-API-Result header missing/unreadable (CORS exposure?) - lastKnownRev stays", lastKnownRev);
      }
      return res.text();
    }).then(function (text) {
      if (text === null) {
        updateState({ syncing: false });
        return uploadSnapshot();
      }
      console.log("[sync] pull: remote content:", text.length, "bytes, resolved lastKnownRev =", lastKnownRev);
      var remote = JSON.parse(text);
      console.log("[sync] pull: remote profiles (before merge):", summarizeProfiles(remote.profiles));
      console.log("[sync] pull: local profiles (before merge):", summarizeProfiles(Storage.getAllProfilesData()));
      if (remote.profiles) {
        // Current (v2) shape: every profile together.
        Storage.mergeAllProfilesData(remote.profiles);
      } else if (remote.ownedCards) {
        // Old (v1) shape from before profiles existed - one flat owned/decks payload.
        // Merge it into whichever profile is active here rather than dropping it.
        Storage.importData(text, "merge");
      }
      console.log("[sync] pull: local profiles (after merge):", summarizeProfiles(Storage.getAllProfilesData()));
      // Purely informational from here on (shown in the Data tab) - no longer used to
      // decide whether to merge, so this device's own clock is fine to stamp it with.
      Storage.setLastSyncedAt(new Date().toISOString());
      document.dispatchEvent(new CustomEvent("mtg:remote-sync-applied"));
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
    console.log("[sync] push() called (Sync now / auto-push)");
    return pull().then(uploadSnapshot).then(function () {
      console.log("[sync] push() finished");
    });
  }

  // ---- Wiring: auto-push on local changes, auto-pull when the tab regains focus ----

  function scheduleAutoPush() {
    if (!Storage.getDropboxAuth()) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(push, AUTO_PUSH_DEBOUNCE_MS);
  }

  // A pending debounced push doesn't actually run in the background: mobile Safari (and
  // most browsers) throttle or fully suspend a backgrounded tab's timers, so a change made
  // right before switching apps/locking the phone could sit local-only indefinitely - no
  // error, no indication, just silently never reaching Dropbox even though the on-screen
  // "Synced [time]" is left over from an earlier sync and looks fine. Flushing immediately
  // the moment the tab is about to hide (still fully running, right up to that instant)
  // is the reliable point to actually send it, instead of hoping the 3s debounce survives.
  function flushPendingPush() {
    if (autoPushTimer) {
      clearTimeout(autoPushTimer);
      autoPushTimer = null;
      push();
    }
  }

  function init() {
    var auth = Storage.getDropboxAuth();
    if (auth) updateState({ connected: true, accountEmail: auth.accountEmail, lastSyncedAt: Storage.getLastSyncedAt() });

    document.addEventListener("mtg:data-changed", scheduleAutoPush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && Storage.getDropboxAuth()) pull();
      else if (document.visibilityState === "hidden") flushPendingPush();
    });
    // Backstop for cases where the tab is closed/navigated away outright rather than just
    // backgrounded - visibilitychange normally fires first, but pagehide catches it too.
    window.addEventListener("pagehide", flushPendingPush);

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
