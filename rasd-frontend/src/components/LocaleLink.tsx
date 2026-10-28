'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { localePath } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

type LocaleLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

export default function LocaleLink({ href, ...rest }: LocaleLinkProps) {
  const { locale } = useI18n();
  return <Link href={localePath(locale, href)} {...rest} />;
}
