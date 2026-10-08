// A short departure fade for browsers without cross-document view transitions, so
// moving between pages feels continuous everywhere. Browsers that have the real thing
// (they expose PageRevealEvent) use the @view-transition rule in the stylesheet instead.
if (!('PageRevealEvent' in window) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.protocol !== location.protocol) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    event.preventDefault();
    document.documentElement.classList.add('leaving');
    setTimeout(() => {
      location.href = url.href;
    }, 140);
  });

  // Coming back through the back-forward cache restores the faded page; undo the fade.
  addEventListener('pageshow', (event) => {
    if (event.persisted) document.documentElement.classList.remove('leaving');
  });
}
