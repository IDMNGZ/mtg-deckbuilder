// Re-fetches the latest Scryfall data for every card the user has saved (owned + in
// decks) and updates the stored snapshots in place. Used by the header's global Refresh
// button whenever a tab other than Browse is active (see app.js's wireGlobalRefresh).
var DataSync = (function () {
  "use strict";

  function collectAllSavedIds() {
    var ids = {};
    Storage.getOwnedIds().forEach(function (id) { ids[id] = true; });
    Storage.getDecks().forEach(function (deck) {
      deck.cards.forEach(function (entry) { ids[entry.card.id] = true; });
    });
    return Object.keys(ids);
  }

  // Resolves { total, updated, freshMap } - freshMap lets a caller also patch any of its
  // own in-memory card references (e.g. the deck currently open in the builder).
  function refreshAllSavedCardData() {
    var ids = collectAllSavedIds();
    if (ids.length === 0) return Promise.resolve({ total: 0, updated: 0, freshMap: {} });
    return Scryfall.fetchCardsByIds(ids).then(function (freshMap) {
      var updated = Storage.refreshCardData(freshMap);
      return { total: ids.length, updated: updated, freshMap: freshMap };
    });
  }

  return {
    refreshAllSavedCardData: refreshAllSavedCardData,
  };
})();
