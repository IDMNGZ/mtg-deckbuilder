// Bootstraps the app: hash-based tab routing + wiring for the header actions.
(function () {
  "use strict";

  var TABS = ["browse", "collection", "deckbuilder", "decks", "rules", "howto", "about"];

  var activators = {
    browse: function () { BrowseUI.activate(); },
    collection: function () { CollectionUI.activate(); },
    deckbuilder: function () { DeckBuilderUI.activate(); },
    decks: function () { DecksUI.activate(); },
  };

  function currentTab() {
    var hash = location.hash.replace("#", "");
    return TABS.indexOf(hash) !== -1 ? hash : "browse";
  }

  function showTab(tab) {
    TABS.forEach(function (t) {
      document.getElementById("tab-" + t).classList.toggle("active", t === tab);
    });
    document.querySelectorAll(".tab-link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.tab === tab);
    });
    if (activators[tab]) activators[tab]();
    syncHeaderHeight(); // switching tabs can add/remove the scrollbar, which can rewrap the header
  }

  function wireHeaderActions() {
    document.getElementById("btn-export").addEventListener("click", function () {
      Storage.exportData();
    });

    var fileInput = document.getElementById("file-import");
    document.getElementById("btn-import").addEventListener("click", function () {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var result = Storage.importData(reader.result, "merge");
          DropboxSync.push(); // no-op if not connected; otherwise carries the import to other devices
          window.alert("Imported: " + result.owned + " owned cards, " + result.decks + " decks.");
          showTab(currentTab());
        } catch (err) {
          window.alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // The header can wrap to extra lines on narrow viewports (or when a scrollbar appears/
  // disappears and shaves a few px off the available width), changing its height. Keep
  // --header-h in sync so the sticky filter bars stick right below it, not under it.
  // Combines a ResizeObserver (catches most cases) with resize/load listeners and a
  // recheck on every tab switch, since no single signal reliably covers every trigger.
  function syncHeaderHeight() {
    var header = document.querySelector(".app-header");
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }

  function watchHeaderHeight() {
    syncHeaderHeight();
    if (window.ResizeObserver) {
      new ResizeObserver(syncHeaderHeight).observe(document.querySelector(".app-header"));
    }
    window.addEventListener("resize", syncHeaderHeight);
    window.addEventListener("load", syncHeaderHeight);
  }

  function init() {
    CardView.initModal();
    BrowseUI.init();
    CollectionUI.init();
    DeckBuilderUI.init();
    DecksUI.init();
    RulesUI.init();
    UiSyncPanel.init();
    wireHeaderActions();
    watchHeaderHeight();

    // A pull replacing local data (from another device's changes) needs whatever tab is
    // currently visible to re-render from the fresh data.
    document.addEventListener("mtg:remote-sync-applied", function () { showTab(currentTab()); });
    DropboxSync.handleRedirectIfPresent().then(function () { DropboxSync.init(); });

    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
