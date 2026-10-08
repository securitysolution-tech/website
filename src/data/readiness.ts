// The security readiness self-check: a browser-only questionnaire that returns a score and
// the areas to start with. The questions' wording lives in the dictionaries (src/i18n); this
// file holds the structure, the weights and the scoring, which are pure and unit-tested.
//
// It makes no claim to be a certification. It is a starting self-assessment across the
// control families that matter most for a UAE company, each pointing at the service that
// helps with it.

export type Answer = 'yes' | 'partly' | 'no';
export type Band = 'strong' | 'developing' | 'at-risk';

export interface Question {
  id: string;
  /** How much this control weighs in the score. */
  weight: number;
  /** The service that helps most with it, for the "start here" links. */
  service: 'offensive-testing' | 'defensive-operations' | 'governance-compliance' | 'ai-cloud-security';
}

// The order is the order shown. Weights: the controls that stop the most common incidents
// (account takeover, ransomware, spoofing, unpatched entry) weigh most.
export const questions: Question[] = [
  { id: 'mfa', weight: 3, service: 'defensive-operations' },
  { id: 'accounts', weight: 2, service: 'governance-compliance' },
  { id: 'patching', weight: 3, service: 'defensive-operations' },
  { id: 'backups', weight: 3, service: 'defensive-operations' },
  { id: 'email', weight: 2, service: 'defensive-operations' },
  { id: 'endpoint', weight: 2, service: 'defensive-operations' },
  { id: 'monitoring', weight: 2, service: 'defensive-operations' },
  { id: 'incident', weight: 2, service: 'defensive-operations' },
  { id: 'awareness', weight: 2, service: 'governance-compliance' },
  { id: 'data', weight: 2, service: 'governance-compliance' },
  { id: 'vendors', weight: 1, service: 'governance-compliance' },
  { id: 'testing', weight: 3, service: 'offensive-testing' },
];

const value: Record<Answer, number> = { yes: 1, partly: 0.5, no: 0 };

export interface Result {
  /** 0 to 100. */
  score: number;
  band: Band;
  /** Answered questions, as a fraction of all, so a partial run is clear. */
  answered: number;
  total: number;
  /** The ids to start with: the weakest answers by weight, worst first, up to three. */
  startHere: string[];
}

/**
 * Scores the answers given so far. Unanswered questions are not counted against the score,
 * so the result is fair as the visitor fills it in; `answered` says how complete it is.
 */
export function score(answers: Partial<Record<string, Answer>>): Result {
  let got = 0;
  let max = 0;
  let answered = 0;
  for (const q of questions) {
    const a = answers[q.id];
    if (!a) continue;
    answered += 1;
    got += value[a] * q.weight;
    max += q.weight;
  }
  const pct = max === 0 ? 0 : Math.round((got / max) * 100);
  const band: Band = pct >= 75 ? 'strong' : pct >= 40 ? 'developing' : 'at-risk';
  const startHere = questions
    .filter((q) => answers[q.id] && answers[q.id] !== 'yes')
    .sort((a, b) => value[answers[a.id]!] * a.weight - value[answers[b.id]!] * b.weight || b.weight - a.weight)
    .slice(0, 3)
    .map((q) => q.id);
  return { score: pct, band, answered, total: questions.length, startHere };
}
