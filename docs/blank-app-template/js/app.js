// Minimal bootstrap for the blank template - hash-based tab routing, header-height sync
// for the sticky sub-header pattern, and wiring for the status bar's Sync/Share buttons.
// Add real init calls for your own per-tab modules the same way MTG Deck Builder's app.js
// calls BrowseUI.init(), CollectionUI.init(), etc.
(function () {
  "use strict";

  // Keep this in sync with the data-tab values in app.html.
  var TABS = ["tab-one", "tab-two", "reference", "howto", "system", "about"];

  function currentTab() {
    var hash = location.hash.replace("#", "");
    return TABS.indexOf(hash) !== -1 ? hash : TABS[0];
  }

  function showTab(tab) {
    TABS.forEach(function (t) {
      document.getElementById("tab-" + t).classList.toggle("active", t === tab);
    });
    document.querySelectorAll(".tab-link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.tab === tab);
    });
    syncHeaderHeight(); // switching tabs can add/remove a scrollbar, which can rewrap the header
  }

  // The header's real height is measured live, not assumed - anything sticking to "just
  // below the header" (.sticky-controls) reads this instead of a hardcoded pixel value,
  // so it never overlaps/gaps if the header's own height changes (responsive font size,
  // wrapping nav, etc). See docs/LAYOUT-SIZING-REFERENCE.md in this repo for more on this.
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
  }

  function init() {
    watchHeaderHeight();
    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());

    document.getElementById("about-version").textContent = APP_VERSION;
    if (window.OtherAppsUI) OtherAppsUI.render();

    ShareApp.wire(document.getElementById("btn-status-share"), document.getElementById("status-share-feedback"));
    // Replace with your own sync logic - this is just a stub so the button isn't dead.
    document.getElementById("btn-status-sync").addEventListener("click", function () {
      window.alert("Wire this up to your own sync logic.");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
