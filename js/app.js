// Bootstraps the app: hash-based tab routing + wiring for the header actions.
(function () {
  "use strict";

  var TABS = ["browse", "collection", "deckbuilder", "decks"];

  var activators = {
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
          window.alert("Imported: " + result.owned + " owned cards, " + result.decks + " decks.");
          showTab(currentTab());
        } catch (err) {
          window.alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function init() {
    CardView.initModal();
    BrowseUI.init();
    CollectionUI.init();
    DeckBuilderUI.init();
    DecksUI.init();
    wireHeaderActions();

    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
