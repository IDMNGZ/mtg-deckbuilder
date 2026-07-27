// "Sync" panel: lets the user pick how (or whether) their data leaves this browser.
// Dropbox is opt-in automatic sync; the manual Export/Import buttons (already in the
// header) are the no-account alternative - e.g. dropped into an iCloud Drive folder.
// Which one to use, if either, is entirely the user's call - both keep working independently.
var UiSyncPanel = (function () {
  "use strict";

  var els = {};

  function formatTime(isoString) {
    if (!isoString) return "never";
    return new Date(isoString).toLocaleString();
  }

  function render() {
    var status = DropboxSync.getStatus();
    var html = "";

    html += "<div class='sync-section'>";
    html += "<h3>Automatic sync (Dropbox)</h3>";
    // Check `connected` first, independent of `configured` - if a user already connected,
    // they must always be able to see status/errors and disconnect, even if this
    // deployment's App Key was later removed or changed.
    if (status.connected) {
      html += "<div class='sync-status-row'><span>" + (status.accountEmail ? "Connected as <strong>" + CardView.escapeHtml(status.accountEmail) + "</strong>" : "Connected") + "</span></div>";
      html += "<div class='sync-status-row'><span>Last synced: " + formatTime(status.lastSyncedAt) + (status.syncing ? " (syncing…)" : "") + "</span></div>";
      if (status.lastError) html += "<div class='sync-error'>" + CardView.escapeHtml(status.lastError) + "</div>";
      html += "<div class='sync-actions'>";
      html += "<button type='button' id='btn-sync-now' class='btn btn-ghost'" + (status.syncing ? " disabled" : "") + ">Sync now</button>";
      html += "<button type='button' id='btn-sync-disconnect' class='btn btn-danger'>Disconnect</button>";
      html += "</div>";
    } else if (!status.configured) {
      html += "<p class='sync-note'>Dropbox sync isn't set up for this deployment yet - see README.md for the one-time setup. Everything still works fully local without it.</p>";
    } else {
      html += "<p class='sync-note'>Connect your own Dropbox account to automatically keep your collection and decks in sync across every device you use this app on. Your data goes into a private folder Dropbox creates just for this app - nobody else, including other people who use this app, can see it.</p>";
      html += "<button type='button' id='btn-sync-connect' class='btn btn-primary'>Connect Dropbox</button>";
    }
    html += "</div>";

    html += "<hr class='controls-divider'>";

    html += "<div class='sync-section'>";
    html += "<h3>Manual backup</h3>";
    html += "<p class='sync-note'>Prefer not to connect an account? Use the <strong>Export</strong> / <strong>Import</strong> buttons in the header instead. Export downloads a JSON file you can move to another device yourself - drop it in an iCloud Drive, Dropbox, or OneDrive folder and Import it there, or just keep it as a plain backup.</p>";
    html += "</div>";

    els.body.innerHTML = html;

    if (!status.connected && status.configured) {
      document.getElementById("btn-sync-connect").addEventListener("click", DropboxSync.connect);
    } else if (status.connected) {
      document.getElementById("btn-sync-now").addEventListener("click", function () { DropboxSync.push().then(DropboxSync.pull); });
      document.getElementById("btn-sync-disconnect").addEventListener("click", function () {
        if (window.confirm("Disconnect Dropbox? Your data stays exactly as-is locally and in your Dropbox - this just stops automatic syncing.")) {
          DropboxSync.disconnect();
        }
      });
    }
  }

  function open() { document.getElementById("sync-modal").classList.remove("hidden"); render(); }
  function close() { document.getElementById("sync-modal").classList.add("hidden"); }

  function init() {
    els.body = document.getElementById("sync-panel-body");
    document.getElementById("btn-sync").addEventListener("click", open);
    document.getElementById("sync-modal-close").addEventListener("click", close);
    document.querySelector("#sync-modal .modal-backdrop").addEventListener("click", close);
    document.addEventListener("mtg:sync-status-changed", function () {
      if (!document.getElementById("sync-modal").classList.contains("hidden")) render();
    });
  }

  return { init: init };
})();
