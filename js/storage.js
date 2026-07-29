// Persistence layer: everything lives in localStorage, namespaced so it never
// collides with anything else on the same origin (e.g. GitHub Pages user site).
//
// Profiles: owned cards, decks, Dropbox connection, and view preferences all live under a
// per-profile namespace (NS + "profile:" + profileId + ":" + key) so separate people sharing
// one browser/device (see the Data tab's "Switch Profiles") each get their own independent
// collection and their own independent Dropbox account, if any. The Scryfall response
// caches (sets/cards/prints) are NOT per-profile - they're just cached copies of public card
// data, identical no matter who's using the app, so sharing one copy avoids every profile
// re-fetching the same sets from Scryfall.
var Storage = (function () {
  "use strict";

  var NS = "mtg-deckbuilder:v1:";
  var KEY_PROFILES = NS + "profiles"; // [{ id, name, createdAt }]
  var KEY_ACTIVE_PROFILE = NS + "activeProfile"; // profile id (plain string, not JSON)
  var KEY_SETS_CACHE = NS + "cache:sets";
  // Bumped to "cards2" when the fetch mode changed from unique=prints to unique=cards
  // (dedupes reprints within a set), then to "cards3" when normalizeCard started keeping
  // each card's format legalities (needed for the Deck Builder's format rules) - both prefix
  // bumps force a fresh fetch instead of serving stale data missing the new shape.
  var KEY_CARDS_CACHE_PREFIX = NS + "cache:cards3:";
  // Bumped to "prints2" when the lookup switched from the card's own (sometimes-missing)
  // prints_search_uri field to a name-based query, then to "prints3" alongside the cards3
  // bump above for the same legalities reason.
  var KEY_PRINTS_CACHE_PREFIX = NS + "cache:prints3:";

  // Fired whenever owned cards or decks are mutated (not on cache/setting writes), so a
  // sync module can listen without every UI module needing to know sync exists.
  function dispatchDataChanged() {
    document.dispatchEvent(new CustomEvent("mtg:data-changed"));
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.error("Storage: failed to read", key, err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("Storage: failed to write", key, err);
      return false;
    }
  }

  // ---- Profiles ----

  function makeProfileId() {
    return "profile_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Every per-profile piece of user data this app has ever stored under a flat (pre-profile)
  // key - moving these under a profile namespace is exactly what one-time migration and
  // deleteProfile() both need the list for.
  var PROFILE_DATA_KEYS = [
    "owned", "decks", "lastBrowseSet", "mergeByName", "cardGridSize", "dropboxAuth", "lastSyncedAt",
  ];

  // Runs once: if this browser has real data sitting under the old flat (pre-profile) keys,
  // move it into a new default profile instead of leaving it orphaned/inaccessible. A
  // brand-new install has nothing under those keys, so this is a no-op there.
  //
  // Deliberately paranoid: a single key failing to copy (e.g. localStorage's ~5-10MB quota
  // getting hit mid-migration on a large collection) must not (a) lose that key's original
  // data or (b) leave KEY_PROFILES unwritten/empty, since every single read/write in this
  // module resolves an active profile first - an empty profiles list previously crashed
  // that resolution, which took down whichever tab happened to be showing with it (the
  // page's own markup rendered fine since that's static HTML, but the tab content itself
  // never did). Each key is migrated independently and only ever removed from its old
  // location after a successful copy, and a valid profiles list is guaranteed to exist by
  // the end no matter what.
  function migrateLegacyDataIfNeeded() {
    var existing = readJSON(KEY_PROFILES, null);
    if (existing && existing.length > 0) return; // already migrated (or already multi-profile)

    var profile = { id: "default", name: "Player 1", createdAt: new Date().toISOString() };
    var hadLegacyData = false;
    PROFILE_DATA_KEYS.forEach(function (base) {
      var legacyKey = NS + base;
      try {
        var raw = localStorage.getItem(legacyKey);
        if (raw !== null) {
          hadLegacyData = true;
          localStorage.setItem(profileKey(profile.id, base), raw);
          localStorage.removeItem(legacyKey);
        }
      } catch (err) {
        // Leave this one key under its legacy location rather than lose it - the
        // activeKey() read-through fallback below still finds it there.
        console.error("Storage: couldn't migrate '" + base + "' to the new profile format", err);
      }
    });
    writeJSON(KEY_PROFILES, [profile]);
    localStorage.setItem(KEY_ACTIVE_PROFILE, profile.id);
    return hadLegacyData;
  }

  function profileKey(profileId, base) {
    return NS + "profile:" + profileId + ":" + base;
  }

  function getProfiles() {
    var profiles = readJSON(KEY_PROFILES, []);
    if (profiles.length > 0) return profiles;
    // Should be unreachable (migration above always leaves at least one profile behind,
    // even on partial failure) - self-heals instead of leaving every profile-scoped read/
    // write with nothing to resolve to.
    var fallback = [{ id: "default", name: "Player 1", createdAt: new Date().toISOString() }];
    writeJSON(KEY_PROFILES, fallback);
    if (!localStorage.getItem(KEY_ACTIVE_PROFILE)) localStorage.setItem(KEY_ACTIVE_PROFILE, fallback[0].id);
    return fallback;
  }

  function getActiveProfileId() {
    var id = localStorage.getItem(KEY_ACTIVE_PROFILE);
    var profiles = getProfiles(); // never empty - see getProfiles()'s self-heal
    if (id && profiles.some(function (p) { return p.id === id; })) return id;
    return profiles[0].id;
  }

  function getActiveProfile() {
    var id = getActiveProfileId();
    return getProfiles().filter(function (p) { return p.id === id; })[0];
  }

  function setActiveProfileId(id) {
    localStorage.setItem(KEY_ACTIVE_PROFILE, id);
  }

  // Card/deck counts for a profile WITHOUT switching to it - lets the Data tab's profile
  // list show every profile's size at once.
  function getProfileStats(id) {
    var owned = readJSON(profileKey(id, "owned"), {});
    var decks = readJSON(profileKey(id, "decks"), []);
    return { owned: Object.keys(owned).length, decks: decks.length };
  }

  function createProfile(name) {
    var profile = { id: makeProfileId(), name: name, createdAt: new Date().toISOString() };
    var profiles = getProfiles();
    profiles.push(profile);
    writeJSON(KEY_PROFILES, profiles);
    return profile;
  }

  function renameProfile(id, name) {
    var profiles = getProfiles();
    profiles.forEach(function (p) { if (p.id === id) p.name = name; });
    writeJSON(KEY_PROFILES, profiles);
  }

  // Removes the profile from the list and deletes all of its namespaced data. Refuses to
  // delete the last remaining profile - there must always be at least one to be "active."
  // If the deleted profile was the active one, switches active to whichever profile is
  // first afterward (caller is still responsible for reloading/re-rendering the app so
  // every module picks up the new active profile's data).
  function deleteProfile(id) {
    var profiles = getProfiles();
    if (profiles.length <= 1) throw new Error("Can't delete the only profile.");
    PROFILE_DATA_KEYS.forEach(function (base) { localStorage.removeItem(profileKey(id, base)); });
    profiles = profiles.filter(function (p) { return p.id !== id; });
    writeJSON(KEY_PROFILES, profiles);
    if (getActiveProfileId() === id || localStorage.getItem(KEY_ACTIVE_PROFILE) === id) {
      setActiveProfileId(profiles[0].id);
    }
  }

  // Every per-profile getter/setter below reads/writes under the CURRENTLY ACTIVE profile -
  // switching profiles (Storage.setActiveProfileId + a full page reload, see the Data tab)
  // is what makes them transparently point at a different person's data.
  function activeKey(base) {
    return profileKey(getActiveProfileId(), base);
  }

  // Reads a per-profile value, falling back to the pre-profile flat key if the migrated
  // key is missing - only the original "default" profile could ever have leftover legacy
  // data (a newly created profile never had any), and only for a key that failed to copy
  // during migration (see migrateLegacyDataIfNeeded's per-key try/catch). Without this, a
  // key stuck at its legacy location would silently read back as empty forever, looking
  // exactly like data loss even though nothing was actually deleted.
  function readActiveJSON(base, fallback) {
    var key = activeKey(base);
    if (localStorage.getItem(key) !== null) return readJSON(key, fallback);
    if (getActiveProfileId() === "default" && localStorage.getItem(NS + base) !== null) {
      return readJSON(NS + base, fallback);
    }
    return fallback;
  }

  // ---- Owned cards (keyed by Scryfall print id) ----

  // Values are denormalized card snapshots (not just `true`) so the Collection
  // and Deck Builder views work even if a set's card cache has expired or been
  // cleared, and so an exported backup is self-contained.
  function getOwnedMap() {
    return readActiveJSON("owned", {});
  }

  function isOwned(scryfallId) {
    var owned = getOwnedMap();
    return !!owned[scryfallId];
  }

  function setOwned(card, owned) {
    var map = getOwnedMap();
    if (owned) {
      map[card.id] = card;
    } else {
      delete map[card.id];
    }
    writeJSON(activeKey("owned"), map);
    dispatchDataChanged();
  }

  function getOwnedIds() {
    return Object.keys(getOwnedMap());
  }

  function getOwnedCards() {
    var map = getOwnedMap();
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  // Overwrites stored card snapshots (owned cards + every deck's cards) with fresher data
  // for whichever ids are present in freshMap - keeps images/text/rarity current and heals
  // snapshots captured before an app data-shape change, without touching what's NOT owned
  // or which decks a card is in.
  function refreshCardData(freshMap) {
    var updated = 0;

    var owned = getOwnedMap();
    Object.keys(owned).forEach(function (id) {
      if (freshMap[id]) { owned[id] = freshMap[id]; updated++; }
    });
    writeJSON(activeKey("owned"), owned);

    var decks = getDecks();
    decks.forEach(function (deck) {
      deck.cards.forEach(function (entry) {
        if (freshMap[entry.card.id]) { entry.card = freshMap[entry.card.id]; updated++; }
      });
    });
    writeJSON(activeKey("decks"), decks);

    return updated;
  }

  // ---- Decks ----

  function getDecks() {
    return readActiveJSON("decks", []);
  }

  function getDeck(deckId) {
    var decks = getDecks();
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === deckId) return decks[i];
    }
    return null;
  }

  function saveDeck(deck) {
    var decks = getDecks();
    var idx = -1;
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === deck.id) { idx = i; break; }
    }
    deck.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      decks[idx] = deck;
    } else {
      deck.createdAt = deck.createdAt || deck.updatedAt;
      decks.push(deck);
    }
    writeJSON(activeKey("decks"), decks);
    dispatchDataChanged();
    return deck;
  }

  function deleteDeck(deckId) {
    var decks = getDecks().filter(function (d) { return d.id !== deckId; });
    writeJSON(activeKey("decks"), decks);
    dispatchDataChanged();
  }

  function makeDeckId() {
    return "deck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Selected edition(s) in Browse (so it reopens with the same selection) ----
  // Stored as an array of set codes so multiple editions can be viewed at once;
  // transparently migrates the older single-string format from before that existed.

  function getSelectedBrowseSets() {
    var val = readActiveJSON("lastBrowseSet", []);
    if (typeof val === "string") return val ? [val] : [];
    return Array.isArray(val) ? val : [];
  }

  function setSelectedBrowseSets(setCodes) {
    writeJSON(activeKey("lastBrowseSet"), setCodes || []);
  }

  // ---- "Merge duplicate printings by name" toggle (Collection + Deck Builder pool) ----

  function getMergeByName() {
    return readActiveJSON("mergeByName", false);
  }

  function setMergeByName(value) {
    writeJSON(activeKey("mergeByName"), !!value);
  }

  // ---- Card grid zoom (Browse/Collection/Deck Builder pool tile size) ----
  // null means "no preference yet" - the CSS media-query defaults apply untouched until
  // the user actually moves the slider, at which point their choice sticks everywhere.

  function getCardGridSize() {
    return readActiveJSON("cardGridSize", null);
  }

  function setCardGridSize(px) {
    if (px == null) {
      localStorage.removeItem(activeKey("cardGridSize"));
    } else {
      writeJSON(activeKey("cardGridSize"), px);
    }
  }

  // ---- Dropbox sync connection (optional; app works fully local without it) ----
  // Per-profile, like everything else here - each profile can connect its own Dropbox
  // account (or none at all) independent of any other profile on this device.

  function getDropboxAuth() {
    return readActiveJSON("dropboxAuth", null); // { accessToken, refreshToken, expiresAt, accountEmail }
  }

  function setDropboxAuth(auth) {
    writeJSON(activeKey("dropboxAuth"), auth);
  }

  function clearDropboxAuth() {
    localStorage.removeItem(activeKey("dropboxAuth"));
  }

  function getLastSyncedAt() {
    return readActiveJSON("lastSyncedAt", null);
  }

  function setLastSyncedAt(isoString) {
    writeJSON(activeKey("lastSyncedAt"), isoString);
  }

  // ---- Scryfall response caches (shared across profiles, safe to clear) ----

  function getSetsCache() {
    return readJSON(KEY_SETS_CACHE, null); // { timestamp, data }
  }

  function setSetsCache(data) {
    writeJSON(KEY_SETS_CACHE, { timestamp: Date.now(), data: data });
  }

  function getCardsCache(setCode) {
    return readJSON(KEY_CARDS_CACHE_PREFIX + setCode, null); // { timestamp, data }
  }

  function setCardsCache(setCode, data) {
    writeJSON(KEY_CARDS_CACHE_PREFIX + setCode, { timestamp: Date.now(), data: data });
  }

  function getPrintsCache(cardName) {
    return readJSON(KEY_PRINTS_CACHE_PREFIX + cardName, null); // { timestamp, data }
  }

  function setPrintsCache(cardName, data) {
    writeJSON(KEY_PRINTS_CACHE_PREFIX + cardName, { timestamp: Date.now(), data: data });
  }

  // ---- Export / Import (owned cards + decks only, not the bulky card cache) ----
  // Both operate on whichever profile is currently active.

  function exportData() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ownedCards: getOwnedMap(),
      decks: getDecks(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "mtg-deckbuilder-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(jsonText, mode) {
    // mode: "merge" (default) or "replace"
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error("That file isn't valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || !parsed.ownedCards || !parsed.decks) {
      throw new Error("That file doesn't look like a mtg-deckbuilder backup.");
    }

    if (mode === "replace") {
      writeJSON(activeKey("owned"), parsed.ownedCards);
      writeJSON(activeKey("decks"), parsed.decks);
      return { owned: Object.keys(parsed.ownedCards).length, decks: parsed.decks.length };
    }

    // merge: union owned cards (incoming wins on a shared id - just an ownership flag, low
    // stakes either way), decks matched by id with the more-recently-updated copy winning
    // (never silently dropped) - this is what makes it safe for DropboxSync.pull() to call
    // unconditionally instead of needing its own now-or-never timestamp gate.
    var owned = getOwnedMap();
    Object.keys(parsed.ownedCards).forEach(function (id) { owned[id] = parsed.ownedCards[id]; });
    writeJSON(activeKey("owned"), owned);

    var byId = {};
    getDecks().forEach(function (d) { byId[d.id] = d; });
    parsed.decks.forEach(function (incoming) {
      var existing = byId[incoming.id];
      if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
        byId[incoming.id] = incoming;
      }
    });
    var decks = Object.keys(byId).map(function (id) { return byId[id]; });
    writeJSON(activeKey("decks"), decks);

    return { owned: Object.keys(owned).length, decks: decks.length };
  }

  migrateLegacyDataIfNeeded();

  return {
    isOwned: isOwned,
    setOwned: setOwned,
    getOwnedIds: getOwnedIds,
    getOwnedMap: getOwnedMap,
    getOwnedCards: getOwnedCards,
    refreshCardData: refreshCardData,
    getDecks: getDecks,
    getDeck: getDeck,
    saveDeck: saveDeck,
    deleteDeck: deleteDeck,
    makeDeckId: makeDeckId,
    getSetsCache: getSetsCache,
    setSetsCache: setSetsCache,
    getCardsCache: getCardsCache,
    setCardsCache: setCardsCache,
    getPrintsCache: getPrintsCache,
    setPrintsCache: setPrintsCache,
    getSelectedBrowseSets: getSelectedBrowseSets,
    setSelectedBrowseSets: setSelectedBrowseSets,
    getMergeByName: getMergeByName,
    setMergeByName: setMergeByName,
    getCardGridSize: getCardGridSize,
    setCardGridSize: setCardGridSize,
    getDropboxAuth: getDropboxAuth,
    setDropboxAuth: setDropboxAuth,
    clearDropboxAuth: clearDropboxAuth,
    getLastSyncedAt: getLastSyncedAt,
    setLastSyncedAt: setLastSyncedAt,
    exportData: exportData,
    importData: importData,
    getProfiles: getProfiles,
    getActiveProfileId: getActiveProfileId,
    getActiveProfile: getActiveProfile,
    setActiveProfileId: setActiveProfileId,
    getProfileStats: getProfileStats,
    createProfile: createProfile,
    renameProfile: renameProfile,
    deleteProfile: deleteProfile,
  };
})();
