// Inertia scrolling and in-page navigation.
// Lenis smooths wheel scrolling (touch stays native) and is off under reduced motion.
// Links to an element on the same page scroll with the sticky header accounted for;
// every other link, including the "#check=" fragments the domain check listens for,
// is left to the browser.
import Lenis from 'lenis';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lenis = reduce ? null : new Lenis({ lerp: 0.1, autoRaf: true, anchors: false });

// The page's scroll-padding-top already keeps targets below the sticky header, and Lenis honours it.
function scrollToElement(el: HTMLElement, immediate = false) {
  if (lenis) lenis.scrollTo(el, { immediate });
  else el.scrollIntoView({ block: 'start', behavior: immediate ? 'auto' : 'smooth' });
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  // The skip link must keep its native behaviour, which also moves keyboard focus.
  if (!link || link.target || link.hasAttribute('download') || link.classList.contains('skip-link')) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  } catch {
    return;
  }
  if (!target) return;
  event.preventDefault();
  history.pushState(null, '', url.hash);
  scrollToElement(target);
});

// Arriving with a fragment: land below the header instead of under it.
if (location.hash.length > 1 && !location.hash.startsWith('#check=')) {
  const target = document.getElementById(location.hash.slice(1));
  if (target) requestAnimationFrame(() => scrollToElement(target, true));
}
