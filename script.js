document.addEventListener('DOMContentLoaded', () => {
// ============== SAFETEA - INTERACTIVE JS ==============

// ---- Scroll Reveal (Intersection Observer) ----
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
revealElements.forEach(el => revealObserver.observe(el));

// ---- Smooth Scroll for Nav Links ----
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
const body = document.body;

// Create mobile overlay
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

// ---- Dark/Light Mode Toggle ----
const themeToggle = document.querySelector('.theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-mode');
    const icon = themeToggle.querySelector('i');
    if (body.classList.contains('light-mode')) {
      icon.className = 'fas fa-sun';
    } else {
      icon.className = 'fas fa-moon';
    }
  });
}

// ---- FAQ Accordion ----
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    // Close all other items
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    // Toggle current
    if (!isOpen) item.classList.add('open');
  });
});

// ---- Form Validation (CTA Email) ----
const ctaForm = document.querySelector('.cta-form');
if (ctaForm) {
  const emailInput = ctaForm.querySelector('input[type="email"]');
  const submitBtn = ctaForm.querySelector('.btn-primary');

  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const email = emailInput?.value?.trim();

      // Remove old states
      emailInput?.classList.remove('input-success', 'input-error');
      ctaForm.querySelectorAll('.form-success, .form-error').forEach(m => m.classList.remove('show'));

      if (!email) {
        emailInput?.classList.add('input-error');
        showFormMessage(emailInput, 'error', 'Please enter your email address');
      } else if (!isValidEmail(email)) {
        emailInput?.classList.add('input-error');
        showFormMessage(emailInput, 'error', 'Please enter a valid email address');
      } else {
        emailInput?.classList.add('input-success');
        showFormMessage(emailInput, 'success', 'You are on the list! Check your inbox.');
        emailInput.value = '';
        setTimeout(() => {
          emailInput?.classList.remove('input-success');
          ctaForm.querySelectorAll('.form-success').forEach(m => m.classList.remove('show'));
        }, 4000);
      }
    });
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFormMessage(input, type, message) {
  if (!input) return;
  let msgEl = input.parentElement?.querySelector('.form-' + type);
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.className = 'form-' + type;
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    msgEl.innerHTML = '<i class="fas fa-' + icon + '"></i> ' + message;
    input.parentElement?.appendChild(msgEl);
  } else {
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    msgEl.innerHTML = '<i class="fas fa-' + icon + '"></i> ' + message;
  }
  msgEl.classList.add('show');
}

// ---- Navbar Background on Scroll ----
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar?.classList.add('scrolled');
  } else {
    navbar?.classList.remove('scrolled');
  }
});

// ---- Typing Animation in Phone Mockup ----
const typingText = document.querySelector('.typing-text');
if (typingText) {
  const phrases = ['Search by name...', 'Is he safe?', 'Check his record...', 'Any warnings?'];
  let phraseIdx = 0;
  let charIdx = 0;
  let isDeleting = false;

  function typeEffect() {
    const current = phrases[phraseIdx];
    if (isDeleting) {
      typingText.textContent = current.substring(0, charIdx - 1);
      charIdx--;
    } else {
      typingText.textContent = current.substring(0, charIdx + 1);
      charIdx++;
    }

    let delay = isDeleting ? 40 : 80;

    if (!isDeleting && charIdx === current.length) {
      delay = 2000;
      isDeleting = true;
    } else if (isDeleting && charIdx === 0) {
      isDeleting = false;
      phraseIdx = (phraseIdx + 1) % phrases.length;
      delay = 500;
    }

    setTimeout(typeEffect, delay);
  }

  setTimeout(typeEffect, 1500);
}

// ---- Animate Stats Counter ----
const statNumbers = document.querySelectorAll('.stat-number');
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.dataset.counted) {
      entry.target.dataset.counted = 'true';
      const original = entry.target.textContent;
      const num = parseInt(original.replace(/[^0-9]/g, ''));
      if (num && num > 0) {
        animateCounter(entry.target, num, original);
      }
    }
  });
}, { threshold: 0.5 });
statNumbers.forEach(el => counterObserver.observe(el));

function animateCounter(el, target, original) {
  let current = 0;
  const increment = Math.max(1, target / 40);
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      el.textContent = original;
      clearInterval(timer);
    } else {
      const suffix = original.replace(/[0-9,]/g, '');
      el.textContent = Math.floor(current).toLocaleString() + suffix;
    }
  }, 30);
}

