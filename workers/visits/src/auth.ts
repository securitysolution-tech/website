// The dashboard's sign-in: HTTP Basic with a fixed user name and one secret password. Both sides
// are hashed first so the comparison runs over equal-length bytes, and the user name and password
// are always both compared, so the time taken says nothing about which was wrong.
export const USER = 'visits';
export const REALM = 'SecuritySolution.tech visits';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const digest = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

function same(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ (b[i] ?? 0);
  return difference === 0;
}

/** The user name and password in an `Authorization: Basic` header, or null when it is not one. */
export function credentials(header: string | null): { user: string; password: string } | null {
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header?.trim() ?? '');
  if (!match) return null;
  let decoded: string;
  try {
    decoded = decoder.decode(Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  const split = decoded.indexOf(':');
  return split < 0 ? null : { user: decoded.slice(0, split), password: decoded.slice(split + 1) };
}

/** True when the header carries the dashboard's user name and the secret password. */
export async function authorised(header: string | null, secret: string): Promise<boolean> {
  const given = credentials(header);
  if (!given || !secret) return false;
  const [user, expectedUser, password, expectedPassword] = await Promise.all([
    digest(given.user),
    digest(USER),
    digest(given.password),
    digest(secret),
  ]);
  const userOk = same(user, expectedUser);
  const passwordOk = same(password, expectedPassword);
  return userOk && passwordOk;
}
