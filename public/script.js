// Capacitor (Android app) branding override.
// The website serves the unified LinkHer/LinkHer Rebrand3 logo, but the
// Android Capacitor wrapper should show LinkHer-only branding. The
// safetea-mobile RN iOS app handles its own assets natively, so this only
// fires on Android (Capacitor injects window.Capacitor in the WebView).
(function () {
  if (typeof window === 'undefined' || !window.Capacitor) return;

  function applyLinkHerBranding() {
    document.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (/(^|\/)logo\.png(\?|$)/.test(src)) {
        img.src = src.replace(/logo\.png/, 'logo-safetea.png');
        img.style.mixBlendMode = 'normal';
        img.style.maskImage = 'none';
        img.style.webkitMaskImage = 'none';
      } else if (src.indexOf('linkher-safetea-banner') !== -1) {
        // Hero/banner image is the unified marketing graphic — fall back to
        // the LinkHer-only SVG illustration on Android.
        img.src = 'images/hero-illustration.svg';
        img.style.mixBlendMode = 'normal';
        img.style.maskImage = 'none';
        img.style.webkitMaskImage = 'none';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLinkHerBranding);
  } else {
    applyLinkHerBranding();
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Content remains visible even if animation APIs or JavaScript fail.
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-enter');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0 });
    document.querySelectorAll('.section').forEach(el => observer.observe(el));
  }

  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  const mobile = window.matchMedia('(max-width: 768px)');
  let closeMenu = () => {};

  if (hamburger && navLinks) {
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    navLinks.id = navLinks.id || 'primary-navigation';
    hamburger.setAttribute('aria-controls', navLinks.id);
    let isOpen = false;
    let previousOverflow = '';

    function setMenu(open, restoreFocus = false) {
      if (open && !isOpen) previousOverflow = document.body.style.overflow;
      if (open) document.body.style.overflow = 'hidden';
      else if (isOpen) document.body.style.overflow = previousOverflow;
      isOpen = open;
      hamburger.classList.toggle('active', open);
      navLinks.classList.toggle('open', open);
      overlay.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) navLinks.querySelector('a[href]')?.focus();
      else if (restoreFocus) hamburger.focus();
    }
    closeMenu = restoreFocus => setMenu(false, restoreFocus);
    setMenu(false);
    hamburger.addEventListener('click', () => setMenu(!isOpen));
    overlay.addEventListener('click', () => closeMenu(true));
    navLinks.addEventListener('click', event => {
      if (event.target.closest('a[href]')) closeMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === 'Tab') {
        const items = [...navLinks.querySelectorAll('a[href]'), hamburger]
          .filter(el => el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    });
    const onResize = () => { if (!mobile.matches) closeMenu(false); };
    if (mobile.addEventListener) mobile.addEventListener('change', onResize);
    else mobile.addListener(onResize);
  }

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href');
      if (hash === '#') return;
      let target;
      try { target = document.getElementById(decodeURIComponent(hash.slice(1))); }
      catch (_) { return; }
      if (!target) return;
      event.preventDefault();
      closeMenu(false);
      const navHeight = document.querySelector('.navbar')?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
      window.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  const navbar = document.querySelector('.navbar');
  const onScroll = () => navbar?.classList.toggle('scrolled', window.scrollY > 50);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
