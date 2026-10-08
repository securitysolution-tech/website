// The security readiness self-check, in the browser. Reads the answers, scores them with the
// same function the tests cover (src/data/readiness.ts), and shows the result. Nothing is
// sent or stored. CSP-clean: strings come from a JSON block, text is set with textContent.
import { questions, score, type Answer, type Band } from '../data/readiness';
import { readStrings } from '../i18n/client';

interface Strings {
  result: string;
  of: string;
  progress: string;
  bands: Record<Band, string>;
  bandNote: Record<Band, string>;
}

function init(root: HTMLElement) {
  const t = readStrings<Strings>('readiness');
  const form = root.querySelector<HTMLFormElement>('[data-quiz]');
  const result = root.querySelector<HTMLElement>('[data-result]');
  if (!form || !result) return;

  const el = {
    label: root.querySelector<HTMLElement>('[data-result-label]'),
    score: root.querySelector<HTMLElement>('[data-score]'),
    of: root.querySelector<HTMLElement>('[data-of]'),
    band: root.querySelector<HTMLElement>('[data-band]'),
    bandNote: root.querySelector<HTMLElement>('[data-band-note]'),
    progress: root.querySelector<HTMLElement>('[data-progress]'),
    start: root.querySelector<HTMLElement>('[data-start]'),
    startList: root.querySelector<HTMLOListElement>('[data-start-list]'),
    hint: root.querySelector<HTMLElement>('[data-hint]'),
  };

  // Each question's wording and its service link, read from the DOM, for the "start here" list.
  const meta = new Map<string, { text: string; href: string }>();
  for (const q of questions) {
    const field = form.querySelector<HTMLElement>(`[data-q="${q.id}"]`);
    const legend = field?.querySelector('legend');
    const text = legend ? (legend.textContent ?? '').replace(/^\s*\d+\s*/, '').trim() : q.id;
    meta.set(q.id, { text, href: field?.dataset.href ?? '#' });
  }

  const fmt = (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

  function update() {
    const answers: Partial<Record<string, Answer>> = {};
    for (const q of questions) {
      const checked = form!.querySelector<HTMLInputElement>(`input[name="q-${q.id}"]:checked`);
      if (checked) answers[q.id] = checked.value as Answer;
    }
    const r = score(answers);
    if (r.answered === 0) {
      result!.hidden = true;
      if (el.hint) el.hint.hidden = false;
      return;
    }
    result!.hidden = false;
    if (el.hint) el.hint.hidden = true;
    result!.dataset.level = r.band;
    if (el.label) el.label.textContent = t.result;
    if (el.score) el.score.textContent = String(r.score);
    if (el.of) el.of.textContent = t.of;
    if (el.band) el.band.textContent = t.bands[r.band];
    if (el.bandNote) el.bandNote.textContent = t.bandNote[r.band];
    if (el.progress) el.progress.textContent = fmt(t.progress, { answered: r.answered, total: r.total });

    if (el.start && el.startList) {
      if (r.startHere.length) {
        el.startList.replaceChildren(
          ...r.startHere.map((id) => {
            const info = meta.get(id)!;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = info.href;
            a.textContent = info.text;
            li.append(a);
            return li;
          }),
        );
        el.start.hidden = false;
      } else {
        el.start.hidden = true;
      }
    }
  }

  form.addEventListener('change', update);
}

document.querySelectorAll<HTMLElement>('[data-readiness]').forEach(init);
