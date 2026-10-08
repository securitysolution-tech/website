// Shared by the client scripts and the components that hand them their strings. The
// dictionaries themselves never reach the browser: a component renders the strings a
// script needs as a JSON data block, and the script reads it from the page.
import type { Dictionary } from './en';

export type CheckStrings = Pick<
  Dictionary['check'],
  | 'labels'
  | 'levels'
  | 'score'
  | 'incompleteScore'
  | 'announceDone'
  | 'announceIncomplete'
  | 'fixOne'
  | 'fixMany'
  | 'errors'
  | 'summaries'
  | 'show'
  | 'hide'
  | 'notRun'
  | 'checking'
  | 'looking'
  | 'run'
>;

/** The strings domain-check.ts and checks.ts read from the page. */
export const checkStrings = (c: Dictionary['check']): CheckStrings => ({
  labels: c.labels,
  levels: c.levels,
  score: c.score,
  incompleteScore: c.incompleteScore,
  announceDone: c.announceDone,
  announceIncomplete: c.announceIncomplete,
  fixOne: c.fixOne,
  fixMany: c.fixMany,
  errors: c.errors,
  summaries: c.summaries,
  show: c.show,
  hide: c.hide,
  notRun: c.notRun,
  checking: c.checking,
  looking: c.looking,
  run: c.run,
});
export type ContactStrings = Dictionary['contact']['script'];

/** Fills {name} placeholders. */
export const fmt = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));

/** Reads the data block a component rendered, for example data-i18n="check". */
export function readStrings<T>(name: string): T {
  const block = document.querySelector<HTMLScriptElement>(`script[data-i18n="${name}"]`);
  return JSON.parse(block?.textContent || '{}') as T;
}

/** Serialises strings for a data block; "<" is escaped so the block can never close itself. */
export const toJsonBlock = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
