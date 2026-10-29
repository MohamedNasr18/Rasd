import type { Metadata, Viewport } from 'next';
import { Cairo, JetBrains_Mono } from 'next/font/google';
import StoreProvider from '@/store/StoreProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { LOCALES, LOCALE_DIR, toLocale, type Locale } from '@/i18n/config';
import { dictionaries } from '@/i18n/dictionaries';
import { SITE_URL } from '@/lib/site';
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

const DEFAULT_META = dictionaries.en.meta;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_META.title,
  description: DEFAULT_META.description,
  applicationName: dictionaries.en.common.brand,
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: dictionaries.en.common.brand,
    title: DEFAULT_META.title,
    description: DEFAULT_META.description,
    images: [{ url: '/og.png', width: 1792, height: 1024 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f9f9ff',
};

function structuredData(locale: Locale) {
  const dict = dictionaries[locale];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: dict.common.brand,
      alternateName: locale === 'ar' ? 'Rasd' : 'رصد',
      url: SITE_URL,
      logo: `${SITE_URL}/og.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: dict.common.brand,
      url: `${SITE_URL}/${locale}`,
      inLanguage: locale,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: dict.common.brand,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/${locale}`,
      description: dict.meta.description,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];
}

export default async function RootLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const locale = toLocale((await params).lang);

  return (
    <html lang={locale} dir={LOCALE_DIR[locale]}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        {structuredData(locale).map((block, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, '\\u003c') }}
          />
        ))}
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
          <StoreProvider>
            <AuthProvider>{children}</AuthProvider>
          </StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
