// "Collection" tab: every card the user has checked as owned, across all editions.
var CollectionUI = (function () {
  "use strict";

  var els = {};

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 ||
      card.typeLine.toLowerCase().indexOf(needle) !== -1 ||
      (card.setName || "").toLowerCase().indexOf(needle) !== -1;
  }

  function render() {
    var owned = Storage.getOwnedCards();
    var needle = els.filter.value.trim();
    var visible = owned.filter(function (c) { return matchesFilter(c, needle); });

    els.status.textContent = owned.length + " card" + (owned.length === 1 ? "" : "s") + " owned";
    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    visible.forEach(function (card) {
      frag.appendChild(CardView.renderTile(card, {
        onOwnToggle: function (card, owned) {
          Storage.setOwned(card, owned);
          render(); // unchecking here should remove the tile immediately
        },
      }));
    });
    els.grid.appendChild(frag);

    if (owned.length === 0) {
      els.grid.innerHTML = '<p class="empty-hint">No cards yet — check some off in the Browse tab.</p>';
    }
  }

  function init() {
    els.filter = document.getElementById("collection-filter");
    els.grid = document.getElementById("collection-grid");
    els.status = document.getElementById("collection-status");
    els.filter.addEventListener("input", render);
  }

  return { init: init, activate: render };
})();
