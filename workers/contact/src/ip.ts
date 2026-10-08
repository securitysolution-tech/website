// Turns the connecting address into a rate-limit key: the whole IPv4 address, or the /64
// of an IPv6 address, since one subscriber usually holds a whole /64 and can hop within it.

const hex = (group: string) => parseInt(group || '0', 16).toString(16);

/** The first four groups of an IPv6 address written out in full, or null if it does not parse. */
export function ipv6Prefix(address: string): string | null {
  // An IPv4-mapped address (::ffff:203.0.113.9) is really IPv4.
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map(hex).join(':');
}

export function clientKey(address: string | null): string {
  if (!address) return 'unknown';
  const ip = address.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1]!;
  const prefix = ipv6Prefix(ip);
  return prefix ? `${prefix}::/64` : 'unknown';
}
