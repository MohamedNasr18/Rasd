import { INTL_LOCALE, type Locale } from './config';

type DateOptions = Intl.DateTimeFormatOptions;

export function formatDateTime(locale: Locale, value: string, options?: DateOptions) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(new Date(value));
}

export function formatDateMedium(locale: Locale, value: string) {
  return formatDateTime(locale, value, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDateOnly(locale: Locale, value: string) {
  return formatDateTime(locale, value, { dateStyle: 'medium' });
}

export function formatDateShort(locale: Locale, value: string) {
  return formatDateTime(locale, value, { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDayMonth(locale: Locale, value: string) {
  return formatDateTime(locale, value, { day: 'numeric', month: 'short' });
}

export function formatClock(locale: Locale, value: string) {
  return formatDateTime(locale, value, { hour: '2-digit', minute: '2-digit' });
}
