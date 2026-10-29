export const LOCALES = ['ar', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_COOKIE = 'rasd-locale';

export const LOCALE_DIR: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

export const INTL_LOCALE: Record<Locale, string> = {
  ar: 'ar-EG',
  en: 'en-GB',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localePath(locale: Locale, path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('#')) return path;
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export function switchLocale(pathname: string, target: Locale): string {
  const rest = pathname.split('/').filter(Boolean);
  if (isLocale(rest[0])) rest.shift();
  return `/${[target, ...rest].join('/')}`;
}
