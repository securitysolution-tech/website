import { DomainNotFoundError, runChecks, type Result, type Status, type Verdict } from './checks';
import { normaliseDomain } from './dns';

const labels: Record<Status, string> = { pass: 'Pass', warn: 'Warning', fail: 'Fail', info: 'Info' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function init(root: HTMLElement) {
  const form = root.querySelector('form')!;
  const input = root.querySelector<HTMLInputElement>('input[name="domain"]')!;
  const button = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const error = root.querySelector<HTMLElement>('[data-error]')!;
  const list = root.querySelector<HTMLOListElement>('[data-results]')!;
  const target = root.querySelector<HTMLElement>('[data-target]')!;
  const targetName = root.querySelector<HTMLElement>('[data-target-name]')!;
  const verdict = root.querySelector<HTMLElement>('[data-verdict]')!;
  const announce = root.querySelector<HTMLElement>('[data-announce]')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const rows = new Map<string, HTMLLIElement>();
  list.querySelectorAll<HTMLLIElement>('[data-check]').forEach((li) => rows.set(li.dataset.check!, li));

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

  function showVerdict(domain: string, v: Verdict) {
    verdict.querySelector('[data-spoofing]')!.textContent = v.spoofing;
    verdict.dataset.level = v.spoofing.toLowerCase();
    verdict.querySelector('[data-score]')!.textContent = `${v.passed} of ${v.scored} checks passed`;
    verdict.hidden = false;
    announce.textContent = `Check complete for ${domain}. Spoofing protection is ${v.spoofing.toLowerCase()}. ${v.passed} of ${v.scored} checks passed.`;
  }

  function showError(message: string) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  let runId = 0;

  async function run(domain: string) {
    const id = ++runId;
    button.disabled = true;
    button.textContent = 'Checking…';
    list.setAttribute('aria-busy', 'true');
    verdict.hidden = true;
    announce.textContent = '';
    targetName.textContent = domain;
    target.hidden = false;
    rows.forEach((li) => setState(li, 'checking', 'Looking this up…'));

    // Rows fill in one after another so the eye can follow the results.
    let queue = Promise.resolve();
    const reveal = (r: Result) => {
      queue = queue.then(async () => {
        if (id !== runId) return;
        render(r);
        if (!reduce.matches) await wait(150);
      });
    };

    try {
      const { verdict: v } = await runChecks(domain, reveal);
      await queue;
      if (id === runId) showVerdict(domain, v);
    } catch (err) {
      if (id !== runId) return;
      rows.forEach((li) => setState(li, 'idle', li.dataset.about ?? ''));
      target.hidden = true;
      showError(
        err instanceof DomainNotFoundError
          ? `${domain} does not exist in DNS. Check the spelling and try again.`
          : 'The DNS lookups could not be completed. Your network may block DNS-over-HTTPS, so try again on another connection.',
      );
    } finally {
      if (id === runId) {
        button.disabled = false;
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
  const autorun = linked ?? root.dataset.autorun;
  if (autorun) {
    input.value = autorun;
    if (linked) root.scrollIntoView({ block: 'start' });
    run(autorun);
  }

  // In-page links such as "/#check=example.com" only change the hash.
  window.addEventListener('hashchange', () => {
    const domain = fromHash();
    if (!domain) return;
    input.value = domain;
    clearError();
    root.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
    run(domain);
  });
}

document.querySelectorAll<HTMLElement>('[data-domain-check]').forEach(init);