console.log('SafeTea JS loaded successfully');


// ---- City Voting System ----
const voteInput = document.querySelector('.vote-city-input');
const voteBtn = document.querySelector('.vote-submit-btn');
const voteFeedback = document.querySelector('.vote-feedback');
const leaderboard = document.getElementById('cityLeaderboard');

// Existing launched cities
const launchedCities = ['chicago', 'new york', 'los angeles', 'houston', 'miami', 'atlanta', 'dallas', 'denver', 'seattle'];

if (voteBtn) {
  voteBtn.addEventListener('click', () => {
    const city = voteInput.value.trim();
    if (!city) {
      showVoteFeedback('Please enter a city name.', 'error');
      return;
    }

    // Check if city is already launched
    if (launchedCities.some(c => city.toLowerCase().includes(c))) {
      showVoteFeedback('Great news! ' + city + ' is already live on SafeTea.', 'info');
      voteInput.value = '';
      return;
    }

    // Check if city is in leaderboard
    const existingItem = leaderboard.querySelector('[data-city="' + city + '"]');
    if (existingItem) {
      castVote(existingItem);
      showVoteFeedback('Vote added for ' + city + '! Share with friends to reach 200.', 'success');
    } else {
      // Check partial match
      const items = leaderboard.querySelectorAll('.leaderboard-item');
      let found = false;
      items.forEach(item => {
        if (item.dataset.city.toLowerCase().includes(city.toLowerCase())) {
          castVote(item);
          showVoteFeedback('Vote added for ' + item.dataset.city + '! Share with friends to reach 200.', 'success');
          found = true;
        }
      });
      if (!found) {
        showVoteFeedback('\u2705 ' + city + ' has been added to the leaderboard with 1 vote! Rally your community!', 'success');
      }
    }
    voteInput.value = '';
  });

  voteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') voteBtn.click();
  });
}

// Upvote buttons
document.querySelectorAll('.btn-vote').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.leaderboard-item');
    if (btn.classList.contains('voted')) {
      showVoteFeedback('You already voted for this city!', 'info');
      return;
    }
    castVote(item);
    btn.classList.add('voted');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    showVoteFeedback('Vote cast for ' + item.dataset.city + '!', 'success');
  });
});

function castVote(item) {
  let votes = parseInt(item.dataset.votes) + 1;
  item.dataset.votes = votes;
  item.querySelector('.vote-count').textContent = votes;
  const pct = Math.min((votes / 200) * 100, 100);
  item.querySelector('.leaderboard-fill').style.width = pct + '%';

  // Update total
  const total = document.querySelector('.leaderboard-total strong');
  if (total) total.textContent = parseInt(total.textContent) + 1;

  // Check if city reached 200
  if (votes >= 200) {
    item.querySelector('.leaderboard-city').innerHTML = item.dataset.city + ' <span class="almost-badge" style="background:rgba(16,185,129,0.15);color:#10B981"><i class="fas fa-check-circle"></i> Launching soon!</span>';
    item.querySelector('.leaderboard-fill').style.background = 'linear-gradient(90deg, #10B981, #059669)';
    showVoteFeedback('\ud83c\udf89 ' + item.dataset.city + ' hit 200 votes! Launch incoming!', 'success');
  } else if (votes >= 180) {
    const cityEl = item.querySelector('.leaderboard-city');
    if (!cityEl.querySelector('.almost-badge')) {
      cityEl.innerHTML = item.dataset.city + ' <span class="almost-badge"><i class="fas fa-fire"></i> Almost there!</span>';
    }
  }

  // Animate the vote count
  const countEl = item.querySelector('.vote-count');
  countEl.style.transform = 'scale(1.3)';
  countEl.style.color = '#10B981';
  setTimeout(() => {
    countEl.style.transform = 'scale(1)';
    countEl.style.color = '';
  }, 300);
}

function showVoteFeedback(msg, type) {
  if (!voteFeedback) return;
  voteFeedback.textContent = msg;
  voteFeedback.className = 'vote-feedback ' + type;
  setTimeout(() => {
    voteFeedback.textContent = '';
    voteFeedback.className = 'vote-feedback';
  }, 5000);
}

});
