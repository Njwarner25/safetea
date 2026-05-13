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
//   5. Inline-translates EVERY element that is `position: fixed` or
//      `position: sticky` and anchored to the bottom of the viewport —
//      this catches compose bars and primary CTAs even when the page
//      author didn't add a specific class.
//   6. Auto-scrolls the focused input into the visible portion of the
//      viewport (belt-and-suspenders).
//
// How to consume in a page's CSS (optional — the JS now also handles
// untagged fixed-bottom elements inline):
//
//   body.ios-kb-open { padding-bottom: var(--ios-kb-offset, 0px); }
//   .compose, [data-kb-shift] {
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

  // Track elements we've inline-shifted so we can restore them.
  var shifted = new Map(); // Map<Element, originalTransform>

  function discoverBottomFixedElements() {
    // Find every <body> descendant that's position:fixed or position:sticky
    // AND anchored within the bottom 60% of the viewport. We exclude top
    // bars + center modals so we only shift things the keyboard would cover.
    var result = [];
    var els = document.querySelectorAll('*');
    var vh = window.innerHeight;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      // Heuristic: element's bottom edge must land in the lower 40% of
      // the viewport — that's where the keyboard would cover.
      if (r.bottom < vh * 0.6) continue;
      // Skip elements that fill most of the viewport (likely modals
      // or full-screen overlays — they have their own layout).
      if (r.height > vh * 0.7) continue;
      result.push(el);
    }
    return result;
  }

  function applyShift(offset) {
    if (offset > 0) {
      var els = discoverBottomFixedElements();
      els.forEach(function (el) {
        if (!shifted.has(el)) {
          shifted.set(el, el.style.transform || '');
        }
        var t = shifted.get(el);
        el.style.transform =
          (t ? t + ' ' : '') +
          'translateY(' + (-offset) + 'px)';
        el.style.transition = 'transform 0.15s ease-out';
      });
    } else {
      shifted.forEach(function (originalTransform, el) {
        el.style.transform = originalTransform;
      });
      shifted.clear();
    }
  }

  function update() {
    var offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--ios-kb-offset', offset + 'px');
    if (offset > 50) {
      document.body.classList.add('ios-kb-open');
      applyShift(offset);
    } else {
      document.body.classList.remove('ios-kb-open');
      applyShift(0);
    }
  }

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  setTimeout(update, 0);

  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    var tag = t.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && !t.isContentEditable) return;
    setTimeout(function () {
      try {
        t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_) {
        try { t.scrollIntoView(); } catch (_) {}
      }
    }, 250);
  });

  document.addEventListener('focusout', function () {
    setTimeout(update, 100);
  });
})();
