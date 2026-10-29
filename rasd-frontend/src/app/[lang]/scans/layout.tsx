import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scan result | Rasd',
  robots: { index: false, follow: false },
};

export default function ScansLayout({ children }: { children: React.ReactNode }) {
  return children;
}
