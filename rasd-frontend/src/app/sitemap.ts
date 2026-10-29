import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const LANGUAGES = {
  ar: `${SITE_URL}/ar`,
  en: `${SITE_URL}/en`,
  'x-default': `${SITE_URL}/ar`,
};

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/ar`,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: { languages: LANGUAGES },
    },
    {
      url: `${SITE_URL}/en`,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: { languages: LANGUAGES },
    },
  ];
}
