// Counting a visitor once a day without knowing who they are. The id is an HMAC of the day, the
// network and the browser under a secret only the Worker holds. It cannot be turned back into an
// address, it differs every day (so nothing links one day's visitor to the next), and the daily
// run deletes it after a day. The address and the User-Agent themselves are never stored.
const encoder = new TextEncoder();

/** The calendar day in Dubai (UTC+4, no daylight saving), so the dashboard's days match the founders'. */
export const dubaiDay = (now: Date): string => new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);

/** The day `days` before the given one, as YYYY-MM-DD. */
export function daysBefore(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

export async function visitorId(secret: string, day: string, network: string, userAgent: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${day}\n${network}\n${userAgent}`));
  return Array.from(new Uint8Array(mac).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
