import type { Metadata } from 'next';
import { Cairo, JetBrains_Mono } from 'next/font/google';
import StoreProvider from '@/store/StoreProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { LOCALES, LOCALE_DIR, toLocale } from '@/i18n/config';
import { dictionaries } from '@/i18n/dictionaries';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains',
});

type LocaleParams = { params: Promise<{ lang: string }> };

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const dict = dictionaries[locale];

  return {
    title: dict.meta.title,
    description: dict.meta.description,
  };
}

export default async function RootLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const locale = toLocale((await params).lang);

  return (
    <html lang={locale} dir={LOCALE_DIR[locale]}>
      <head>
        {/* Material Symbols icon font — must be in <head> for correct glyph rendering */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body
        className={`${cairo.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily: 'var(--font-cairo), Cairo, sans-serif',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-on-surface)',
        }}
      >
        <I18nProvider locale={locale}>
          <StoreProvider>{children}</StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
