// Bootstraps the app: hash-based tab routing + wiring for the header actions.
(function () {
  "use strict";

  var TABS = ["browse", "collection", "decks", "deckbuilder", "wishlist", "rules", "howto", "links", "data", "about"];

  var activators = {
    browse: function () { BrowseUI.activate(); },
    collection: function () { CollectionUI.activate(); },
    deckbuilder: function () { DeckBuilderUI.activate(); },
    decks: function () { DecksUI.activate(); },
    wishlist: function () { WishlistUI.activate(); },
    data: function () { DataTabUI.activate(); },
  };

  // Which real content tab (i.e. not Data itself) was last visited - the Data tab's Refresh
  // button uses this to decide whether "refresh" means Browse's selected editions or
  // everyone else's saved owned-cards/decks, since by the time it's clicked the hash is
  // always "#data" and can't tell those apart on its own.
  var lastContentTab = "browse";

  function currentTab() {
    var hash = location.hash.replace("#", "");
    return TABS.indexOf(hash) !== -1 ? hash : "browse";
  }

  function showTab(tab) {
    if (tab !== "data") lastContentTab = tab;
    TABS.forEach(function (t) {
      document.getElementById("tab-" + t).classList.toggle("active", t === tab);
    });
    document.querySelectorAll(".tab-link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.tab === tab);
    });
    if (activators[tab]) activators[tab]();
    syncHeaderHeight(); // switching tabs can add/remove the scrollbar, which can rewrap the header
  }

  // Small surface DataTabUI needs without every module having to know about app.js's
  // internal tab-routing state directly.
  window.AppRouter = {
    lastContentTab: function () { return lastContentTab; },
    refreshCurrentTab: function () { showTab(currentTab()); },
  };

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

  // A stale cached copy of this app has already caused real confusion once (the CDN this
  // is hosted on has independent, delayed per-file cache propagation - see storage.js's
  // sync history) - polling for a version bump means a tab left open for a while surfaces
  // that instead of silently running old code. Only checks version.js itself (tiny, cheap)
  // rather than anything that'd actually force a reload - refreshing is always the user's
  // own choice via the banner's button.
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

  // A fixed pixel range can't mean the same thing on every screen: on a ~375px phone,
  // 150px and 200px minimums both round down to the same 1-2 grid columns - there's
  // nowhere for the rest of the slider's range to go, so most of it "does nothing." The
  // same range spans many more possible column counts on a desktop-width screen. Rather
  // than one global range (either too cramped on mobile or leaving desktop's low end
  // pressed right up against button-collision territory), each breakpoint gets its own -
  // same three breakpoints already used throughout the CSS, so this stays in step with
  // whatever those definitions are.
  function cardSizeRangeForViewport() {
    var isPortrait = window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
    var isLandscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
    if (isPortrait) return { min: 110, max: 190 };
    if (isLandscape) return { min: 100, max: 180 };
    return { min: 170, max: 280 };
  }

  // One shared preference, several sliders (Browse/Collection/Deck Builder pool) - all
  // three stay in sync so switching tabs never shows a stale handle position. The
  // preference itself is still just one raw pixel number - synced across every device on
  // the same Dropbox account, it can't simultaneously be "correct" on both a phone and a
  // desktop, so it's clamped into whatever range fits the CURRENT device/orientation
  // instead of applied verbatim - re-clamped on resize/rotation too, since that's a
  // breakpoint change same as loading fresh on a different device.
  function wireCardSizeSliders() {
    var sliders = document.querySelectorAll(".card-size-slider");

    function applyRange() {
      var range = cardSizeRangeForViewport();
      sliders.forEach(function (slider) { slider.min = range.min; slider.max = range.max; });
      var stored = Storage.getCardGridSize();
      if (stored != null) {
        var clamped = Math.min(Math.max(stored, range.min), range.max);
        sliders.forEach(function (s) { s.value = clamped; });
        applyCardGridSize(clamped);
      } else {
        var effective = Math.min(Math.max(currentEffectiveCardSize(), range.min), range.max);
        sliders.forEach(function (s) { s.value = effective; });
      }
    }

    applyRange();
    sliders.forEach(function (slider) {
      slider.addEventListener("input", function () {
        var px = parseInt(slider.value, 10);
        Storage.setCardGridSize(px);
        applyCardGridSize(px);
        sliders.forEach(function (s) { if (s !== slider) s.value = px; });
      });
    });
    window.addEventListener("resize", applyRange);
  }

  function init() {
    CardView.initModal();
    DeckView.init();
    BrowseUI.init();
    CollectionUI.init();
    DeckBuilderUI.init();
    WishlistUI.init();
    DecksUI.init();
    RulesUI.init();
    DataTabUI.init();
    wireGlobalMergeToggle();
    watchHeaderHeight();
    watchForNewVersion();
    applyMobileFilterDefaults();
    wireCardSizeSliders();
    // Share moved to the global status bar (see DataTabUI.renderStatusBar) now that it's
    // visible on every tab - one button instead of duplicating it per-tab.
    document.getElementById("about-version").textContent = APP_VERSION;
    OtherAppsUI.render();

    // A pull replacing local data (from another device's changes) needs whatever tab is
    // currently visible to re-render from the fresh data.
    document.addEventListener("mtg:remote-sync-applied", function () { showTab(currentTab()); });
    DropboxSync.handleRedirectIfPresent().then(function () { DropboxSync.init(); });

    window.addEventListener("hashchange", function () { showTab(currentTab()); });
    showTab(currentTab());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
