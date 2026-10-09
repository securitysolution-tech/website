import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutomated, isHosting, parseAgent } from '../src/traffic.ts';

const PEOPLE = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  duckduckgo:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 DuckDuckGo/7 Safari/604.1',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  linkedinApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30',
};

const MACHINES = {
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  headless:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
  lighthouse:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  curl: 'curl/8.5.0',
  python: 'python-requests/2.31.0',
  go: 'Go-http-client/2.0',
  node: 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  zap: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 ZAP/2.15',
  empty: '',
};

test('real browsers are not treated as automation', () => {
  for (const [name, ua] of Object.entries(PEOPLE)) assert.equal(isAutomated(ua), false, name);
});

test('crawlers, headless browsers, scanners and library clients are', () => {
  for (const [name, ua] of Object.entries(MACHINES)) assert.equal(isAutomated(ua), true, name);
});

test('an implausibly short or long User-Agent is automation', () => {
  assert.equal(isAutomated('Mozilla/5.0'), true);
  assert.equal(isAutomated('a'.repeat(600)), true);
});

test('the browser, system and device are read from the agent', () => {
  const classes = (name) => parseAgent(PEOPLE[name]);
  assert.deepEqual(classes('chromeWindows'), { browser: 'chrome', os: 'windows', device: 'desktop' });
  assert.deepEqual(classes('safariIphone'), { browser: 'safari', os: 'ios', device: 'mobile' });
  assert.deepEqual(classes('safariMac'), { browser: 'safari', os: 'macos', device: 'desktop' });
  assert.deepEqual(classes('firefoxLinux'), { browser: 'firefox', os: 'linux', device: 'desktop' });
  assert.deepEqual(classes('edgeWindows'), { browser: 'edge', os: 'windows', device: 'desktop' });
  assert.deepEqual(classes('chromeAndroid'), { browser: 'chrome', os: 'android', device: 'mobile' });
  assert.deepEqual(classes('androidTablet'), { browser: 'chrome', os: 'android', device: 'tablet' });
  assert.deepEqual(classes('ipad'), { browser: 'safari', os: 'ios', device: 'tablet' });
  assert.deepEqual(classes('samsung'), { browser: 'samsung', os: 'android', device: 'mobile' });
  assert.deepEqual(classes('chromeOs'), { browser: 'chrome', os: 'chromeos', device: 'desktop' });
  assert.deepEqual(classes('chromeIos'), { browser: 'chrome', os: 'ios', device: 'mobile' });
  assert.deepEqual(parseAgent('something unrecognisable entirely'), {
    browser: 'other',
    os: 'other',
    device: 'desktop',
  });
});

test('hosting networks are recognised, people on ordinary networks are not', () => {
  assert.equal(isHosting(16509), true); // Amazon
  assert.equal(isHosting(24940), true); // Hetzner
  assert.equal(isHosting(5384), false); // an ordinary UAE network
  assert.equal(isHosting(13335), false); // Cloudflare WARP users are people
  assert.equal(isHosting(undefined), false);
  assert.equal(isHosting('16509'), false);
});
