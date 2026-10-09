// What a request says about the visitor, and whether it is a person at all. It is read from the
// User-Agent and the network and never stored: only the coarse classes below leave this module.

export type Browser = 'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'other';
export type System = 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'chromeos' | 'other';
export type Device = 'desktop' | 'mobile' | 'tablet';
export interface Agent {
  browser: Browser;
  os: System;
  device: Device;
}

// The counter runs in a script, so most crawlers never reach it. These are the ones that do:
// search engines that render pages, headless browsers, uptime and speed checkers, scanners, and
// command-line or library clients posting to the endpoint directly. Real browsers (including
// DuckDuckGo's and the in-app ones) carry none of these tokens.
const AUTOMATED = new RegExp(
  [
    'bot\\b',
    'crawl',
    'spider',
    'slurp',
    'archiv',
    'headless',
    'phantom',
    'puppeteer',
    'playwright',
    'selenium',
    'lighthouse',
    'pagespeed',
    'gtmetrix',
    'pingdom',
    'uptime',
    'monitor',
    'statuscake',
    'site24x7',
    'zabbix',
    'nagios',
    'datadog',
    'newrelic',
    'curl',
    'wget',
    'python',
    'aiohttp',
    'httpx',
    'requests',
    'okhttp',
    'java/',
    'apache-http',
    'go-http',
    'node-fetch',
    'undici',
    'axios',
    'libwww',
    'perl',
    'ruby',
    'php',
    'scrapy',
    'nutch',
    'fetch',
    'preview',
    'embedly',
    'facebookexternalhit',
    'bingpreview',
    'semrush',
    'ahrefs',
    'mj12',
    'petalbot',
    'bytespider',
    'gptbot',
    'claude',
    'anthropic',
    'ccbot',
    'perplexity',
    'amazonbot',
    'applebot',
    'qualys',
    'nessus',
    'nikto',
    'sqlmap',
    'zgrab',
    'masscan',
    'nmap',
    'censys',
    'shodan',
    'expanse',
    'scanner',
    'probe',
    'zap\\b',
    'burp',
    'owasp',
  ].join('|'),
  'i',
);

/** True for an empty, implausible or machine User-Agent. */
export const isAutomated = (userAgent: string): boolean =>
  userAgent.length < 30 || userAgent.length > 512 || AUTOMATED.test(userAgent);

// Networks that rent out servers. Automation lives here; people almost never browse from them.
// Mobile and home networks, Cloudflare's WARP and Apple's Private Relay are deliberately absent.
const HOSTING = new Set([
  16509,
  14618, // Amazon
  15169,
  396982, // Google Cloud
  8075, // Microsoft Azure (also the scanners that follow links in company email)
  14061, // DigitalOcean
  24940, // Hetzner
  16276, // OVH
  63949, // Akamai Connected Cloud (Linode)
  31898, // Oracle Cloud
  45102, // Alibaba Cloud
  132203,
  45090, // Tencent Cloud
  20473, // Vultr
  51167, // Contabo
  12876, // Scaleway
  60781, // Leaseweb
]);

/** True when the request came from a hosting network. `asn` is Cloudflare's `request.cf.asn`. */
export const isHosting = (asn: unknown): boolean => typeof asn === 'number' && HOSTING.has(asn);

/** The coarse class of the browser, system and device. Order matters: most agents name several. */
export function parseAgent(ua: string): Agent {
  const os: System = /iPhone|iPad|iPod/.test(ua)
    ? 'ios'
    : /Android/.test(ua)
      ? 'android'
      : /CrOS/.test(ua)
        ? 'chromeos'
        : /Windows/.test(ua)
          ? 'windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'macos'
            : /Linux|X11/.test(ua)
              ? 'linux'
              : 'other';

  const browser: Browser = /Edg(?:e|A|iOS)?\//.test(ua)
    ? 'edge'
    : /OPR\/|Opera|OPT\//.test(ua)
      ? 'opera'
      : /SamsungBrowser\//.test(ua)
        ? 'samsung'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'chrome'
            : /Version\/[\d.]+.*Safari\//.test(ua)
              ? 'safari'
              : 'other';

  const device: Device =
    /iPad|Tablet|PlayBook|Silk/.test(ua) || (os === 'android' && !/Mobile/.test(ua))
      ? 'tablet'
      : /Mobi|iPhone|iPod|Android/.test(ua)
        ? 'mobile'
        : 'desktop';

  return { browser, os, device };
}
