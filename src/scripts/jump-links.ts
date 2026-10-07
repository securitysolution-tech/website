// Sections below the first screen render lazily (content-visibility: auto), so until they render their
// heights are estimates. A smooth scroll that crosses them would land in the wrong place, so the first
// time someone follows an in-page link, everything is rendered before the browser starts scrolling.
document.addEventListener(
  'click',
  (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.hash.length < 2) return;
    if (link.origin !== location.origin || link.pathname !== location.pathname) return;
    document.documentElement.classList.add('rendered');
  },
  { capture: true },
);
