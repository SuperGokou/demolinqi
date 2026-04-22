// site/js/script.js — nav, reveal, scroll highlight
(() => {
  const nav = document.querySelector('.nav');
  const onScrollNav = () => nav?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  // Active nav-link highlighting based on section in view
  const links = document.querySelectorAll('.nav-links a[href^="#"]');
  const map = new Map();
  links.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const sec = document.getElementById(id);
    if (sec) map.set(sec, a);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(a => a.classList.remove('active'));
        map.get(e.target)?.classList.add('active');
      }
    });
  }, { threshold: 0.3 });
  map.forEach((_, sec) => io.observe(sec));

  // Reveal on scroll (opacity only)
  const revealables = document.querySelectorAll('.reveal');
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('on');
        revealIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  revealables.forEach(el => revealIO.observe(el));

  // Fire hero reveal on initial load
  requestAnimationFrame(() => {
    document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('on'));
  });
})();
