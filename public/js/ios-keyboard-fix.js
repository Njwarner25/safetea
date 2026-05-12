// iOS keyboard handler for SafeTea / LinkHer web pages loaded inside the
// Capacitor WebView (and ordinary mobile Safari). The iOS WebView does NOT
// reflow the viewport when the soft keyboard opens, so any fixed/sticky
// bottom element (a compose bar, a primary CTA) gets covered.
//
// What this does:
//   1. Detects iOS (no-op on Android / desktop).
//   2. Listens to window.visualViewport — fires whenever the keyboard
//      opens or closes.
//   3. Sets a `--ios-kb-offset` CSS variable on <html> with the keyboard's
//      height in pixels.
//   4. Toggles a `.ios-kb-open` class on <body>.
//   5. Auto-scrolls the focused input into the visible portion of the
//      viewport (catches cases where a fixed bar isn't involved).
//
// How to consume in a page's CSS:
//
//   body.ios-kb-open { padding-bottom: var(--ios-kb-offset, 0px); }
//   .compose, .bottom-bar, [data-kb-shift] {
//     transform: translateY(calc(-1 * var(--ios-kb-offset, 0px)));
//     transition: transform 0.15s ease-out;
//   }
//
// Drop a <script src="/js/ios-keyboard-fix.js" defer></script> into any
// page that has text inputs — this file is intentionally a no-op on
// non-iOS so it's safe to include everywhere.
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (ua.includes('Mac') && 'ontouchend' in document);
  if (!isIOS) return;
  if (!window.visualViewport) return;

  var root = document.documentElement;
  var vv = window.visualViewport;

  function update() {
    // window.innerHeight is the full screen; vv.height shrinks when the
    // keyboard appears. The offset between them is the keyboard's height.
    var offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--ios-kb-offset', offset + 'px');
    if (offset > 50) {
      document.body.classList.add('ios-kb-open');
    } else {
      document.body.classList.remove('ios-kb-open');
    }
  }

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  // Run once after layout settles so the variable is defined even before
  // the keyboard ever opens.
  setTimeout(update, 0);

  // Auto-scroll the focused input into view. Works around the case where
  // the input itself isn't inside a fixed bar but is below the keyboard.
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    var tag = t.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && !t.isContentEditable) return;
    // Defer until the keyboard has begun opening so visualViewport has
    // already shrunk — gives scrollIntoView the right target rect.
    setTimeout(function () {
      try {
        t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_) {
        try { t.scrollIntoView(); } catch (_) {}
      }
    }, 250);
  });
})();
