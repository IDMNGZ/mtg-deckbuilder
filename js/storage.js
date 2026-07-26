// Persistence layer: everything lives in localStorage, namespaced so it never
// collides with anything else on the same origin (e.g. GitHub Pages user site).
var Storage = (function () {
  "use strict";

  var NS = "mtg-deckbuilder:v1:";
  var KEY_OWNED = NS + "owned";
  var KEY_DECKS = NS + "decks";
  var KEY_SETS_CACHE = NS + "cache:sets";
  // Bumped to "cards2" when the fetch mode changed from unique=prints to unique=cards
  // (dedupes reprints within a set) - the prefix change forces a fresh fetch instead of
  // serving stale, duplicate-laden cached data for sets browsed before the change.
  var KEY_CARDS_CACHE_PREFIX = NS + "cache:cards2:";
  // Bumped to "prints2" when the lookup switched from the card's own (sometimes-missing)
  // prints_search_uri field to a name-based query, so previously-cached single-print
  // "degraded" results don't linger for their TTL - they force a fresh, correct fetch.
  var KEY_PRINTS_CACHE_PREFIX = NS + "cache:prints2:";
  var KEY_LAST_BROWSE_SET = NS + "lastBrowseSet";
  var KEY_MERGE_BY_NAME = NS + "mergeByName";

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

  // ---- Owned cards (keyed by Scryfall print id) ----

  // Values are denormalized card snapshots (not just `true`) so the Collection
  // and Deck Builder views work even if a set's card cache has expired or been
  // cleared, and so an exported backup is self-contained.
  function getOwnedMap() {
    return readJSON(KEY_OWNED, {});
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
    writeJSON(KEY_OWNED, map);
  }

  function getOwnedIds() {
    return Object.keys(getOwnedMap());
  }

  function getOwnedCards() {
    var map = getOwnedMap();
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  // ---- Decks ----

  function getDecks() {
    return readJSON(KEY_DECKS, []);
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
    writeJSON(KEY_DECKS, decks);
    return deck;
  }

  function deleteDeck(deckId) {
    var decks = getDecks().filter(function (d) { return d.id !== deckId; });
    writeJSON(KEY_DECKS, decks);
  }

  function makeDeckId() {
    return "deck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Selected edition(s) in Browse (so it reopens with the same selection) ----
  // Stored as an array of set codes so multiple editions can be viewed at once;
  // transparently migrates the older single-string format from before that existed.

  function getSelectedBrowseSets() {
    var val = readJSON(KEY_LAST_BROWSE_SET, []);
    if (typeof val === "string") return val ? [val] : [];
    return Array.isArray(val) ? val : [];
  }

  function setSelectedBrowseSets(setCodes) {
    writeJSON(KEY_LAST_BROWSE_SET, setCodes || []);
  }

  // ---- "Merge duplicate printings by name" toggle (Collection + Deck Builder pool) ----

  function getMergeByName() {
    return readJSON(KEY_MERGE_BY_NAME, false);
  }

  function setMergeByName(value) {
    writeJSON(KEY_MERGE_BY_NAME, !!value);
  }

  // ---- Scryfall response caches (separate from user data, safe to clear) ----

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
      writeJSON(KEY_OWNED, parsed.ownedCards);
      writeJSON(KEY_DECKS, parsed.decks);
      return { owned: Object.keys(parsed.ownedCards).length, decks: parsed.decks.length };
    }

    // merge: union owned cards, append decks that don't already exist by id
    var owned = getOwnedMap();
    Object.keys(parsed.ownedCards).forEach(function (id) { owned[id] = true; });
    writeJSON(KEY_OWNED, owned);

    var decks = getDecks();
    var existingIds = {};
    decks.forEach(function (d) { existingIds[d.id] = true; });
    parsed.decks.forEach(function (d) {
      if (!existingIds[d.id]) decks.push(d);
    });
    writeJSON(KEY_DECKS, decks);

    return { owned: Object.keys(owned).length, decks: decks.length };
  }

  return {
    isOwned: isOwned,
    setOwned: setOwned,
    getOwnedIds: getOwnedIds,
    getOwnedMap: getOwnedMap,
    getOwnedCards: getOwnedCards,
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
    exportData: exportData,
    importData: importData,
  };
})();
