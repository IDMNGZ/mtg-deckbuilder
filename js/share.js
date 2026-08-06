// Wires a "Share" button (+ optional feedback element) to share the app - opens the OS
// native share sheet where supported, falling back to copying the link to the clipboard.
// Shared by the landing page, How To Use, and About, so there's one place to fix bugs or
// change the share copy instead of three.
var ShareApp = (function () {
  "use strict";

  // Always the canonical public URL, not location.href - a shared link should hand
  // someone the landing page experience, not wherever in the app the button was clicked
  // from (a specific tab, or a local test server).
  var SHARE_URL = "https://idmngz.github.io/mtg-deckbuilder/";
  var SHARE_TITLE = "MTG Deck Builder";
  // The link is embedded directly in the text (not left to the separate `url` field
  // alone) because not every navigator.share() destination combines text+url the same
  // way - iMessage does, but iOS's own "Copy" share-sheet action only grabs `text` and
  // silently drops `url` entirely, so copying and pasting elsewhere (Signal, etc.)
  // dropped the link. Keeping `url` too doesn't hurt destinations that use it for a
  // richer preview, but the text alone is now self-sufficient for anything that isn't.
  var SHARE_TEXT = "Track your Magic: The Gathering collection and build decks from what you own.";
  var SHARE_TEXT_WITH_URL = SHARE_TEXT + " " + SHARE_URL;

  function showFeedback(feedbackEl, text) {
    if (!feedbackEl) return;
    feedbackEl.textContent = text;
    setTimeout(function () { feedbackEl.textContent = ""; }, 2500);
  }

  // Last-resort fallback for browsers with neither the Web Share API nor the async
  // Clipboard API (older Safari/Firefox, or non-HTTPS contexts).
  function legacyCopy(text, feedbackEl) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      var ok = document.execCommand("copy");
      showFeedback(feedbackEl, ok ? "Link copied!" : "Couldn't copy - copy the address bar link instead.");
    } catch (err) {
      showFeedback(feedbackEl, "Couldn't copy - copy the address bar link instead.");
    }
    document.body.removeChild(ta);
  }

  function copyToClipboard(text, feedbackEl) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showFeedback(feedbackEl, "Link copied!");
      }).catch(function () {
        legacyCopy(text, feedbackEl);
      });
    } else {
      legacyCopy(text, feedbackEl);
    }
  }

  // buttonEl: required. feedbackEl: optional element to show a "Link copied!"-style
  // message in (skipped silently if omitted, e.g. for a button with no room nearby).
  // opts: optional { url, title, text } override - lets this same wiring share a
  // *different* app (e.g. an entry in the "My Other Apps" list) instead of this one,
  // without duplicating the share/copy-fallback logic for each app it needs to cover.
  function wire(buttonEl, feedbackEl, opts) {
    if (!buttonEl) return;
    opts = opts || {};
    var url = opts.url || SHARE_URL;
    var title = opts.title || SHARE_TITLE;
    var text = opts.text || SHARE_TEXT;
    var textWithUrl = text + " " + url;
    buttonEl.addEventListener("click", function () {
      var shareData = { title: title, text: textWithUrl, url: url };
      // navigator.share opens the OS's native share sheet (supported on most mobile
      // browsers, and some desktop ones) - falls back to copying the link otherwise.
      if (navigator.share) {
        navigator.share(shareData).catch(function () {}); // ignore cancel/unsupported-mid-call
        return;
      }
      copyToClipboard(url, feedbackEl);
    });
  }

  return { wire: wire };
})();
