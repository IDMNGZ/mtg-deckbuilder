// System tab: everything about where your data lives - automatic Dropbox sync, manual
// JSON export/import, and switching between profiles (separate item/record sets for
// different people sharing one device). This is MTG Deck Builder's ui-data.js with its
// Scryfall-specific "Refresh card data" / "Clear card data cache" panel removed (that panel
// only exists because that app caches an external API's responses - see storage.js's
// comment on clearAllCaches if your app ends up needing the same thing) and its
// owned/decks field names swapped for storage.js's generic items/records shape.
var SystemTabUI = (function () {
  "use strict";

  var els = {};

  function formatTime(isoString) {
    if (!isoString) return "never";
    return new Date(isoString).toLocaleString();
  }

  // ---- Live status bar (profile, sync state) ----

  function renderStatusBar() {
    var profile = Storage.getActiveProfile();
    var status = DropboxSync.getStatus();

    var syncLabel;
    if (!status.configured) syncLabel = "Local only";
    else if (!status.connected) syncLabel = "Not connected";
    else if (status.syncing) syncLabel = "Syncing…";
    else if (status.lastError) syncLabel = "Sync error";
    else syncLabel = formatTime(status.lastSyncedAt);

    // Only shown once actually connected - syncing isn't a meaningful action before then.
    var syncButtonHtml = status.connected
      ? "<button type='button' id='btn-status-sync-now' class='btn btn-primary data-status-sync-btn'" + (status.syncing ? " disabled" : "") + ">" + (status.syncing ? "Syncing…" : "Sync") + "</button>"
      : "";

    var shareHtml =
      "<button type='button' id='btn-status-share' class='btn data-status-share-btn' title='Share this app'>" +
      "<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" +
      "<circle cx='18' cy='5' r='3'></circle><circle cx='6' cy='12' r='3'></circle><circle cx='18' cy='19' r='3'></circle>" +
      "<line x1='8.59' y1='13.51' x2='15.42' y2='17.49'></line><line x1='15.41' y1='6.51' x2='8.59' y2='10.49'></line>" +
      "</svg>Share</button>" +
      "<span id='status-share-feedback' class='data-status-share-feedback' aria-live='polite'></span>";

    // Add your own glanceable item(s) here the same way (another .data-status-item) - item
    // count, last-updated, whatever's actually useful to see without opening a tab for it.
    els.statusBar.innerHTML =
      "<div class='data-status-item'><span class='data-status-label'>Profile</span><span class='data-status-value'>" + DomUtils.escapeHtml(profile.name) + "</span></div>" +
      "<div class='data-status-item'><span class='data-status-label'>Sync</span><span class='data-status-value" + (status.lastError ? " data-status-error" : "") + "'>" + DomUtils.escapeHtml(syncLabel) + "</span></div>" +
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
      html += "<div class='sync-status-row'>" + (status.accountEmail ? "Connected as <strong>" + DomUtils.escapeHtml(status.accountEmail) + "</strong>" : "Connected") + "</div>";
      html += "<div class='sync-status-row'>Last synced: " + formatTime(status.lastSyncedAt) + (status.syncing ? " (syncing…)" : "") + "</div>";
      html += "<div class='sync-status-row'>App version: " + DomUtils.escapeHtml(APP_VERSION) + "</div>";
      if (status.lastError) html += "<div class='sync-error'>" + DomUtils.escapeHtml(status.lastError) + "</div>";
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
  // them (Storage.activeKey) - a full reload is the simplest way to guarantee every module
  // (including DropboxSync's in-memory connection state) picks up the new profile cleanly.
  function switchProfile(id) {
    Storage.setActiveProfileId(id);
    location.reload();
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
      stats.items + ' item(s) and ' + stats.records + ' record(s).' + dropboxNote + ' This cannot be undone.';
    if (!window.confirm(msg)) return;
    var wasActive = profile.id === Storage.getActiveProfileId();
    Storage.deleteProfile(profile.id);
    if (wasActive) {
      location.reload();
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
        "<div class='data-profile-name'>" + DomUtils.escapeHtml(profile.name) + (isActive ? " <span class='data-profile-badge'>Active</span>" : "") + "</div>" +
        "<div class='data-profile-meta'>" + stats.items + " item" + (stats.items === 1 ? "" : "s") + " · " + stats.records + " record" + (stats.records === 1 ? "" : "s") + "</div>";
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

  function resetDevicePrompt() {
    var msg = "Reset this device? This permanently deletes every profile and all its data " +
      "stored HERE, and disconnects Dropbox on this device. Nothing in your Dropbox account " +
      "itself is touched - reconnecting afterward pulls it back down. This cannot be undone locally.";
    if (!window.confirm(msg)) return;
    Storage.resetThisDevice();
    location.reload();
  }

  function wireResetDevice() {
    els.resetDeviceBtn.addEventListener("click", resetDevicePrompt);
  }

  // ---- Manual backup ----

  function wireBackup() {
    els.exportBtn.addEventListener("click", function () {
      Storage.exportData();
    });

    els.importBtn.addEventListener("click", function () {
      els.fileImport.value = "";
      els.fileImport.click();
    });
    els.fileImport.addEventListener("change", function () {
      var file = els.fileImport.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var result = Storage.importData(reader.result, "merge");
          DropboxSync.push(); // no-op if not connected; otherwise carries the import to other devices
          window.alert("Imported: " + result.items + " item(s), " + result.records + " record(s).");
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
    els.profileList = document.getElementById("data-profile-list");
    els.newProfileName = document.getElementById("data-new-profile-name");
    els.createProfileBtn = document.getElementById("btn-create-profile");
    els.resetDeviceBtn = document.getElementById("btn-reset-device");
    els.exportBtn = document.getElementById("btn-export");
    els.importBtn = document.getElementById("btn-import");
    els.fileImport = document.getElementById("file-import");

    renderSync();
    renderProfiles();
    wireBackup();
    wireProfiles();
    wireResetDevice();

    document.addEventListener("app:sync-status-changed", function () {
      // The status bar is global (visible on every tab), so its sync label has to stay
      // live regardless of which tab is active - only the full Sync panel markup itself is
      // skipped while System isn't the visible tab.
      renderStatusBar();
      var tab = document.getElementById("tab-system");
      if (tab && tab.classList.contains("active")) renderSync();
    });
    // Item/record changes made from other tabs should keep the status bar live even if the
    // System tab isn't the one currently visible when they happen.
    document.addEventListener("app:data-changed", renderStatusBar);
  }

  return { init: init, activate: activate };
})();
