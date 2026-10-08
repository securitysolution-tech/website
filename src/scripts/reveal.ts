// Scroll choreography that does not depend on CSS scroll-driven animations.
// Where the browser has them, the CSS does the work and this file only runs the
// navigation scroll-spy. Elsewhere it marks elements as they enter the viewport so
// the same reveals, the process line and the header lift play through transitions.
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollDriven = CSS.supports('animation-timeline: view()');

if (!scrollDriven) {
  if (!reduce) {
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
    document
      .querySelectorAll('.scores .cell, .bento .card, .finding, .people .person, .items .item, .steps')
      .forEach((el) => reveal.observe(el));
  }

  // A one-pixel sentinel at the top tells the header when the page has scrolled.
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
  const setActive = (link: HTMLAnchorElement | null) => {
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
      const current = sections.find((pair) => visible.has(pair.section));
      setActive(current ? current.link : null);
    },
    { rootMargin: '-35% 0px -55% 0px' },
  );
  sections.forEach((pair) => spy.observe(pair.section));
  addEventListener('resize', () => {
    const active = links.find((l) => l.hasAttribute('aria-current'));
    if (active) setActive(active);
  });
}
