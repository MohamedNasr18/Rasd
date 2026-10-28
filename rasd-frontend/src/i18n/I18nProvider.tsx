'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { LOCALE_DIR, type Locale } from './config';
import { dictionaries, type Dictionary } from './dictionaries';

interface I18nValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  dict: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{ locale, dir: LOCALE_DIR[locale], dict: dictionaries[locale] }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside an I18nProvider');
  return value;
}
