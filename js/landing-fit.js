// Keeps the landing page's title/subtitle/app-info text pinned to exactly one line each
// (per line of the title) at any viewport size or orientation, by measuring the actual
// rendered text width with a canvas and shrinking font-size until it fits - a fixed CSS
// breakpoint can't cover every phone width/orientation combination, but a measurement
// loop that runs on every resize always gets the right answer.
var LandingFit = (function () {
  "use strict";

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");

  function textWidth(text, font) {
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  // Available width is the page's own horizontal padding budget, not any one element's
  // box - the elements involved size themselves to their content (inline/flex-item),
  // so their own clientWidth isn't a meaningful ceiling to shrink against.
  function safeWidth() {
    var body = document.body;
    var cs = getComputedStyle(body);
    var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return body.clientWidth - pad - 8; // small safety margin
  }

  // Shrinks el's font-size (from maxPx down to minPx) until its text fits within
  // maxWidth, measured via canvas so no layout thrashing is needed per step.
  function fitOneLine(el, maxPx, minPx, maxWidth) {
    if (!el) return;
    var cs = getComputedStyle(el);
    var weight = cs.fontWeight || "400";
    var family = cs.fontFamily;
    var text = el.textContent;
    var size = maxPx;
    while (size > minPx && textWidth(text, weight + " " + size + "px " + family) > maxWidth) {
      size -= 1;
    }
    el.style.fontSize = size + "px";
  }

  function run() {
    var maxWidth = safeWidth();
    var title = document.querySelector(".landing-title");
    var subtitle = document.querySelector(".landing-subtitle");
    var appinfoLines = document.querySelectorAll(".landing-appinfo > div");

    if (title) {
      // Two independent lines (split by the <br>) sharing one font-size, sized to
      // whichever line needs to shrink more.
      var line1 = title.childNodes[0] ? title.childNodes[0].textContent : "";
      var line2 = title.childNodes[2] ? title.childNodes[2].textContent : "";
      var cs = getComputedStyle(title);
      var weight = cs.fontWeight || "700";
      var family = cs.fontFamily;
      var size = 64;
      var minSize = 16;
      while (size > minSize) {
        var font = weight + " " + size + "px " + family;
        if (textWidth(line1, font) <= maxWidth && textWidth(line2, font) <= maxWidth) break;
        size -= 1;
      }
      title.style.fontSize = size + "px";
    }

    fitOneLine(subtitle, 19, 10, maxWidth);
    appinfoLines.forEach(function (el) {
      fitOneLine(el, 12, 8, maxWidth);
    });
  }

  var resizeTimer;
  function scheduleRun() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(run, 100);
  }

  function init() {
    run();
    window.addEventListener("resize", scheduleRun);
    window.addEventListener("orientationchange", scheduleRun);
    // The title's custom webfont has different metrics than the Georgia/serif fallback
    // shown before it loads - re-measure once the real font is in so it isn't sized for
    // the wrong font.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run);
    }
  }

  return { init: init };
})();
