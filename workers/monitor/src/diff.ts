// What changed between two readings, and whether the domain got worse. The rules are the same
// as posture-watch's, so the two monitors never disagree about "worse": a record dropping
// (pass to warn or fail, warn to fail) or the verdict falling is a degradation; a move to or
// from the informational status is a change; an incomplete reading is skipped by the caller.
import type { Snapshot, CheckId, Status } from './snapshot.ts';
import { CHECK_IDS } from './snapshot.ts';

const RANK: Partial<Record<Status, number>> = { fail: 0, warn: 1, pass: 2 };
const LEVEL: Partial<Record<Snapshot['level'], number>> = { weak: 0, partial: 1, strong: 2 };

export interface Change {
  check: CheckId | 'verdict';
  from: string;
  to: string;
  direction: 'degraded' | 'improved' | 'changed';
}
export interface Diff {
  degraded: boolean;
  changes: Change[];
  levelFrom: Snapshot['level'];
  levelTo: Snapshot['level'];
}

export function compare(prev: Snapshot, curr: Snapshot): Diff {
  const changes: Change[] = [];
  let degraded = false;
  for (const id of CHECK_IDS) {
    const a = prev.checks[id];
    const b = curr.checks[id];
    if (!a || !b || a === b) continue;
    const ra = RANK[a];
    const rb = RANK[b];
    if (ra !== undefined && rb !== undefined) {
      const direction = rb < ra ? 'degraded' : 'improved';
      if (direction === 'degraded') degraded = true;
      changes.push({ check: id, from: a, to: b, direction });
    } else {
      changes.push({ check: id, from: a, to: b, direction: 'changed' });
    }
  }
  const la = LEVEL[prev.level];
  const lb = LEVEL[curr.level];
  if (la !== undefined && lb !== undefined && lb < la) {
    degraded = true;
    changes.push({ check: 'verdict', from: prev.level, to: curr.level, direction: 'degraded' });
  }
  return { degraded, changes, levelFrom: prev.level, levelTo: curr.level };
}
