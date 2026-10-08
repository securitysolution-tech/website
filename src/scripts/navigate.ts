// Navigation, in one place: inertia scrolling, in-page anchors and page departures.
// Lenis smooths wheel scrolling on fine-pointer devices when motion is allowed (touch stays
// native). Links to an element on the same page scroll through it, or natively, and move
// keyboard focus to the target. Where the browser has no cross-document view transitions,
// leaving a page fades the content out. The "#check=" fragments the domain check listens
// for are left to the browser, except that clicking the same fragment again replays it.
import Lenis from 'lenis';

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lenis = reduceMotion.matches || !finePointer ? null : new Lenis({ lerp: 0.1, autoRaf: false, anchors: false });

// Lenis only needs frames while it is moving. The loop wakes on input and sleeps a few
// frames after the last movement, so an idle page costs nothing.
let frame = 0;
let idle = 0;
function tick(now: number) {
  frame = 0;
  if (!lenis) return;
  lenis.raf(now);
  idle = lenis.isScrolling ? 0 : idle + 1;
  if (idle < 20) frame = requestAnimationFrame(tick);
}
function wake() {
  if (lenis && !frame) {
    idle = 0;
    frame = requestAnimationFrame(tick);
  }
}
if (lenis) {
  addEventListener('wheel', wake, { passive: true });
  addEventListener('scroll', wake, { passive: true });
  addEventListener('keydown', wake, { passive: true });
  wake();
}

/** Scrolls an element to the top of the viewport (the page's scroll-padding keeps it below the header). */
export function scrollToElement(el: HTMLElement, options: { immediate?: boolean; focus?: boolean } = {}) {
  const immediate = options.immediate || reduceMotion.matches;
  if (lenis) {
    wake();
    lenis.scrollTo(el, { immediate });
  } else el.scrollIntoView({ block: 'start', behavior: immediate ? 'auto' : 'smooth' });
  if (options.focus !== false) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
}

const hasViewTransitions = 'PageRevealEvent' in window;

function linkFrom(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  // The skip link keeps its native behaviour, which also moves keyboard focus.
  if (!link || link.target || link.hasAttribute('download') || link.classList.contains('skip-link')) return null;
  return link;
}

document.addEventListener('click', (event) => {
  const link = linkFrom(event);
  if (!link) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.protocol !== location.protocol) return;

  if (url.pathname === location.pathname && url.search === location.search) {
    if (url.hash.length < 2) return;
    if (url.hash.startsWith('#check=')) {
      // The same fragment again fires no hashchange, so replay it for the domain check.
      if (url.hash === location.hash) {
        event.preventDefault();
        dispatchEvent(new HashChangeEvent('hashchange'));
      }
      return;
    }
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    } catch {
      return;
    }
    if (!target) return;
    event.preventDefault();
    if (url.hash !== location.hash) history.pushState(null, '', url.hash);
    scrollToElement(target);
    return;
  }

  // Leaving for another page: a short fade of the content, never of the header.
  if (hasViewTransitions || reduceMotion.matches || !url.pathname.endsWith('/')) return;
  event.preventDefault();
  document.documentElement.classList.add('leaving');
  location.href = url.href;
  // If the navigation never replaces the page (stopped, or a download), the page comes back.
  setTimeout(() => document.documentElement.classList.remove('leaving'), 1500);
});

// Coming back through the back-forward cache restores the faded page; undo the fade.
addEventListener('pageshow', (event) => {
  if (event.persisted) document.documentElement.classList.remove('leaving');
});

// Arriving with a fragment: land below the header instead of under it.
if (location.hash.length > 1 && !location.hash.startsWith('#check=')) {
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {
    target = null;
  }
  if (target) requestAnimationFrame(() => scrollToElement(target, { immediate: true, focus: false }));
}
