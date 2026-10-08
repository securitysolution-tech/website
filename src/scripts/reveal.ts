// Scroll choreography that does not depend on CSS scroll-driven animations, and the
// navigation scroll-spy. Where the browser has scroll-driven animations, the CSS does the
// reveals and this file only drives the scroll-spy (and the header's frosted state under
// reduced motion). Elsewhere it marks elements as they enter the viewport so the same
// reveals, the process line and the header lift play through transitions.
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollDriven = CSS.supports('animation-timeline: view()');

if (!scrollDriven && !reduce) {
  root.classList.add('io');
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0 },
  );
  document.querySelectorAll('[data-reveal], .steps').forEach((el) => reveal.observe(el));
}

// A one-pixel sentinel at the top tells the header when the page has scrolled. The frosted
// bar is information rather than motion, so reduced-motion visitors get it this way too.
if (!scrollDriven || reduce) {
  const sentinel = document.createElement('div');
  sentinel.className = 'top-sentinel';
  document.body.prepend(sentinel);
  const header = document.querySelector('.site-header');
  new IntersectionObserver(([entry]) => header?.classList.toggle('scrolled', !entry.isIntersecting)).observe(sentinel);
}

// Scroll-spy: the navigation marks the section in view, and the desktop list slides its underline there.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav-desktop ul a[href*="#"]')];
const menuLinks = [...document.querySelectorAll<HTMLAnchorElement>('.menu-panel ul a[href*="#"]')];
const sections = links
  .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
  .filter((pair): pair is { link: HTMLAnchorElement; section: HTMLElement } => pair.section !== null);

if (sections.length) {
  const list = links[0].closest<HTMLElement>('ul')!;
  const visible = new Set<Element>();
  let current: HTMLAnchorElement | null = null;
  let holdUntil = 0; // after a click the clicked item stays active until the scroll settles

  const setActive = (link: HTMLAnchorElement | null) => {
    current = link;
    for (const l of [...links, ...menuLinks]) {
      if (link && l.hash === link.hash) l.setAttribute('aria-current', 'location');
      else l.removeAttribute('aria-current');
    }
    if (link) {
      list.style.setProperty('--ul-x', `${link.offsetLeft}px`);
      list.style.setProperty('--ul-w', String(link.offsetWidth));
      list.classList.add('has-active');
    } else {
      list.classList.remove('has-active');
    }
  };

  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      if (performance.now() < holdUntil) return;
      const found = sections.find((pair) => visible.has(pair.section));
      if (found) setActive(found.link);
      // Between sections (the reports, for example) the last item stays lit; above the first, nothing is.
      else if (current && scrollY + innerHeight * 0.35 < sections[0].section.offsetTop) setActive(null);
    },
    { rootMargin: '-35% 0px -55% 0px' },
  );
  sections.forEach((pair) => spy.observe(pair.section));

  for (const link of links) {
    link.addEventListener('click', () => {
      setActive(link);
      holdUntil = performance.now() + 1500;
    });
  }
  addEventListener('scrollend', () => {
    holdUntil = 0;
  });

  const remeasure = () => {
    if (current) setActive(current);
  };
  addEventListener('resize', remeasure);
  document.fonts?.ready.then(remeasure);
  new ResizeObserver(remeasure).observe(list);
}
