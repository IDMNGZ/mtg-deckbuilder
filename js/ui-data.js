// "Data" tab: everything about where your collection/decks live - automatic Dropbox sync,
// manual JSON export/import, and refreshing saved card data from Scryfall. Used to be split
// across header buttons + a separate Sync modal; consolidated here since automatic sync
// made the header buttons themselves mostly one-and-done setup rather than everyday actions.
var DataTabUI = (function () {
  "use strict";

  var els = {};

  function formatTime(isoString) {
    if (!isoString) return "never";
    return new Date(isoString).toLocaleString();
  }

  function renderSync() {
    var status = DropboxSync.getStatus();
    var html = "";

    html += "<div class='rules-section-header'><h2>Automatic Sync (Dropbox)</h2><p>Keep your collection and decks the same across every device you use this app on.</p></div>";

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
      html += "<p class='sync-note'>Connect your own Dropbox account to automatically keep your collection and decks in sync across every device you use this app on. Your data goes into a private folder Dropbox creates just for this app - nobody else, including other people who use this app, can see it.</p>";
      html += "<ol class='sync-setup-steps'>";
      html += "<li>Click \"Connect Dropbox\" below and log into your own Dropbox account.</li>";
      html += "<li>Connect that same account on another device (like your phone) to pull your data down there too.</li>";
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
  }

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
        done(result.total === 0 ? "Nothing to refresh" : "Refreshed " + result.updated + "/" + result.total);
      }).catch(function (err) { console.error("Refresh failed:", err); done("Refresh failed"); });
    });
  }

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
        } catch (err) {
          window.alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function init() {
    els.syncSection = document.getElementById("data-sync-section");
    els.refreshBtn = document.getElementById("btn-refresh-global");

    renderSync();
    wireRefresh();
    wireBackup();

    document.addEventListener("mtg:sync-status-changed", function () {
      var tab = document.getElementById("tab-data");
      if (tab && tab.classList.contains("active")) renderSync();
    });
  }

  return { init: init, activate: renderSync };
})();
