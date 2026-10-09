// Signed, expiring tokens for the confirm and unsubscribe links: HMAC-SHA256 over a JSON
// payload with the Web Crypto API. No session and no lookup is needed to honour a link, and a
// link cannot be forged or altered without the secret.
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (str: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};
const keyFor = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export interface TokenPayload {
  act: 'verify' | 'unsubscribe';
  dom: string;
  eml: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

export async function sign(payload: TokenPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verify(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await keyFor(secret), unb64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(unb64url(body))) as TokenPayload;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (payload.act !== 'verify' && payload.act !== 'unsubscribe') return null;
    if (typeof payload.dom !== 'string' || typeof payload.eml !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}
