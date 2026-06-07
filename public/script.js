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

  // ---- Scroll Reveal ----
  const revealElements = document.querySelectorAll('.section, .hero');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    revealObserver.observe(el);
  });

  // Make hero visible immediately
  const hero = document.querySelector('.hero');
  if (hero) {
    hero.style.opacity = '1';
    hero.style.transform = 'translateY(0)';
  }

  // ---- Smooth Scroll ----
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector('.navbar').offsetHeight;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
        window.scrollTo({ top: targetPos, behavior: 'smooth' });
        // Close mobile menu if open
        document.querySelector('.nav-links')?.classList.remove('open');
        document.querySelector('.hamburger')?.classList.remove('active');
        document.querySelector('.mobile-overlay')?.classList.remove('active');
      }
    });
  });

  // ---- Hamburger Menu ----
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');

  const overlay = document.createElement('div');
  overlay.className = 'mobile-overlay';
  document.body.appendChild(overlay);

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
      overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  // ---- Navbar on Scroll ----
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  });

});
