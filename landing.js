/* ==========================================
   ZipMee Landing — landing.js
   Minimal: navbar scroll, hamburger, reveal.
   ========================================== */

(function () {
  'use strict';

  // ─── NAVBAR ───────────────────────────────
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', function () {
    navbar.style.boxShadow = window.scrollY > 10
      ? '0 2px 8px rgba(0,0,0,0.12)'
      : 'none';
  }, { passive: true });

  // ─── HAMBURGER ────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function () {
      mobileNav.classList.toggle('open');
    });

    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileNav.classList.remove('open');
      });
    });
  }

  // ─── SMOOTH SCROLL ────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── SCROLL REVEAL ────────────────────────
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.step, .feature-table tbody tr, .cta-inner').forEach(function (el) {
    el.classList.add('reveal');
    io.observe(el);
  });

})();
