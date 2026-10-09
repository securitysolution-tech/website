// Subscriptions in Workers KV: one record per domain and address, keyed by a hash so a list of
// keys reveals neither. Thin on purpose; the logic worth testing is pure and lives elsewhere.
import type { Snapshot } from './snapshot.ts';

export interface Subscription {
  domain: string;
  email: string;
  verified: boolean;
  createdAt: string;
  last?: Snapshot;
  lastNotifiedAt?: string;
}

export async function keyFor(domain: string, email: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${domain}|${email}`));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sub:${hex.slice(0, 40)}`;
}

export const get = (kv: KVNamespace, key: string) => kv.get<Subscription>(key, 'json');
export const put = (kv: KVNamespace, key: string, sub: Subscription) => kv.put(key, JSON.stringify(sub));
export const remove = (kv: KVNamespace, key: string) => kv.delete(key);

export async function listKeys(kv: KVNamespace): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'sub:', cursor });
    for (const k of page.keys) keys.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}
