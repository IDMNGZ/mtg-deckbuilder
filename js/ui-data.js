// "Data" tab: everything about where your collection/decks live - automatic Dropbox sync,
// manual JSON export/import, refreshing saved card data from Scryfall, and switching between
// profiles (separate collections/decks for different people sharing one device). Used to be
// split across header buttons + a separate Sync modal; consolidated here since automatic
// sync made the header buttons themselves mostly one-and-done setup rather than everyday
// actions.
var DataTabUI = (function () {
  "use strict";

  var els = {};

  function formatTime(isoString) {
    if (!isoString) return "never";
    return new Date(isoString).toLocaleString();
  }

  // ---- Live status bar (profile, sync state, collection size) ----

  function renderStatusBar() {
    var profile = Storage.getActiveProfile();
    var status = DropboxSync.getStatus();
    var ownedCount = Storage.getOwnedCards().length;
    var deckCount = Storage.getDecks().length;

    // Label already says "Sync" - the value doesn't need to repeat that word too.
    var syncLabel;
    if (!status.configured) syncLabel = "Local only";
    else if (!status.connected) syncLabel = "Not connected";
    else if (status.syncing) syncLabel = "Syncing…";
    else if (status.lastError) syncLabel = "Sync error";
    else syncLabel = formatTime(status.lastSyncedAt);

    // Only shown once actually connected - syncing isn't a meaningful action before then
    // (there's nothing to sync to), and the full Automatic Sync panel below already covers
    // getting connected in the first place.
    var syncButtonHtml = status.connected
      ? "<button type='button' id='btn-status-sync-now' class='btn btn-primary data-status-sync-btn'" + (status.syncing ? " disabled" : "") + ">" + (status.syncing ? "Syncing…" : "Sync") + "</button>"
      : "";

    // Share used to be its own button repeated on four different tabs - now that this bar
    // is visible everywhere, one copy here covers all of them.
    var shareHtml =
      "<button type='button' id='btn-status-share' class='btn data-status-share-btn' title='Share this app'>" +
      "<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" +
      "<circle cx='18' cy='5' r='3'></circle><circle cx='6' cy='12' r='3'></circle><circle cx='18' cy='19' r='3'></circle>" +
      "<line x1='8.59' y1='13.51' x2='15.42' y2='17.49'></line><line x1='15.41' y1='6.51' x2='8.59' y2='10.49'></line>" +
      "</svg>Share</button>" +
      "<span id='status-share-feedback' class='data-status-share-feedback' aria-live='polite'></span>";

    els.statusBar.innerHTML =
      "<div class='data-status-item'><span class='data-status-label'>Profile</span><span class='data-status-value'>" + CardView.escapeHtml(profile.name) + "</span></div>" +
      "<div class='data-status-item'><span class='data-status-label'>Collection</span><span class='data-status-value'>" + ownedCount + " cards, " + deckCount + " decks</span></div>" +
      "<div class='data-status-item'><span class='data-status-label'>Sync</span><span class='data-status-value" + (status.lastError ? " data-status-error" : "") + "'>" + CardView.escapeHtml(syncLabel) + "</span></div>" +
      // One shared wrapper with the ONLY margin-left: auto, not one on each button -
      // multiple auto-margins in the same flex row each independently claim a share of the
      // free space (that's what was pushing "Sync" out to float in the middle with a gap on
      // both sides instead of sitting flush against "Share" at the right edge).
      "<div class='data-status-actions'>" + syncButtonHtml + shareHtml + "</div>";

    if (status.connected) {
      document.getElementById("btn-status-sync-now").addEventListener("click", DropboxSync.push);
    }
    ShareApp.wire(document.getElementById("btn-status-share"), document.getElementById("status-share-feedback"));
  }

  // ---- Sync section ----

  function renderSync() {
    var status = DropboxSync.getStatus();
    var html = "";

    html += "<div class='rules-section-header'><h2>Automatic Sync (Dropbox)</h2><p>One connection for this whole device - every profile here (see \"Switch Profiles\") backs up together under it.</p></div>";

    if (status.connected) {
      html += "<div class='sync-status-row'>" + (status.accountEmail ? "Connected as <strong>" + CardView.escapeHtml(status.accountEmail) + "</strong>" : "Connected") + "</div>";
      html += "<div class='sync-status-row'>Last synced: " + formatTime(status.lastSyncedAt) + (status.syncing ? " (syncing…)" : "") + "</div>";
      html += "<div class='sync-status-row'>App version: " + CardView.escapeHtml(APP_VERSION) + "</div>";
      if (status.lastError) html += "<div class='sync-error'>" + CardView.escapeHtml(status.lastError) + "</div>";
      html += "<div class='sync-actions-primary'><button type='button' id='btn-sync-now' class='btn btn-primary'" + (status.syncing ? " disabled" : "") + ">" + (status.syncing ? "Syncing…" : "Sync now") + "</button></div>";
      html += "<div class='sync-actions-secondary'><button type='button' id='btn-sync-disconnect' class='btn-text-danger'>Disconnect Dropbox</button></div>";
    } else if (!status.configured) {
      html += "<p class='sync-note'>Dropbox sync isn't set up for this deployment yet - see README.md for the one-time setup. Everything still works fully local without it.</p>";
    } else {
      html += "<p class='sync-note'>Connect a Dropbox account to automatically keep every profile on this device in sync with your other devices. Your data goes into a private folder Dropbox creates just for this app - nobody else, including other people who use this app, can see it.</p>";
      html += "<ol class='sync-setup-steps'>";
      html += "<li>Click \"Connect Dropbox\" below and log into the Dropbox account you want this device to sync through.</li>";
      html += "<li>Connect that same account on another device (like your phone) to pull everything down there too.</li>";
      html += "<li>After that, changes push a few seconds after you make them, and pull whenever you switch back to this tab - nothing else to do.</li>";
      html += "</ol>";
      html += "<button type='button' id='btn-sync-connect' class='btn btn-primary'>Connect Dropbox</button>";
    }

    els.syncSection.innerHTML = html;

    if (!status.connected && status.configured) {
      document.getElementById("btn-sync-connect").addEventListener("click", DropboxSync.connect);
    } else if (status.connected) {
      document.getElementById("btn-sync-now").addEventListener("click", DropboxSync.push);
      document.getElementById("btn-sync-disconnect").addEventListener("click", function () {
        if (window.confirm("Disconnect Dropbox? Your data stays exactly as-is locally and in your Dropbox - this just stops automatic syncing.")) {
          DropboxSync.disconnect();
        }
      });
    }

    renderStatusBar();
  }

  // ---- Profiles ----

  // A profile switch changes which localStorage keys every module reads from underneath
  // them (Storage.activeKey), which none of Browse/Collection/Deck Builder/etc. are set up
  // to notice mid-session - a full reload is the simplest way to guarantee every module
  // (including DropboxSync's in-memory connection state) picks up the new profile cleanly,
  // rather than trying to hand-reset each one.
  function switchProfile(id) {
    Storage.setActiveProfileId(id);
    AppReload();
  }

  function renameProfilePrompt(profile) {
    var name = window.prompt("Rename profile:", profile.name);
    if (!name) return;
    name = name.trim();
    if (!name || name === profile.name) return;
    Storage.renameProfile(profile.id, name);
    renderProfiles();
    renderStatusBar();
  }

  function deleteProfilePrompt(profile) {
    var stats = Storage.getProfileStats(profile.id);
    var dropboxNote = DropboxSync.getStatus().connected
      ? " This device syncs to Dropbox, so it's removed from there too on the next sync, not just locally."
      : "";
    var msg = 'Delete profile "' + profile.name + '"? This permanently removes its ' +
      stats.owned + ' owned card(s) and ' + stats.decks + ' deck(s).' + dropboxNote + ' This cannot be undone.';
    if (!window.confirm(msg)) return;
    var wasActive = profile.id === Storage.getActiveProfileId();
    Storage.deleteProfile(profile.id);
    if (wasActive) {
      AppReload();
    } else {
      renderProfiles();
    }
  }

  function createProfilePrompt() {
    var name = els.newProfileName.value.trim();
    if (!name) {
      window.alert("Give the new profile a name first.");
      return;
    }
    Storage.createProfile(name);
    els.newProfileName.value = "";
    renderProfiles();
  }

  function renderProfiles() {
    var profiles = Storage.getProfiles();
    var activeId = Storage.getActiveProfileId();
    els.profileList.innerHTML = "";

    profiles.forEach(function (profile) {
      var isActive = profile.id === activeId;
      var stats = Storage.getProfileStats(profile.id);

      var li = document.createElement("li");
      li.className = "data-profile-item" + (isActive ? " active" : "");

      var info = document.createElement("div");
      info.className = "data-profile-info";
      info.innerHTML =
        "<div class='data-profile-name'>" + CardView.escapeHtml(profile.name) + (isActive ? " <span class='data-profile-badge'>Active</span>" : "") + "</div>" +
        "<div class='data-profile-meta'>" + stats.owned + " cards owned · " + stats.decks + " deck" + (stats.decks === 1 ? "" : "s") + "</div>" +
        // Temporary diagnostic: two profiles with the same NAME on different devices are
        // only the same profile for sync purposes if this ID also matches - a same-named
        // profile with a different id (e.g. rebuilt via Import after a Reset, then renamed
        // to match) would never converge no matter how many times you sync, since merging
        // only updates a profile bucket when the id matches.
        "<div class='data-profile-id'>id: " + CardView.escapeHtml(profile.id) + "</div>";
      li.appendChild(info);

      var actions = document.createElement("div");
      actions.className = "data-profile-actions";

      if (!isActive) {
        var switchBtn = document.createElement("button");
        switchBtn.className = "btn btn-accent";
        switchBtn.textContent = "Switch";
        switchBtn.addEventListener("click", function () { switchProfile(profile.id); });
        actions.appendChild(switchBtn);
      }

      var renameBtn = document.createElement("button");
      renameBtn.className = "btn btn-accent";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", function () { renameProfilePrompt(profile); });
      actions.appendChild(renameBtn);

      if (profiles.length > 1) {
        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", function () { deleteProfilePrompt(profile); });
        actions.appendChild(deleteBtn);
      }

      li.appendChild(actions);
      els.profileList.appendChild(li);
    });
  }

  function wireProfiles() {
    els.createProfileBtn.addEventListener("click", createProfilePrompt);
    els.newProfileName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") createProfilePrompt();
    });
    renderProfiles();
  }

  // ---- Reset this device ----
  // A clean-slate escape hatch for when this device's local data is corrupted or mixed up
  // (e.g. two devices that each locally migrated their own pre-profile data independently
  // could, before this was fixed, end up with colliding profile ids that Dropbox's sync
  // then blended together) - wipes every key this app has ever written on THIS device only
  // and starts fresh. Deliberately doesn't touch Dropbox itself: if this device was
  // connected, reconnecting afterward pulls the good copy back down with nothing local
  // left to conflict with it.
  function resetDevicePrompt() {
    var msg = "Reset this device? This permanently deletes every profile, all owned cards, " +
      "and all decks stored HERE, and disconnects Dropbox on this device. Nothing in your " +
      "Dropbox account itself is touched - reconnecting afterward pulls it back down. " +
      "This cannot be undone locally.";
    if (!window.confirm(msg)) return;
    Storage.resetThisDevice();
    AppReload();
  }

  function wireResetDevice() {
    els.resetDeviceBtn.addEventListener("click", resetDevicePrompt);
  }

  // ---- Clear card data cache (storage-quota relief, keeps owned cards/decks untouched) ----

  function wireClearCache() {
    var btn = els.clearCacheBtn;
    var originalLabel = btn.textContent;
    btn.addEventListener("click", function () {
      var count = Storage.clearCardDataCache();
      btn.textContent = count > 0 ? "Cleared " + count + " cached edition(s)" : "Nothing to clear";
      setTimeout(function () { btn.textContent = originalLabel; }, 2500);
    });
  }

  // ---- Refresh ----

  // "Refresh" means something different depending on which tab you were last actually
  // looking at - Browse refetches the selected edition(s), everything else refetches
  // owned+deck card data. Living in its own Data tab now (not a per-tab header button)
  // means the button itself is only ever clicked from here, so app.js tracks whichever
  // real content tab you were on last and hands it to this instead.
  function wireRefresh() {
    var btn = els.refreshBtn;
    var originalLabel = btn.textContent;
    function busy(label) { btn.disabled = true; btn.textContent = label; }
    function done(label) {
      btn.textContent = label;
      setTimeout(function () { btn.textContent = originalLabel; btn.disabled = false; }, 2000);
    }
    btn.addEventListener("click", function () {
      if (window.AppRouter && window.AppRouter.lastContentTab() === "browse") {
        busy("Refreshing…");
        BrowseUI.refresh().then(function () { done("Refreshed"); })
          .catch(function (err) { console.error("Refresh failed:", err); done("Refresh failed"); });
        return;
      }
      busy("Refreshing…");
      DataSync.refreshAllSavedCardData().then(function (result) {
        CollectionUI.refresh();
        DeckBuilderUI.refresh(result);
        renderStatusBar();
        done(result.total === 0 ? "Nothing to refresh" : "Refreshed " + result.updated + "/" + result.total);
      }).catch(function (err) { console.error("Refresh failed:", err); done("Refresh failed"); });
    });
  }

  // ---- Manual backup ----

  function wireBackup() {
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
          if (window.AppRouter) window.AppRouter.refreshCurrentTab();
          renderStatusBar();
        } catch (err) {
          window.alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function activate() {
    renderSync();
    renderProfiles();
  }

  function init() {
    els.statusBar = document.getElementById("data-status-dynamic");
    els.syncSection = document.getElementById("data-sync-section");
    els.refreshBtn = document.getElementById("btn-refresh-global");
    els.clearCacheBtn = document.getElementById("btn-clear-cache");
    els.profileList = document.getElementById("data-profile-list");
    els.newProfileName = document.getElementById("data-new-profile-name");
    els.createProfileBtn = document.getElementById("btn-create-profile");
    els.resetDeviceBtn = document.getElementById("btn-reset-device");

    renderSync();
    renderProfiles();
    wireRefresh();
    wireClearCache();
    wireBackup();
    wireProfiles();
    wireResetDevice();

    document.addEventListener("mtg:sync-status-changed", function () {
      // The status bar is global now (visible on every tab), so its sync label has to
      // stay live regardless of which tab is active - only the full Sync panel markup
      // itself is skipped while Data isn't the visible tab.
      renderStatusBar();
      var tab = document.getElementById("tab-data");
      if (tab && tab.classList.contains("active")) renderSync();
    });
    // Ownership/deck changes made from other tabs should keep the status bar's counts
    // live even if the Data tab isn't the one currently visible when they happen.
    document.addEventListener("mtg:data-changed", renderStatusBar);
  }

  return { init: init, activate: activate };
})();
