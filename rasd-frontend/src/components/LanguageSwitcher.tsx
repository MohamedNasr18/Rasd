'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, LOCALES, switchLocale, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

const LABELS: Record<Locale, string> = { ar: 'AR', en: 'EN' };

function rememberLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export default function LanguageSwitcher() {
  const { locale, dict } = useI18n();
  const pathname = usePathname();

  return (
    <div
      role="group"
      aria-label={dict.language.switcher}
      className="language-switcher"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        backgroundColor: 'var(--color-surface-container-low)',
        border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
        flexShrink: 0,
      }}
    >
      {LOCALES.map((option) => {
        const isActive = option === locale;
        return (
          <Link
            key={option}
            href={switchLocale(pathname, option)}
            onClick={() => rememberLocale(option)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              lineHeight: '16px',
              letterSpacing: '0.02em',
              textDecoration: 'none',
              color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: isActive
                ? 'var(--color-surface-container-lowest)'
                : 'transparent',
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              transition: 'color 0.15s, background-color 0.15s',
            }}
          >
            <span>{LABELS[option]}</span>
          </Link>
        );
      })}
    </div>
  );
}
