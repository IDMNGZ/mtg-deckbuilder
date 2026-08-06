// Bootstraps the app: hash-based tab routing, header-height sync for the sticky sub-header
// pattern, the update-available banner, and wiring for System tab / Dropbox's OAuth
// redirect. Add real init/activate calls for your own per-tab modules the same way MTG
// Deck Builder's app.js calls BrowseUI.init(), CollectionUI.init(), etc. - follow the
// System tab's own init()/activate() split in js/system-tab.js as the pattern: init() runs
// once at load, activate() re-runs every time that tab becomes visible.
(function () {
  "use strict";

  // Keep this in sync with the data-tab values in app.html.
  var TABS = ["tab-one", "tab-two", "reference", "howto", "system", "about"];

  // Add an entry here for any tab whose content needs to (re)render every time it becomes
  // visible, not just once at page load - same pattern as MTG Deck Builder's app.js.
  var activators = {
    system: function () { SystemTabUI.activate(); },
  };

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
    if (activators[tab]) activators[tab]();
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
    window.addEventListener("load", syncHeaderHeight);
  }

  // A stale cached copy of a deployed app is a real, repeatedly-hit problem on static
  // hosting with a CDN in front of it (see docs/SYNC-ARCHITECTURE-HANDOFF.md section 5) -
  // polling for a version bump means a tab left open across a deploy surfaces that instead
  // of silently running old code. Only checks version.js itself (tiny, cheap) rather than
  // anything that'd actually force a reload - refreshing is always the user's own choice.
  var UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
  function watchForNewVersion() {
    var banner = document.getElementById("update-banner");
    var dismissed = false;

    function checkNow() {
      if (dismissed) return;
      fetch("js/version.js?_=" + Date.now(), { cache: "no-store" }).then(function (res) {
        return res.text();
      }).then(function (text) {
        var match = text.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (match && match[1] !== APP_VERSION) banner.classList.remove("hidden");
      }).catch(function () { /* offline or blocked - not worth surfacing as an error */ });
    }

    document.getElementById("btn-update-refresh").addEventListener("click", function () { location.reload(); });
    document.getElementById("btn-update-dismiss").addEventListener("click", function () {
      dismissed = true;
      banner.classList.add("hidden");
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkNow();
    });
    setInterval(checkNow, UPDATE_CHECK_INTERVAL_MS);
  }

  function init() {
    watchHeaderHeight();
    watchForNewVersion();
    SystemTabUI.init();
    // Add your own per-tab module init() calls here.

    document.getElementById("about-version").textContent = APP_VERSION;
    if (window.OtherAppsUI) OtherAppsUI.render();

    // A pull replacing local data (from another device's changes) needs whatever tab is
    // currently visible to re-render from the fresh data - add your own tabs' activators
    // here too once they read real data, the same way showTab(currentTab()) does below.
    document.addEventListener("app:remote-sync-applied", function () { showTab(currentTab()); });
    DropboxSync.handleRedirectIfPresent().then(function () { DropboxSync.init(); });

    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
