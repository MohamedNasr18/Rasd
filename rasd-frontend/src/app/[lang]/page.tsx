import type { Metadata } from 'next';
import HomeView from '@/components/HomeView';
import { toLocale, type Locale } from '@/i18n/config';
import { dictionaries } from '@/i18n/dictionaries';

type LocaleParams = { params: Promise<{ lang: string }> };

const OG_LOCALE: Record<Locale, string> = { ar: 'ar_EG', en: 'en_US' };
const OG_IMAGE = { url: '/og.png', width: 1792, height: 1024 };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = toLocale((await params).lang);
  const dict = dictionaries[locale];
  const path = `/${locale}`;

  return {
    title: dict.meta.title,
    description: dict.meta.description,
    applicationName: dict.common.brand,
    alternates: {
      canonical: path,
      languages: {
        ar: '/ar',
        en: '/en',
        'x-default': '/ar',
      },
    },
    openGraph: {
      type: 'website',
      siteName: dict.common.brand,
      title: dict.meta.title,
      description: dict.meta.description,
      url: path,
      locale: OG_LOCALE[locale],
      alternateLocale: locale === 'ar' ? ['en_US'] : ['ar_EG'],
      images: [{ ...OG_IMAGE, alt: dict.meta.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: dict.meta.title,
      description: dict.meta.description,
      images: ['/og.png'],
    },
    robots: { index: true, follow: true },
  };
}

export default function HomePage() {
  return <HomeView />;
}
