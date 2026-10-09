// Counts this page view with the site's own counter (workers/visits). No cookie and nothing stored
// about the visitor, no third party: one small POST to our own domain, sent only from the real site,
// never when the browser asks not to be tracked, and never in a way that can slow or break the page.
//
// The page address, the referring site's name (or "internal" when the visitor was already here) and
// the campaign tag in the link (?ref=name) are all it sends. ?visits=off in the address switches
// counting off in this browser, ?visits=on switches it back on.
import { site, visits } from '../data/site';

const IGNORE_KEY = 'ss-ignore-visits';

function applySwitch(): void {
  const url = new URL(location.href);
  const choice = url.searchParams.get('visits');
  if (choice !== 'off' && choice !== 'on') return;
  try {
    if (choice === 'off') localStorage.setItem(IGNORE_KEY, '1');
    else localStorage.removeItem(IGNORE_KEY);
  } catch {
    // Storage is blocked: the switch has nothing to remember it in, so it does nothing.
  }
  url.searchParams.delete('visits');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** True for automation, a privacy signal, or a browser the visitor switched counting off in. */
function declined(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  if (nav.webdriver || nav.globalPrivacyControl === true) return true;
  const dnt = [nav.doNotTrack, nav.msDoNotTrack, win.doNotTrack];
  if (dnt.some((value) => value === '1' || value === 'yes')) return true;
  try {
    return localStorage.getItem(IGNORE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The site the visitor came from, or whether they were already on this one. */
function referrer(): { r: string; i: 0 | 1 } {
  if (!document.referrer) return { r: '', i: 0 };
  try {
    const from = new URL(document.referrer);
    if (from.origin === location.origin) return { r: '', i: 1 };
    if (from.protocol === 'https:' || from.protocol === 'http:')
      return { r: from.hostname.replace(/^www\./, ''), i: 0 };
  } catch {
    // An unreadable referrer counts as none.
  }
  return { r: '', i: 0 };
}

function send(): void {
  const params = new URLSearchParams(location.search);
  const body = JSON.stringify({
    p: location.pathname,
    ...referrer(),
    c: (params.get('ref') ?? params.get('utm_source') ?? '').slice(0, 32),
  });
  // A plain string goes as text/plain, which needs no preflight. Failure is ignored on purpose.
  if (navigator.sendBeacon?.(visits.endpoint, body)) return;
  fetch(visits.endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
}

/** Counts once the page is actually in front of someone: not prerendered, not in a background tab. */
function whenSeen(run: () => void): void {
  const doc = document as Document & { prerendering?: boolean };
  const attempt = (): void => {
    if (doc.prerendering) return document.addEventListener('prerenderingchange', attempt, { once: true });
    if (document.visibilityState !== 'visible') {
      return document.addEventListener('visibilitychange', attempt, { once: true });
    }
    // In idle time, so counting never competes with the first paint.
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
  };
  attempt();
}

// Only the real site counts (a preview, a local build and the CI audit never do), unless a test build
// asks for it with PUBLIC_VISITS=1.
if (visits.live && (location.hostname === new URL(site.url).hostname || import.meta.env.PUBLIC_VISITS === '1')) {
  applySwitch();
  if (!declined()) whenSeen(send);
}
