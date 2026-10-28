export const LANGUAGES = ['ar', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ar';

/** Anything other than an explicit "en" keeps the Arabic behaviour. */
export function toLanguage(value: string | undefined | null): Language {
  return value === 'en' ? 'en' : DEFAULT_LANGUAGE;
}
