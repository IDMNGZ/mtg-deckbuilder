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

  // Merge Dupes and Card size used to be duplicated in every tab's own filter row (they're
  // shared preferences, not tab-specific) - now there's exactly one of each, living in the
  // header. Tabs learn about a merge-state change via "mtg:merge-changed" instead of a
  // local button, so this stays decoupled from whichever tabs happen to exist.
  function wireGlobalMergeToggle() {
    var btn = document.getElementById("btn-merge-toggle-global");
    function sync() { btn.classList.toggle("active", Storage.getMergeByName()); }
    sync();
    btn.addEventListener("click", function () {
      Storage.setMergeByName(!Storage.getMergeByName());
      sync();
      document.dispatchEvent(new CustomEvent("mtg:merge-changed"));
    });
  }

  // "Refresh" means something different depending on which tab is active - Browse
  // refetches the selected edition(s), Collection/Deck Builder refetch owned+deck card
  // data (identical for both, so one shared call covers them). Dispatching on the active
  // tab here is what lets a single header button replace three separate ones.
  function wireGlobalRefresh() {
    var btn = document.getElementById("btn-refresh-global");
    var originalLabel = btn.textContent;
    function busy(label) { btn.disabled = true; btn.textContent = label; }
    function done(label) {
      btn.textContent = label;
      setTimeout(function () { btn.textContent = originalLabel; btn.disabled = false; }, 2000);
    }
    btn.addEventListener("click", function () {
      if (currentTab() === "browse") {
        busy("Refreshing…");
        BrowseUI.refresh().then(function () { done("Refreshed"); })
          .catch(function (err) { console.error("Refresh failed:", err); done("Refresh failed"); });
        return;
      }
      busy("Refreshing…");
      DataSync.refreshAllSavedCardData().then(function (result) {
        CollectionUI.refresh();
        DeckBuilderUI.refresh(result);
        done(result.total === 0 ? "Nothing to refresh" : "Refreshed " + result.updated + "/" + result.total);
      }).catch(function (err) { console.error("Refresh failed:", err); done("Refresh failed"); });
    });
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

  // The type/color/rarity filter rows ship <details open> in the HTML so they're visible
  // by default on desktop. On phones that alone can be a big chunk of the screen, so start
  // them collapsed there - this only sets the initial state, it won't fight a user's toggle.
  function applyMobileFilterDefaults() {
    var isCompact = window.matchMedia(
      "(max-width: 600px) and (orientation: portrait), (orientation: landscape) and (max-height: 500px)"
    ).matches;
    if (isCompact) {
      document.querySelectorAll(".filter-details").forEach(function (d) { d.open = false; });
    }
  }

  // Applies (or clears) the user's chosen card-grid tile size as an inline style on the
  // root element, which - being inline - overrides whatever the current media query set
  // as the breakpoint default. The compact grid (deck builder pool) gets a smaller value
  // in step so it doesn't end up wider than the full grid at the same "zoom level".
  function applyCardGridSize(px) {
    if (px == null) {
      document.documentElement.style.removeProperty("--card-min-w");
      document.documentElement.style.removeProperty("--card-min-w-compact");
    } else {
      document.documentElement.style.setProperty("--card-min-w", px + "px");
      document.documentElement.style.setProperty("--card-min-w-compact", Math.max(80, px - 40) + "px");
    }
  }

  function currentEffectiveCardSize() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--card-min-w");
    var n = parseInt(raw, 10);
    return isNaN(n) ? 200 : n;
  }

  // One shared preference, several sliders (Browse/Collection/Deck Builder pool) - all
  // three stay in sync so switching tabs never shows a stale handle position.
  function wireCardSizeSliders() {
    var sliders = document.querySelectorAll(".card-size-slider");
    var stored = Storage.getCardGridSize();
    var initial = stored != null ? stored : currentEffectiveCardSize();
    if (stored != null) applyCardGridSize(stored);
    sliders.forEach(function (slider) {
      slider.value = initial;
      slider.addEventListener("input", function () {
        var px = parseInt(slider.value, 10);
        Storage.setCardGridSize(px);
        applyCardGridSize(px);
        sliders.forEach(function (s) { if (s !== slider) s.value = px; });
      });
    });
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
    wireGlobalMergeToggle();
    wireGlobalRefresh();
    watchHeaderHeight();
    applyMobileFilterDefaults();
    wireCardSizeSliders();
    ShareApp.wire(document.getElementById("btn-share-howto"), document.getElementById("share-feedback-howto"));
    ShareApp.wire(document.getElementById("btn-share-about"), document.getElementById("share-feedback-about"));

    // A pull replacing local data (from another device's changes) needs whatever tab is
    // currently visible to re-render from the fresh data.
    document.addEventListener("mtg:remote-sync-applied", function () { showTab(currentTab()); });
    DropboxSync.handleRedirectIfPresent().then(function () { DropboxSync.init(); });

    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
