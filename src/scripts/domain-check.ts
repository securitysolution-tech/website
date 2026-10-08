import { DomainNotFoundError, runChecks, type Result, type Status, type Verdict } from './checks';
import { normaliseDomain } from './dns';
import { reduceMotion, scrollToElement } from './navigate';

const labels: Record<Status, string> = { pass: 'Pass', warn: 'Warning', fail: 'Fail', info: 'Info' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function init(root: HTMLElement) {
  const form = root.querySelector('form')!;
  const input = root.querySelector<HTMLInputElement>('input[name="domain"]')!;
  const button = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const error = root.querySelector<HTMLElement>('[data-error]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]');
  const list = root.querySelector<HTMLOListElement>('[data-results]')!;
  const target = root.querySelector<HTMLElement>('[data-target]')!;
  const targetName = root.querySelector<HTMLElement>('[data-target-name]')!;
  const targetOwn = root.querySelector<HTMLElement>('[data-target-own]')!;
  const ownDomain = root.dataset.autorun ?? '';
  const verdict = root.querySelector<HTMLElement>('[data-verdict]')!;
  const announce = root.querySelector<HTMLElement>('[data-announce]')!;

  const rows = new Map<string, HTMLLIElement>();
  list.querySelectorAll<HTMLLIElement>('[data-check]').forEach((li) => rows.set(li.dataset.check!, li));

  // "Show record" reads "Hide record" while the evidence is open.
  rows.forEach((li) => {
    const evidence = li.querySelector<HTMLDetailsElement>('[data-evidence]');
    const summary = evidence?.querySelector('summary');
    if (evidence && summary) {
      evidence.addEventListener('toggle', () => {
        summary.textContent = evidence.open ? 'Hide record' : 'Show record';
      });
    }
  });

  const icon = (name: string) => {
    const tpl = root.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`);
    return tpl?.content.firstElementChild?.cloneNode(true) ?? null;
  };

  function setState(li: HTMLLIElement, state: 'idle' | 'checking', text: string) {
    li.dataset.status = state;
    li.classList.remove('revealed');
    li.querySelector('[data-icon-slot]')!.replaceChildren();
    li.querySelector('[data-summary]')!.textContent = text;
    li.querySelector('[data-badge]')!.textContent = state === 'checking' ? 'Checking…' : 'Not run';
    const evidence = li.querySelector<HTMLDetailsElement>('[data-evidence]')!;
    evidence.hidden = true;
    evidence.open = false;
  }

  function render(r: Result) {
    const li = rows.get(r.id);
    if (!li) return;
    li.dataset.status = r.status;
    const slot = li.querySelector('[data-icon-slot]')!;
    const svg = icon(r.status);
    slot.replaceChildren(...(svg ? [svg] : []));
    li.querySelector('[data-summary]')!.textContent = r.summary;
    li.querySelector('[data-badge]')!.textContent = labels[r.status];
    const evidence = li.querySelector<HTMLDetailsElement>('[data-evidence]')!;
    evidence.querySelector('pre')!.textContent = r.evidence.join('\n');
    evidence.hidden = r.evidence.length === 0;
    li.classList.add('revealed');
  }

  // What to fix first: failures before warnings, in the order that matters most for email and DNS.
  const priority: Record<string, number> = { dmarc: 0, spf: 1, mtasts: 2, dnssec: 3, caa: 4 };
  const fix = root.querySelector<HTMLElement>('[data-fix]');
  const fixList = root.querySelector<HTMLOListElement>('[data-fix-list]');

  function showFixFirst(results: Result[]): number {
    if (!fix || !fixList) return 0;
    const items = results
      .filter((r) => (r.status === 'fail' || r.status === 'warn') && r.id in priority)
      .sort((a, b) => (a.status === b.status ? priority[a.id] - priority[b.id] : a.status === 'fail' ? -1 : 1));
    fixList.replaceChildren(
      ...items.map((r) => {
        const row = rows.get(r.id);
        const li = document.createElement('li');
        li.dataset.status = r.status;
        const strong = document.createElement('strong');
        strong.textContent = `${row?.dataset.title ?? r.id} (${row?.dataset.tech ?? r.id})`;
        li.append(strong, document.createTextNode(` ${r.summary}`));
        return li;
      }),
    );
    fix.hidden = items.length === 0;
    return items.length;
  }

  function showVerdict(domain: string, v: Verdict, results: Result[]) {
    const spoofing = v.incomplete ? 'Incomplete' : v.spoofing;
    verdict.querySelector('[data-spoofing]')!.textContent = spoofing;
    verdict.dataset.level = spoofing.toLowerCase();
    verdict.querySelector('[data-score]')!.textContent = v.incomplete
      ? 'Some lookups did not complete. Run the check again in a moment.'
      : `${v.passed} of ${v.scored} checks passed`;
    verdict.hidden = false;
    const count = v.incomplete ? 0 : showFixFirst(results);
    if (v.incomplete && fix) fix.hidden = true;
    announce.textContent = v.incomplete
      ? `Check incomplete for ${domain}. Some lookups did not complete. Run the check again in a moment.`
      : `Check complete for ${domain}. Spoofing protection is ${v.spoofing.toLowerCase()}. ${v.passed} of ${v.scored} checks passed.` +
        (count ? ` ${count} ${count === 1 ? 'item' : 'items'} to fix first.` : '');
    if (domain !== ownDomain) document.dispatchEvent(new CustomEvent('domaincheck', { detail: { domain } }));
  }

  function showError(message: string, canRetry = false) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    if (retry) retry.hidden = !canRetry;
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    if (retry) retry.hidden = true;
  }

  let runId = 0;
  let controller: AbortController | null = null;
  let shown = ''; // the domain whose results are on screen
  let lastRequested = '';

  // The autorun (our own domain on page load) never locks the form and fails silently:
  // a visitor's submit takes over at any moment, and the stale run is cancelled.
  async function run(domain: string, autorun = false) {
    const id = ++runId;
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    shown = '';
    if (!autorun) {
      lastRequested = domain;
      button.textContent = 'Checking…';
    }
    list.setAttribute('aria-busy', 'true');
    verdict.hidden = true;
    if (fix) fix.hidden = true;
    announce.textContent = '';
    targetName.textContent = domain;
    targetOwn.hidden = domain !== ownDomain;
    target.hidden = false;
    rows.forEach((li) => setState(li, 'checking', 'Looking this up…'));

    // Rows fill in one after another so the eye can follow the results. On page load the
    // first row waits for the instrument to finish rising, so the fill is actually seen.
    const holdUntil = autorun && !reduceMotion.matches ? performance.now() + 1100 : 0;
    let queue = Promise.resolve();
    const reveal = (r: Result) => {
      queue = queue.then(async () => {
        if (id !== runId) return;
        if (holdUntil > performance.now()) await wait(holdUntil - performance.now());
        if (id !== runId) return;
        render(r);
        if (!reduceMotion.matches) await wait(150);
      });
    };

    try {
      const { results, verdict: v } = await runChecks(domain, reveal, signal);
      await queue;
      if (id !== runId) return;
      shown = domain;
      showVerdict(domain, v, results);
    } catch (err) {
      if (id !== runId) return;
      rows.forEach((li) => setState(li, 'idle', li.dataset.about ?? ''));
      target.hidden = true;
      if (autorun) return;
      if (err instanceof DomainNotFoundError) {
        showError(`${domain} does not exist in DNS. Check the spelling and try again.`);
      } else {
        showError(
          'The DNS lookups could not be completed. Your network may block DNS-over-HTTPS, so try again on another connection.',
          true,
        );
      }
    } finally {
      if (id === runId) {
        button.textContent = 'Run check';
        list.setAttribute('aria-busy', 'false');
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const domain = normaliseDomain(input.value);
    if (!domain) {
      showError('Enter a domain name, for example yourcompany.ae.');
      input.focus();
      return;
    }
    clearError();
    input.value = domain;
    // Keep the result linkable. The fragment never leaves the browser, so the domain stays private.
    history.replaceState(null, '', `#check=${encodeURIComponent(domain)}`);
    run(domain);
  });

  retry?.addEventListener('click', () => {
    if (!lastRequested) return;
    clearError();
    run(lastRequested);
  });

  input.addEventListener('input', () => {
    if (!error.hidden) clearError();
  });

  const fromHash = () => {
    if (!location.hash.startsWith('#check=')) return null;
    try {
      return normaliseDomain(decodeURIComponent(location.hash.slice('#check='.length)));
    } catch {
      return null;
    }
  };
  const linked = fromHash();
  if (linked) {
    input.value = linked;
    requestAnimationFrame(() => scrollToElement(root, { immediate: true, focus: false }));
    run(linked);
  } else if (ownDomain) {
    // Show our own results on load, and leave the field empty for the visitor's domain.
    run(ownDomain, true);
  }

  // In-page links such as "/#check=example.com" only change the hash.
  window.addEventListener('hashchange', () => {
    const domain = fromHash();
    if (!domain) return;
    input.value = domain;
    clearError();
    scrollToElement(root, { focus: false });
    // Back and forward restore a fragment whose results may already be on screen.
    if (domain !== shown) run(domain);
  });
}

document.querySelectorAll<HTMLElement>('[data-domain-check]').forEach(init);
