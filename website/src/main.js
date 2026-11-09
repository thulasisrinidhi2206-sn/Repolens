const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

function closeNavigation() {
  if (!navToggle || !navLinks) return;
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation menu');
  navLinks.classList.remove('is-open');
}

navToggle?.addEventListener('click', () => {
  const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isExpanded));
  navToggle.setAttribute('aria-label', isExpanded ? 'Open navigation menu' : 'Close navigation menu');
  navLinks?.classList.toggle('is-open', !isExpanded);
});

navLinks?.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', closeNavigation);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNavigation();
});

document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const command = button.getAttribute('data-copy');
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      button.textContent = 'Copied';
    } catch (error) {
      console.error('Unable to copy the setup command:', error);
      button.textContent = 'Copy failed';
    }

    window.setTimeout(() => {
      button.textContent = 'Copy';
    }, 1800);
  });
});

const currentYear = document.querySelector('#current-year');
if (currentYear) currentYear.textContent = String(new Date().getFullYear());

const revealElements = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  document.documentElement.classList.add('has-reveal');
  revealElements.forEach(element => revealObserver.observe(element));
}
