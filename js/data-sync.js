// Re-fetches the latest Scryfall data for every card the user has saved (owned + in
// decks) and updates the stored snapshots in place. Shared by the Collection and Deck
// Builder "Refresh" buttons, since both draw from the same saved data.
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

  // Wires a Refresh button's full click->loading->result cycle so Collection and the Deck
  // Builder don't each reimplement it. onDone(result) runs after the data is updated, for
  // whatever view-specific re-render/patching the caller needs.
  function wireRefreshButton(btn, onDone) {
    var originalLabel = btn.textContent;
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Refreshing…";
      refreshAllSavedCardData().then(function (result) {
        btn.textContent = result.total === 0 ? "Nothing to refresh" : "Refreshed " + result.updated + "/" + result.total;
        if (onDone) onDone(result);
        setTimeout(function () { btn.textContent = originalLabel; btn.disabled = false; }, 2000);
      }).catch(function (err) {
        btn.textContent = "Refresh failed";
        console.error("Refresh failed:", err);
        setTimeout(function () { btn.textContent = originalLabel; btn.disabled = false; }, 2000);
      });
    });
  }

  return {
    refreshAllSavedCardData: refreshAllSavedCardData,
    wireRefreshButton: wireRefreshButton,
  };
})();
