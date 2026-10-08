// Locale helpers for the templates. English is the default at the root; Arabic lives at /ar/.
import type { AstroGlobal } from 'astro';
import { en, type Dictionary } from './en';
import { ar, arContent } from './ar';
import { arLive } from './locales.mjs';
import { services as serviceData, type Service } from '../data/services';
import { faqs as faqData, type FaqItem } from '../data/faq';
import { founders as founderData, type Founder } from '../data/site';

export type Locale = 'en' | 'ar';
export const locales: Locale[] = ['en', 'ar'];
export const defaultLocale: Locale = 'en';
export { arLive };

/** The text of a service that changes with the language; the rest is the spine in src/data. */
export type ServiceText = Pick<
  Service,
  'name' | 'plainName' | 'summary' | 'coverLead' | 'facts' | 'intro' | 'seoTitle' | 'seoDescription' | 'items' | 'deliverables' | 'goodFit' | 'note'
>;
export type FounderText = Pick<Founder, 'role' | 'bio' | 'highlights'> & { name?: string };

export interface Content {
  services: Record<string, ServiceText>;
  faqs: FaqItem[];
  founders: Record<string, FounderText>;
}

const dictionaries: Record<Locale, Dictionary> = { en, ar };
const content: Partial<Record<Locale, Content>> = { ar: arContent };

export const localeOf = (astro: Pick<AstroGlobal, 'currentLocale'>): Locale => (astro.currentLocale === 'ar' ? 'ar' : 'en');

export function getServices(locale: Locale): Service[] {
  const overlay = content[locale]?.services;
  return overlay ? serviceData.map((s) => ({ ...s, ...overlay[s.slug] })) : serviceData;
}

export function getFaqs(locale: Locale, page: string): FaqItem[] {
  return (content[locale]?.faqs ?? faqData).filter((f) => f.on.includes(page));
}

export function getFounders(locale: Locale): Founder[] {
  const overlay = content[locale]?.founders;
  return overlay ? founderData.map((f) => ({ ...f, ...overlay[f.id] })) : founderData;
}

export function useI18n(astro: Pick<AstroGlobal, 'currentLocale' | 'url'>) {
  const locale = localeOf(astro);
  const t = dictionaries[locale];
  const path = astro.url.pathname;
  /** A site path in this locale: href('/privacy/') is /privacy/ in English and /ar/privacy/ in Arabic. */
  const href = (path: string) => (locale === 'en' ? path : `/ar${path}`);
  const otherLocale: Locale = locale === 'en' ? 'ar' : 'en';
  /** The same page in the other language. */
  const switchHref = locale === 'en' ? `/ar${path}` : path.replace(/^\/ar(?=\/)/, '') || '/';
  return {
    locale,
    t,
    href,
    cta: { label: t.site.cta, href: href('/#contact') },
    isHome: path === href('/'),
    /** True while the locale is built but not yet linked or indexed. */
    hidden: locale !== 'en' && !arLive,
    /** The language toggle, shown once Arabic is live. Its label is in the language it leads to. */
    toggle: arLive ? { href: switchHref, lang: otherLocale, label: otherLocale === 'ar' ? 'العربية' : 'English' } : null,
    /** Addresses of this page in each language, for hreflang links. */
    alternates: { en: locale === 'en' ? path : switchHref, ar: locale === 'ar' ? path : switchHref },
    services: getServices(locale),
    founders: getFounders(locale),
    faqsFor: (page: string) => getFaqs(locale, page),
  };
}
